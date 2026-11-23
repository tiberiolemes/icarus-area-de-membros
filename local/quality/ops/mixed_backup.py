"""Native mixed-engine capture, run only after this site's writers are drained."""

import argparse
import gzip
import json
import os
import shutil
import signal
import subprocess
import tarfile
import time
from contextlib import contextmanager
from pathlib import Path

import site_probe


def config():
	values = json.loads((site_probe.SITES / "common_site_config.json").read_text())
	values.update(json.loads((site_probe.SITES / site_probe.SITE / "site_config.json").read_text()))
	return values


def connect(values, timeout=5):
	import pymysql

	return pymysql.connect(
		host=values["db_host"],
		port=int(values.get("db_port", 3306)),
		user=values.get("db_user") or values["db_name"],
		password=values["db_password"],
		database=values["db_name"],
		autocommit=False,
		connect_timeout=min(timeout, 5),
		read_timeout=timeout,
		write_timeout=min(timeout, 5),
		charset="utf8mb4",
	)


def expired(*_):
	raise TimeoutError("Mixed-engine lock budget expired")


@contextmanager
def read_locks(values, wait_seconds=5, hold_seconds=60):
	if not 1 <= wait_seconds <= 30 or not 1 <= hold_seconds <= 120:
		raise ValueError("Lock wait must be 1..30s and hold 1..120s")
	if signal.getitimer(signal.ITIMER_REAL)[0]:
		raise ValueError("Cannot replace an existing operation deadline")
	lock = connect(values, wait_seconds + hold_seconds + 3)
	try:
		control = connect(values, 2)
	except BaseException:
		lock.close()
		raise
	connection_id = lock.thread_id()
	previous_alarm = signal.signal(signal.SIGALRM, expired)
	previous_term = signal.signal(signal.SIGTERM, expired)
	started = time.monotonic()
	proof = {
		"lock_type": "READ",
		"wait_limit_seconds": wait_seconds,
		"hold_limit_seconds": hold_seconds,
		"released": False,
	}
	try:
		signal.setitimer(signal.ITIMER_REAL, wait_seconds + 1)
		with lock.cursor() as cursor:
			cursor.execute("SELECT @@innodb_table_locks, @@autocommit")
			if cursor.fetchone() != (1, 0):
				raise ValueError("InnoDB table locks require innodb_table_locks=1 and autocommit=0")
			cursor.execute("SHOW VARIABLES LIKE 'wsrep_on'")
			row = cursor.fetchone()
			if row and str(row[1]).upper() not in ("OFF", "0"):
				raise ValueError("Galera is outside this procedure")
			cursor.execute("SHOW FULL TABLES")
			tables = [row[0] for row in cursor.fetchall()]
			if not tables:
				raise ValueError("Refusing an empty database")
			quoted_db = "`" + values["db_name"].replace("`", "``") + "`"
			clauses = [quoted_db + ".`" + table.replace("`", "``") + "` READ" for table in tables]
			# A separate connection holds READ, never READ LOCAL, across dump AND files.
			cursor.execute("LOCK TABLES " + ",".join(clauses) + f" WAIT {wait_seconds}")
		proof["wait_elapsed_seconds"] = round(time.monotonic() - started, 3)
		proof["tables_locked"] = len(tables)
		held = time.monotonic()
		signal.setitimer(signal.ITIMER_REAL, hold_seconds)
		yield proof
		proof["hold_elapsed_seconds"] = round(time.monotonic() - held, 3)
	finally:
		signal.setitimer(signal.ITIMER_REAL, 0)
		# A control connection cancels even a server-side lock wait after socket failure.
		try:
			with control.cursor() as cursor:
				cursor.execute(
					"SELECT COUNT(*) FROM information_schema.processlist WHERE id=%s", (connection_id,)
				)
				if cursor.fetchone()[0]:
					control.kill(connection_id)
				deadline = time.monotonic() + 2
				while True:
					cursor.execute(
						"SELECT COUNT(*) FROM information_schema.processlist WHERE id=%s", (connection_id,)
					)
					if not cursor.fetchone()[0]:
						proof["released"] = True
						break
					if time.monotonic() >= deadline:
						raise RuntimeError("Lock release could not be verified")
					time.sleep(0.02)
		finally:
			lock.close()
			control.close()
			signal.signal(signal.SIGALRM, previous_alarm)
			signal.signal(signal.SIGTERM, previous_term)


