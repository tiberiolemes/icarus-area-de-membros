"""Exercise mixed engines only in the disposable, internal restore laboratory."""

import gzip
import hashlib
import json
import os
import signal
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
from pathlib import Path
from unittest.mock import patch

import mixed_backup
import pymysql
import site_probe


def main():
	os.umask(0o077)
	values = mixed_backup.config()
	assert os.environ.get("TIBERIO_OPS_ISOLATED_LAB") == "1"
	assert values["db_host"].startswith("tiberio-quality-restore-")
	work = Path("/run/tiberio-ops/mixed-lab")
	work.mkdir(mode=0o700)
	connection = mixed_backup.connect(values)
	engines = ("InnoDB", "MyISAM", "Aria")
	tables = ["ops_mixed_" + engine.lower() for engine in engines]
	with connection.cursor() as cursor:
		for engine, table in zip(engines, tables, strict=True):
			cursor.execute(
				f"CREATE TABLE `{table}` (id INT PRIMARY KEY, content TEXT, progress INT, allowed INT) ENGINE={engine}"
			)
			cursor.execute(f"INSERT INTO `{table}` VALUES (1,'isolated lesson content',37,1)")
		cursor.execute("CREATE DATABASE ops_other_site")
		cursor.execute("CREATE TABLE ops_other_site.independent (id INT PRIMARY KEY) ENGINE=MyISAM")
	connection.commit()
	results = {}

	# Concurrent INSERT must wait on every engine; a different database stays writable.
	threads, errors, completed = [], [], []
	with mixed_backup.read_locks(values, 2, 10) as proof:
		for table in tables:
			ready = threading.Event()

			def writer(target=table, marker=ready):
				db = mixed_backup.connect(values, 5)
				try:
					with db.cursor() as cursor:
						marker.set()
						cursor.execute(f"INSERT INTO `{target}` VALUES (2,'after release',41,1)")
					db.commit()
					completed.append(target)
				except Exception as error:
					errors.append(type(error).__name__)
				finally:
					db.close()

			thread = threading.Thread(target=writer)
			thread.start()
			threads.append(thread)
			assert ready.wait(2)
		time.sleep(0.2)
		assert not completed and not errors
		with connection.cursor() as cursor:
			cursor.execute("INSERT INTO ops_other_site.independent VALUES (1)")
		connection.commit()
	for thread in threads:
		thread.join(5)
	assert len(completed) == 3 and not errors and proof["released"]
	results["inserts_blocked_by_read_on_all_engines"] = True
	results["unrelated_database_remained_writable"] = True
	results["writers_resumed_after_release"] = True

	# A conflicting table writer cannot make acquisition wait indefinitely.
	blocker = mixed_backup.connect(values)
	with blocker.cursor() as cursor:
		cursor.execute(f"LOCK TABLES `{tables[1]}` WRITE")
	started = time.monotonic()
	try:
		try:
			with mixed_backup.read_locks(values, 1, 3):
				raise AssertionError("Conflicting lock unexpectedly acquired")
		except (TimeoutError, pymysql.err.OperationalError) as error:
			if isinstance(error, pymysql.err.OperationalError):
				assert error.args[0] == 1205
			results["wait_aborted_seconds"] = round(time.monotonic() - started, 3)
			assert results["wait_aborted_seconds"] < 4
	finally:
		blocker.close()

	# Native dump failure and total hold deadline leave no successful capture marker.
	for kind in ("dump_failure", "hold_deadline"):
		target = work / kind
		started = time.monotonic()
		failure = (
			subprocess.CalledProcessError(2, ["mariadb-dump"])
			if kind == "dump_failure"
			else lambda *a, **k: time.sleep(3)
		)
		try:
			with patch.object(mixed_backup.subprocess, "run", side_effect=failure):
				mixed_backup.capture(target, writers_paused=True, wait_seconds=1, hold_seconds=1)
			raise AssertionError("Failed capture unexpectedly succeeded")
		except (subprocess.CalledProcessError, TimeoutError):
			assert not (target / "mixed-capture.json").exists()
		with mixed_backup.read_locks(values, 1, 3) as cleanup:
			pass
		assert cleanup["released"]
		results[kind + "_released_and_not_accepted"] = True
		if kind == "hold_deadline":
			results["hold_deadline_aborted_seconds"] = round(time.monotonic() - started, 3)
			assert results["hold_deadline_aborted_seconds"] < 3
	try:
		with mixed_backup.read_locks(values, 1, 3):
			os.kill(os.getpid(), signal.SIGTERM)
		raise AssertionError("SIGTERM unexpectedly ignored")
	except TimeoutError:
		with mixed_backup.read_locks(values, 1, 3) as cleanup:
			pass
		assert cleanup["released"]
	results["termination_released_locks"] = True

	child_code = "import mixed_backup,time; v=mixed_backup.config();\nwith mixed_backup.read_locks(v,1,10):\n print('locked',flush=True);time.sleep(9)"
	child = subprocess.Popen(
		[sys.executable, "-c", child_code],
		cwd="/opt/tiberio-ops",
		stdout=subprocess.PIPE,
		stderr=subprocess.PIPE,
	)
	try:
		assert child.stdout.readline().strip() == b"locked"
		child.kill()
		child.wait(timeout=3)
		with mixed_backup.read_locks(values, 2, 3) as cleanup:
			pass
		assert cleanup["released"]
	finally:
		if child.poll() is None:
			child.kill()
			child.wait()
	results["killed_client_released_locks"] = True

	capture = work / "capture"
	result = mixed_backup.capture(capture, writers_paused=True, wait_seconds=2, hold_seconds=20)
	with connection.cursor() as cursor:
		cursor.execute("CREATE DATABASE ops_mixed_restored CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
	connection.commit()
	command = ["mariadb", "--no-defaults", "--host=" + values["db_host"], "--user=root", "ops_mixed_restored"]
	with gzip.open(capture / "database.sql.gz", "rb") as sql:
		subprocess.run(
			command,
			input=sql.read(),
			env=dict(os.environ, MYSQL_PWD=values["db_password"]),
			capture_output=True,
			check=True,
			timeout=20,
		)
	with tempfile.TemporaryDirectory(dir=work) as temporary:
		root = Path(temporary)
		(root / site_probe.SITE).mkdir()
		(root / "common_site_config.json").write_text("{}")
		mixed_backup.save(
			root / site_probe.SITE / "site_config.json", dict(values, db_name="ops_mixed_restored")
		)
		with patch.object(site_probe, "SITES", root):
			restored = site_probe.database(allow_nontransactional=True)
	before = json.loads((capture / "source-before.json").read_text())
	assert before["tables"] == restored
	files = work / "restored-files"
	files.mkdir(mode=0o700)
	with tarfile.open(capture / "site.tar.gz") as archive:
		archive.extractall(files, filter="data")
	for relative, entry in before["files"].items():
		with (files / relative).open("rb") as stream:
			assert hashlib.file_digest(stream, "sha256").hexdigest() == entry["sha256"]
	results.update(
		status="verified_isolated",
		engine_rows={engine: restored[table]["count"] for engine, table in zip(engines, tables, strict=True)},
		tables_restored_equal=len(restored),
		files_restored_equal=len(before["files"]),
		lock=result["lock"],
		product_locked=False,
		product_modified=False,
		native_dump=True,
		single_transaction=False,
	)
	mixed_backup.save(work / "result.json", results)
	connection.close()
	print(json.dumps(results))


if __name__ == "__main__":
	main()
