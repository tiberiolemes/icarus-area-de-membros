"""Park an owned, quiesced QA database only after a verified logical capture; never the product."""

import argparse
import gzip
import hashlib
import json
import os
import re
import subprocess
import time
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("revision", choices=("r8", "r10", "r11", "r14", "r15", "r16", "r17", "r18", "r19", "r20", "r21", "r22"))
parser.add_argument("--kind", choices=("existing", "fresh"), default="existing")
parser.add_argument("--attempt", default="first")
args = parser.parse_args()
assert args.attempt.isalnum()
os.umask(0o077)
owner = "tiberio-quality08-" + args.revision + "-" + args.kind
names = [owner + "-" + s for s in (("frontend", "app", "redis", "db") if args.kind == "existing" else ("app", "redis", "db"))]


def inspect(names):
	return json.loads(subprocess.check_output(["docker", "inspect", *names]))


def project(rows):
	return [
		{
			"id": r["Id"],
			"image": r["Image"],
			"state": {k: r["State"][k] for k in ("Running", "Paused", "StartedAt", "OOMKilled")},
			"restart": r["HostConfig"]["RestartPolicy"],
		}
		for r in rows
	]


rows = inspect(names)
assert all(r["Config"]["Labels"]["tiberio.quality.owner"] == owner for r in rows)
assert all(not r["State"]["Running"] for r in rows[:-1]) and rows[-1]["State"]["Running"]
db = rows[-1]["Id"]
originals = [
	"tiberio-frappe-local-" + s + "-1"
	for s in ("frontend", "backend", "websocket", "worker", "scheduler", "db", "redis")
]
before = project(inspect(originals))
output = Path(".local/quality/08-" + args.revision + ("-fresh" if args.kind == "fresh" else "") + "-database-parked-" + args.attempt + ".json")
archive = output.with_suffix(".sql.gz")
assert not output.exists() and not archive.exists()
proof = {
	"owner": owner,
	"database_id": db,
	"database_image_id": rows[-1]["Image"],
	"original_before": before,
	"not_a_restore_rehearsal": True,
	"private_archive_path": str(archive),
}


def sql(query):
	return subprocess.check_output(
		[
			"docker",
			"exec",
			db,
			"sh",
			"-c",
			'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot --batch --skip-column-names -e "$1"',
			"qc08",
			query,
		],
		text=True,
	)


def inventory():
	tables = [
		line.split("\t")
		for line in sql(
			"SELECT TABLE_SCHEMA,TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA NOT IN ('mysql','sys','information_schema','performance_schema') AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_SCHEMA,TABLE_NAME"
		).splitlines()
	]
	assert tables and all(engine in ("InnoDB", "MyISAM") for schema, table, engine in tables)
	assert all(
		table in ("tabError Log", "tabData Import Log", "__global_search")
		for schema, table, engine in tables
		if engine == "MyISAM"
	)
	quoted = [f"`{schema.replace('`', '``')}`.`{table.replace('`', '``')}`" for schema, table, _ in tables]
	check = sql("CHECKSUM TABLE " + ",".join(quoted) + " EXTENDED")
	assert all(line.split("\t")[-1] != "NULL" for line in check.splitlines())
	return {
		"tables": len(tables),
		"schemas": len({schema for schema, _, _ in tables}),
		"checksum_sha256": hashlib.sha256(check.encode()).hexdigest(),
		"engine_counts": {engine: sum(e == engine for _, _, e in tables) for engine in ("InnoDB", "MyISAM")},
	}


try:
	assert sql("SELECT @@event_scheduler").strip() == "OFF"
	assert (
		int(
			sql(
				"SELECT count(*) FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND DB IS NOT NULL"
			).strip()
		)
		== 0
	)
	proof["before"] = inventory()
	if args.revision == "r16":
		assert proof["before"]["schemas"] == 3, "All three owned QA schemas must be captured"
	start = time.monotonic()
	command = [
		"docker",
		"exec",
		db,
		"sh",
		"-c",
		'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb-dump -uroot --all-databases --lock-all-tables --quick --routines --events --triggers --hex-blob',
	]
	error = archive.with_suffix(".stderr")
	assert not error.exists()
	with archive.open("xb") as raw, error.open("xb") as stderr:
		with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as compressed:
			process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=stderr)
			while chunk := process.stdout.read(1024 * 1024):
				compressed.write(chunk)
			process.stdout.close()
			code = process.wait()
	proof["dump_exit_code"] = code
	assert code == 0
	digest = hashlib.sha256()
	tail = b""
	size = 0
	with gzip.open(archive, "rb") as stream:
		while chunk := stream.read(1024 * 1024):
			digest.update(chunk)
			size += len(chunk)
			tail = (tail + chunk)[-4096:]
	assert b"Dump completed on" in tail
	proof["capture_seconds"] = time.monotonic() - start
	proof["uncompressed_bytes"] = size
	proof["uncompressed_sha256"] = digest.hexdigest()
	proof["gzip_sha256"] = hashlib.file_digest(archive.open("rb"), "sha256").hexdigest()
	proof["after"] = inventory()
	assert proof["before"] == proof["after"]
	proof["stop_exit_code"] = subprocess.run(
		["docker", "stop", "--time", "30", db], capture_output=True
	).returncode
	assert proof["stop_exit_code"] == 0
	stopped = inspect([db])[0]
	assert (
		not stopped["State"]["Running"]
		and not stopped["State"]["OOMKilled"]
		and stopped["State"]["ExitCode"] == 0
	)
	proof["database_stopped_exit_code"] = 0
	proof["exit_code"] = 0
finally:
	proof.setdefault("exit_code", 1)
	proof["original_after"] = project(inspect(originals))
	proof["original_unchanged"] = before == proof["original_after"]
	with urllib.request.urlopen(
		urllib.request.Request("http://127.0.0.1:8088/lms", headers={"Host": "tiberio.localhost"}), timeout=5
	) as r:
		proof["original_http_status"] = r.status
	raw = subprocess.check_output(["docker", "exec", originals[5], "cat", "/proc/meminfo"], text=True)
	proof["memory_after_bytes"] = {
		l.split(":")[0]: int(l.split()[1]) * 1024
		for l in raw.splitlines()
		if l.startswith(("MemTotal:", "MemAvailable:"))
	}
	output.write_text(json.dumps(proof, indent=2) + "\n")
	assert proof["original_unchanged"] and proof["original_http_status"] == 200
print(
	json.dumps(
		{
			k: v
			for k, v in proof.items()
			if k
			in (
				"owner",
				"exit_code",
				"before",
				"capture_seconds",
				"database_stopped_exit_code",
				"memory_after_bytes",
				"original_unchanged",
				"original_http_status",
			)
		}
	)
)