def save(path, value):
	with path.open("x") as output:
		os.fchmod(output.fileno(), 0o600)
		json.dump(value, output, indent=2)
		output.flush()
		os.fsync(output.fileno())


def capture(output, *, writers_paused=False, wait_seconds=5, hold_seconds=60):
	if not writers_paused:
		raise ValueError("The integrator must pause and drain this site's writers first")
	os.umask(0o077)
	output.mkdir(mode=0o700, parents=True, exist_ok=False)
	values = config()
	with connect(values) as drained:
		with drained.cursor() as cursor:
			cursor.execute("SELECT COUNT(*) FROM information_schema.processlist WHERE db=DATABASE() AND id<>CONNECTION_ID()")
			if cursor.fetchone()[0]:
				raise ValueError("Site connections remain; writer drain unproven")
	with read_locks(values, wait_seconds, hold_seconds) as proof:
		before = {"tables": site_probe.database(allow_nontransactional=True), "files": site_probe.files()}
		save(output / "source-before.json", before)
		command = [
			"mariadb-dump",
			"--no-defaults",
			"--host=" + values["db_host"],
			"--port=" + str(values.get("db_port", 3306)),
			"--user=" + (values.get("db_user") or values["db_name"]),
			"--quick",
			"--hex-blob",
			"--routines",
			"--events",
			"--triggers",
			"--skip-lock-tables",
			values["db_name"],
		]
		environment = dict(os.environ, MYSQL_PWD=values["db_password"])
		with (output / "database.sql").open("xb") as sql, (output / "dump-stderr.log").open("xb") as error:
			subprocess.run(
				command, env=environment, stdout=sql, stderr=error, timeout=hold_seconds, check=True
			)
		with tarfile.open(output / "site.tar.gz", "w:gz") as archive:
			for relative in (
				f"{site_probe.SITE}/public/files",
				f"{site_probe.SITE}/private/files",
				f"{site_probe.SITE}/site_config.json",
				"common_site_config.json",
				"apps.txt",
			):
				archive.add(site_probe.SITES / relative, arcname=relative)
		after = {"tables": site_probe.database(allow_nontransactional=True), "files": site_probe.files()}
		save(output / "source-after.json", after)
		if before != after:
			raise ValueError("Source changed while writers were paused; capture rejected")
	if not proof["released"]:
		raise RuntimeError("Lock release not proven")
	with (
		(output / "database.sql").open("rb") as source,
		gzip.open(output / "database.sql.gz", "wb") as target,
	):
		shutil.copyfileobj(source, target)
	(output / "database.sql").unlink()  # This invocation's redundant, successfully compressed private dump.
	result = {
		"status": "verified_isolated_capture",
		"lock": proof,
		"source_stable": True,
		"dump_single_transaction": False,
		"dump_lock_tables": False,
		"writers_paused_asserted_by_integrator": True,
	}
	save(output / "mixed-capture.json", result)
	return result


if __name__ == "__main__":
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument("--output", type=Path, required=True)
	parser.add_argument("--writers-paused", action="store_true")
	parser.add_argument("--wait-seconds", type=int, default=5)
	parser.add_argument("--hold-seconds", type=int, default=60)
	args = parser.parse_args()
	print(
		json.dumps(
			capture(
				args.output,
				writers_paused=args.writers_paused,
				wait_seconds=args.wait_seconds,
				hold_seconds=args.hold_seconds,
			)
		)
	)
