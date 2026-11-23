"""Local-only backup, isolated recovery and non-destructive operational preflight."""

import argparse
import fcntl
import gzip
import hashlib
import io
import ipaddress
import json
import os
import secrets
import shutil
import subprocess
import tarfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[3]
PRIVATE = ROOT / ".local/quality/ops"
BACKUPS = PRIVATE / "backups"
PROJECT = "tiberio-frappe-local"
SITE = "tiberio.localhost"
BENCH = "/home/frappe/frappe-bench"
PROBE = Path(__file__).with_name("site_probe.py").read_text()
TABLES = (
	"tabLMS Course",
	"tabCourse Chapter",
	"tabCourse Lesson",
	"tabLMS Enrollment",
	"tabLMS Course Progress",
	"tabLMS Certificate",
	"tabFile",
	"tabUser",
	"tabHas Role",
)


def now():
	return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


def private_dir(path):
	path.mkdir(mode=0o700, parents=True, exist_ok=True)
	if path.is_symlink():
		raise ValueError("Private directory cannot be a symlink")
	path.chmod(0o700)


def write_json(path, value):
	pending = path.with_name(path.name + ".pending")
	with pending.open("x", encoding="utf-8") as output:
		os.fchmod(output.fileno(), 0o600)
		json.dump(value, output, indent=2, sort_keys=True)
		output.write("\n")
		output.flush()
		os.fsync(output.fileno())
	if path.exists():
		raise FileExistsError(path)
	os.rename(pending, path)


def digest(path):
	with path.open("rb") as stream:
		return hashlib.file_digest(stream, "sha256").hexdigest()


def run(args, data=None, timeout=180):
	process = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
	if process.returncode:
		# Docker/SQL errors may contain credentials or data; keep diagnostics private.
		private_dir(PRIVATE)
		error = PRIVATE / ("failure-" + now() + ".log")
		error.write_bytes(process.stderr + process.stdout)
		error.chmod(0o600)
		raise RuntimeError(f"Local operation failed; private diagnostic: {error.relative_to(ROOT)}")
	return process.stdout


def inspect(container):
	return json.loads(run(["docker", "inspect", container]))[0]


def service(name, *, require_running=True):
	container = f"{PROJECT}-{name}-1"
	info = inspect(container)
	if info["Config"]["Labels"].get("com.docker.compose.project") != PROJECT:
		raise ValueError("Container outside authorized project")
	if require_running and not info["State"]["Running"]:
		raise ValueError("Required source service is not running")
	return container


def probe(container, mode):
	return json.loads(
		run(
			[
				"docker",
				"exec",
				"-i",
				"-w",
				BENCH + "/sites",
				container,
				BENCH + "/env/bin/python",
				"-c",
				PROBE,
				mode,
			]
		)
	)


def safe_extract(source, destination):
	options = {"fileobj": io.BytesIO(source)} if isinstance(source, bytes) else {"name": source}
	with tarfile.open(**options, mode="r:*") as archive:
		for item in archive.getmembers():
			path = PurePosixPath(item.name)
			if (
				path.is_absolute()
				or ".." in path.parts
				or "\\" in item.name
				or not (item.isfile() or item.isdir())
			):
				raise ValueError("Unsafe site backup archive")
		# Python's data filter rejects links/escapes too; links are already disallowed.
		archive.extractall(destination, filter="data")


def stream_command(command, output_path):
	with output_path.open("wb") as output, output_path.with_suffix(".stderr.log").open("wb") as error:
		process = subprocess.run(command, stdout=output, stderr=error, timeout=600)
	if process.returncode:
		raise RuntimeError("Archive capture failed; private diagnostic preserved")


def disk_budget(free, data_bytes, planned_bytes, reserve, copies):
	if min(free, data_bytes, planned_bytes, reserve, copies) < 0:
		raise ValueError("Budgets cannot be negative")
	required = reserve + planned_bytes + data_bytes * (copies + 2)
	return {
		"free_bytes": free,
		"required_free_bytes": required,
		"ok": free >= required,
		"reserve_bytes": reserve,
		"planned_bytes": planned_bytes,
		"estimated_snapshot_bytes": data_bytes,
		"retained_copies_budget": copies,
		"restore_expansion_copies": 2,
	}


def retention_plan(root, keep=3):
	if keep < 1:
		raise ValueError("At least one retained backup required")
	backups = []
	if root.exists():
		for path in sorted(root.iterdir(), reverse=True):
			if path.is_symlink() or not path.is_dir():
				continue
			marker = path / "complete.json"
			if not marker.is_file() or marker.is_symlink():
				continue
			record = json.loads(marker.read_text())
			if record.get("owner") != "tiberio-quality-ops" or record.get("site") != SITE:
				continue
			backups.append(
				{
					"reference": path.name,
					"bytes": sum(
						p.stat().st_size for p in path.rglob("*") if p.is_file() and not p.is_symlink()
					),
				}
			)
	return {
		"dry_run": True,
		"deletion_enabled": False,
		"keep_proposal": keep,
		"total_bytes": sum(p["bytes"] for p in backups),
		"retained": backups[:keep],
		"review_only_candidates": backups[keep:],
		"protected": "site data, lessons, volumes, credentials, source, evidence and unproven artifacts",
	}


def preflight(planned_bytes=0, copies=3):
	private_dir(PRIVATE)
	app, db = service("backend"), service("db")
	services = {}
	folder = PRIVATE / ("preflight-" + now())
	private_dir(folder)
	for name in ("db", "redis", "backend", "frontend", "websocket", "worker", "scheduler"):
		container = service(name)
		info = inspect(container)
		# docker logs can emit on stderr; capture both without exposing raw logs.
		raw = subprocess.run(
			["docker", "logs", "--tail", "100", "--since", "1h", container], capture_output=True, timeout=30
		)
		if raw.returncode:
			raise RuntimeError("Native log read failed")
		log = raw.stdout + raw.stderr
		(folder / (name + ".log")).write_bytes(log)
		(folder / (name + ".log")).chmod(0o600)
		services[name] = {
			"running": info["State"]["Running"],
			"health": info["State"].get("Health", {}).get("Status", "not_configured"),
			"image_id": info["Image"],
			"restart_count": info["RestartCount"],
			"recent_error_lines": sum(
				any(t in line.lower() for t in (b"error", b"traceback", b"failed"))
				for line in log.splitlines()
			),
		}
	snapshot = probe(app, "files")
	data_bytes = sum(f["bytes"] for f in snapshot["files"].values())
	# Actual SQL size is a private native read, not a volume-size assumption.
	config = json.loads(run(["docker", "exec", app, "cat", BENCH + f"/sites/{SITE}/site_config.json"]))
	sql = b"SELECT COALESCE(SUM(data_length+index_length),0) FROM information_schema.tables WHERE table_schema=DATABASE();"
	db_size = int(
		run(
			[
				"docker",
				"exec",
				"-i",
				db,
				"sh",
				"-c",
				'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot -NB "$1"',
				"ops",
				config["db_name"],
			],
			sql,
		)
	)
	data_bytes += db_size
	vm_free = (
		int(run(["docker", "exec", db, "sh", "-c", "df -Pk /var/lib/mysql | tail -1 | awk '{print $4}'"]))
		* 1024
	)
	budget = disk_budget(
		min(shutil.disk_usage(ROOT).free, vm_free), data_bytes, planned_bytes, 7 * 1024**3, copies
	)
	doctor = subprocess.run(
		["docker", "exec", "-w", BENCH, app, "bench", "doctor", "--site", SITE],
		capture_output=True,
		timeout=90,
	)
	(folder / "bench-doctor.log").write_bytes(doctor.stdout + doctor.stderr)
	(folder / "bench-doctor.log").chmod(0o600)
	doctor_text = (doctor.stdout + doctor.stderr).decode(errors="replace")
	workers = "Workers online: " in doctor_text and "Workers online: 0" not in doctor_text
	scheduler_disabled = any(
		signal in doctor_text
		for signal in ("Scheduler disabled", "Scheduler inactive", "Scheduler paused", "Maintenance mode on")
	)
	redis_ping = run(["docker", "exec", service("redis"), "redis-cli", "ping"]).strip() == b"PONG"
	try:
		with urllib.request.urlopen("http://tiberio.localhost:8088/api/method/ping", timeout=10) as response:
			http_ping = response.status == 200 and json.load(response).get("message") == "pong"
	except (OSError, ValueError):
		http_ping = False
	services_ok = all(s["running"] and s["health"] != "unhealthy" for s in services.values())
	result = {
		"captured_utc": now(),
		"status": "verified_isolated"
		if budget["ok"]
		and services_ok
		and workers
		and not scheduler_disabled
		and doctor.returncode == 0
		and redis_ping
		and http_ping
		else "blocked",
		"services": services,
		"disk": budget,
		"database_estimated_bytes": db_size,
		"native_doctor": {
			"exit_code": doctor.returncode,
			"workers_online": workers,
			"scheduler_disabled_signal": scheduler_disabled,
			"private_log_reference": str((folder / "bench-doctor.log").relative_to(ROOT)),
		},
		"http_ping": http_ping,
		"redis_ping": redis_ping,
		"scheduler_liveness_limit": "running process and native enabled status; no job execution canary or sustained heartbeat measured",
		"retention": retention_plan(BACKUPS, copies),
		"scheduling": "none; run before backup/build/migration and manually on health concern",
		"source_changes_integrated": False,
	}
	write_json(folder / "result.json", result)
	return result


def backup():
	private_dir(PRIVATE)
	private_dir(BACKUPS)
	check = preflight()
	if not check["disk"]["ok"]:
		raise ValueError("Insufficient space; no automatic cleanup")
	app, db = service("backend"), service("db")
	folder = BACKUPS / now()
	private_dir(folder)
	before = probe(app, "snapshot")
	write_json(folder / "source-before.json", before)
	config = json.loads(run(["docker", "exec", app, "cat", BENCH + f"/sites/{SITE}/site_config.json"]))
	# --single-transaction is read-only, no table/global locks or product config changes.
	command = [
		"docker",
		"exec",
		db,
		"sh",
		"-c",
		'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb-dump -uroot --single-transaction '
		'--skip-lock-tables --quick --hex-blob --routines --events --triggers "$1"',
		"ops",
		config["db_name"],
	]
	with (
		(folder / "dump-stderr.log").open("wb") as error,
		gzip.open(folder / "database.sql.gz", "wb") as output,
	):
		process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=error)
		try:
			shutil.copyfileobj(process.stdout, output)
			if process.wait(timeout=180):
				raise RuntimeError("Database dump failed; incomplete capture preserved privately")
		finally:
			process.stdout.close()
			if process.poll() is None:
				process.kill()
				process.wait()
	stream_command(
		[
			"docker",
			"exec",
			"-w",
			BENCH + "/sites",
			app,
			"tar",
			"-czf",
			"-",
			f"{SITE}/public/files",
			f"{SITE}/private/files",
			f"{SITE}/site_config.json",
			"common_site_config.json",
			"apps.txt",
		],
		folder / "site.tar.gz",
	)
	after = probe(app, "snapshot")
	write_json(folder / "source-after.json", after)
	return finish_capture(folder, before, after, "transactional; nontransactional tables empty")


def finish_capture(folder, before, after, consistency):
	app, db = service("backend", require_running=False), service("db")
	for name in ("secrets.json", "db.env"):
		path = ROOT / ".local" / name
		if path.is_symlink() or not path.is_file():
			raise ValueError("Missing local recovery configuration")
		shutil.copyfile(path, folder / name)
	if before != after:
		raise ValueError("Source changed during backup; capture incomplete, retry in a quiet window")
	extracted = folder / "capture-verification"
	private_dir(extracted)
	safe_extract(folder / "site.tar.gz", extracted)
	for relative, entry in before["files"].items():
		path = extracted / relative
		if not path.is_file() or digest(path) != entry["sha256"]:
			raise ValueError("Captured file differs from source inventory")
	shutil.rmtree(extracted)  # Only this invocation's verified disposable duplicate.
	for path in folder.iterdir():
		if path.is_file():
			path.chmod(0o600)
	artifacts = {
		p.name: {"bytes": p.stat().st_size, "sha256": digest(p)} for p in folder.iterdir() if p.is_file()
	}
	write_json(
		folder / "complete.json",
		{
			"owner": "tiberio-quality-ops",
			"site": SITE,
			"source_image_id": inspect(app)["Image"],
			"database_image_id": inspect(db)["Image"],
			"redis_image_id": inspect(service("redis"))["Image"],
			"source_stable": True,
			"database_consistency": consistency,
			"artifacts": artifacts,
			"created_utc": now(),
		},
	)
	return {
		"backup_reference": str(folder.relative_to(ROOT)),
		"status": "verified_isolated",
		"tables": len(before["tables"]),
		"files": len(before["files"]),
		"selected_counts": {t: before["tables"][t]["count"] for t in TABLES if t in before["tables"]},
		"artifact_bytes": {name: entry["bytes"] for name, entry in artifacts.items()},
		"source_stable": True,
		"restore_required": True,
	}


def backup_mixed(*, writers_paused=False, wait_seconds=5, hold_seconds=60):
	if not writers_paused:
		raise ValueError("Pause/drain this site's writers in the integrator's controlled window first")
	if not 1 <= wait_seconds <= 30 or not 1 <= hold_seconds <= 120:
		raise ValueError("Invalid lock budget")
	if shutil.disk_usage(ROOT).free < 7 * 1024**3:
		raise ValueError("Insufficient reserve; run preflight before the pause")
	app = service("backend", require_running=False)
	info = inspect(app)
	sites = next(m for m in info["Mounts"] if m["Destination"] == BENCH + "/sites")
	if sites["Type"] != "volume":
		raise ValueError("Expected the project's native sites volume")
	volume = json.loads(run(["docker", "volume", "inspect", sites["Name"]]))[0]
	if volume.get("Labels", {}).get("com.docker.compose.project") != PROJECT:
		raise ValueError("Sites volume outside authorized project")
	networks = list(info["NetworkSettings"]["Networks"])
	if len(networks) != 1:
		raise ValueError("Expected one project network")
	network = json.loads(run(["docker", "network", "inspect", networks[0]]))[0]
	if network.get("Labels", {}).get("com.docker.compose.project") != PROJECT:
		raise ValueError("Network outside authorized project")
	private_dir(BACKUPS)
	folder = BACKUPS / now()
	private_dir(folder)
	token = "tiberio-quality-capture-" + now().lower()
	command = [
		"docker",
		"create",
		"--pull=never",
		"--name",
		token,
		"--network",
		networks[0],
		"--platform",
		"linux/amd64",
		"--label",
		"tiberio.quality.owner=" + token,
		"--entrypoint",
		BENCH + "/env/bin/python",
		"--tmpfs",
		BENCH + "/logs:rw,uid=1000,gid=1000,size=32m",
		"-v",
		f"{sites['Name']}:{BENCH}/sites:ro",
		"-v",
		f"{Path(__file__).parent}:/opt/tiberio-ops:ro",
		"-v",
		f"{folder}:/run/tiberio-ops",
		"-w",
		BENCH + "/sites",
		info["Image"],
		"/opt/tiberio-ops/mixed_backup.py",
		"--output",
		"/run/tiberio-ops/capture",
		"--writers-paused",
		"--wait-seconds",
		str(wait_seconds),
		"--hold-seconds",
		str(hold_seconds),
	]
	run(command)
	try:
		run(["docker", "start", "-a", token], timeout=wait_seconds + hold_seconds + 20)
		if inspect(token)["State"]["ExitCode"] != 0:
			raise RuntimeError("Mixed capture failed; private incomplete data preserved")
	finally:
		created = inspect(token)
		if (
			created["Config"]["Labels"].get("tiberio.quality.owner") != token
			or created["HostConfig"]["PortBindings"]
		):
			raise ValueError("Capture cleanup ownership mismatch")
		run(["docker", "rm", "-f", "-v", token])
	captured = folder / "capture"
	proof = json.loads((captured / "mixed-capture.json").read_text())
	if not proof["lock"]["released"]:
		raise ValueError("Capture lock release unverified")
	for path in captured.iterdir():
		path.rename(folder / path.name)
	captured.rmdir()
	before = json.loads((folder / "source-before.json").read_text())
	after = json.loads((folder / "source-after.json").read_text())
	return finish_capture(
		folder, before, after, "strict READ table locks; dedicated connection; writers paused/drained"
	)


def verify_backup(folder):
	folder = folder.resolve()
	if not folder.is_relative_to(BACKUPS.resolve()) or folder == BACKUPS.resolve():
		raise ValueError("Restore accepts only owned private backups")
	record = json.loads((folder / "complete.json").read_text())
	if record.get("owner") != "tiberio-quality-ops" or record.get("site") != SITE:
		raise ValueError("Unowned backup")
	for name, entry in record["artifacts"].items():
		if Path(name).name != name:
			raise ValueError("Unsafe artifact name")
		path = folder / name
		if path.is_symlink() or digest(path) != entry["sha256"]:
			raise ValueError("Backup integrity mismatch")
	return record


def restore(folder, *, mixed_lab=False, subnet=None):
	network_options = []
	if subnet:
		requested = ipaddress.ip_network(subnet, strict=True)
		if requested.version != 4 or not requested.is_private or requested.prefixlen != 24:
			raise ValueError("Restore requires a private IPv4 /24")
		ids = run(["docker", "network", "ls", "-q"]).decode().split()
		allocated = json.loads(run(["docker", "network", "inspect", *ids])) if ids else []
		if any(requested.overlaps(ipaddress.ip_network(config["Subnet"]))
			for row in allocated for config in (row.get("IPAM", {}).get("Config") or [])
			if config.get("Subnet") and ":" not in config["Subnet"]):
			raise ValueError("Restore subnet overlaps an existing network")
		network_options = ["--subnet", str(requested)]
	record = verify_backup(folder)
	token = "tiberio-quality-restore-" + now().lower()
	work = PRIVATE / token
	private_dir(work)
	password = "$ops$" + secrets.token_urlsafe(32)
	env = work / "restore.env"
	env.write_text("MARIADB_ROOT_PASSWORD=" + password + "\n")
	env.chmod(0o600)
	sites = work / "sites"
	private_dir(sites)
	safe_extract(folder / "site.tar.gz", sites)
	(sites / SITE / "logs").mkdir(mode=0o700)
	config_path = sites / SITE / "site_config.json"
	config = json.loads(config_path.read_text())
	db_name = config["db_name"]
	config.update(
		db_user="root",
		db_password=password,
		db_host=token + "-db",
		mute_emails=True,
		pause_scheduler=True,
		enable_telemetry=False,
	)
	config_path.write_text(json.dumps(config))
	common = json.loads((sites / "common_site_config.json").read_text())
	common.update(
		db_host=token + "-db",
		maintenance_mode=0,
		pause_scheduler=True,
		redis_cache=f"redis://{token}-redis:6379",
		redis_queue=f"redis://{token}-redis:6379",
		redis_socketio=f"redis://{token}-redis:6379",
	)
	(sites / "common_site_config.json").write_text(json.dumps(common))
	for path in sites.rglob("*"):
		path.chmod(0o700 if path.is_dir() else 0o600)
	created = []
	network_created = False
	success = False
	try:
		run(["docker", "network", "create", "--internal", *network_options, "--label", "tiberio.quality.owner=" + token, token])
		network_created = True
		for kind, image, extra in [
			(
				"db",
				record["database_image_id"],
				["--env-file", str(env), "--tmpfs", "/var/lib/mysql:rw,size=1g"],
			),
			("redis", record["redis_image_id"], ["--tmpfs", "/data:rw,size=64m"]),
			(
				"app",
				record["source_image_id"],
				[
					"--platform",
					"linux/amd64",
					"--entrypoint",
					"sleep",
					"--tmpfs",
					BENCH + "/logs:rw,uid=1000,gid=1000,size=32m",
					"-v",
					f"{sites}:{BENCH}/sites",
					*(
						[
							"-v",
							f"{Path(__file__).parent}:/opt/tiberio-ops:ro",
							"-v",
							f"{work}:/run/tiberio-ops",
							"-e",
							"TIBERIO_OPS_ISOLATED_LAB=1",
						]
						if mixed_lab
						else []
					),
				],
			),
		]:
			name = token + "-" + kind
			# Image IDs already exist locally; never pull/build or attach product volumes.
			run(
				[
					"docker",
					"run",
					"--pull=never",
					"-d",
					"--name",
					name,
					"--network",
					token,
					"--label",
					"tiberio.quality.owner=" + token,
					*extra,
					image,
					*(["infinity"] if kind == "app" else []),
				]
			)
			created.append(name)
			info = inspect(name)
			if info["HostConfig"]["PortBindings"] or any(m["Type"] == "volume" for m in info["Mounts"]):
				raise ValueError(
					"Restore must use private bind mounts/tmpfs without anonymous volumes or published ports"
				)
		db, app = token + "-db", token + "-app"
		for _ in range(60):
			health = subprocess.run(
				["docker", "exec", db, "sh", "-c", 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec healthcheck.sh --no-defaults --connect --innodb_initialized'],
				capture_output=True,
				timeout=10,
			)
			if health.returncode == 0:
				break
			time.sleep(1)
		else:
			raise RuntimeError("Restore-only database did not become ready")
		# Required secret-dollar-check: exact bytes inside consumer; never print value/digest.
		inside = run(["docker", "exec", db, "sh", "-c", 'printf %s "$MARIADB_ROOT_PASSWORD"'])
		if inside != password.encode():
			raise ValueError("Restore secret-dollar-check failed")
		if not db_name.replace("_", "").isalnum():
			raise ValueError("Unexpected source database identifier")
		run(
			[
				"docker",
				"exec",
				"-i",
				db,
				"sh",
				"-c",
				'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot',
			],
			f"CREATE DATABASE `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;".encode(),
		)
		with gzip.open(folder / "database.sql.gz", "rb") as dump:
			with (work / "import-stderr.log").open("wb") as error:
				process = subprocess.Popen(
					[
						"docker",
						"exec",
						"-i",
						db,
						"sh",
						"-c",
						'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot "$1"',
						"ops",
						db_name,
					],
					stdin=subprocess.PIPE,
					stdout=subprocess.DEVNULL,
					stderr=error,
				)
				try:
					shutil.copyfileobj(dump, process.stdin)
					process.stdin.close()
					if process.wait(timeout=180):
						raise RuntimeError("Restore import failed; private diagnostic preserved")
				finally:
					if not process.stdin.closed:
						process.stdin.close()
					if process.poll() is None:
						process.kill()
						process.wait()
		restored = probe(app, "restored-snapshot")
		source = json.loads((folder / "source-before.json").read_text())
		if source["tables"] != restored["tables"]:
			raise ValueError("Restored row counts/content/schema differ")
		expected_files = {
			k: v
			for k, v in source["files"].items()
			if k not in ("common_site_config.json", f"{SITE}/site_config.json")
		}
		if expected_files != {k: restored["files"][k] for k in expected_files}:
			raise ValueError("Restored files differ")
		access = probe(app, "access")
		mixed_result = None
		if mixed_lab:
			mixed_result = json.loads(
				run(
					[
						"docker",
						"exec",
						"-w",
						BENCH + "/sites",
						app,
						BENCH + "/env/bin/python",
						"/opt/tiberio-ops/mixed_lab.py",
					],
					timeout=120,
				)
			)
		write_json(work / "restored-inventory.json", restored)
		result = {
			"status": "verified_isolated",
			"captured_utc": now(),
			"backup_reference": str(folder.relative_to(ROOT)),
			"source_image_id": record["source_image_id"],
			"tables_equal": len(source["tables"]),
			"files_equal": len(expected_files),
			"selected_counts": {t: source["tables"][t]["count"] for t in TABLES if t in source["tables"]},
			"content_progress_access": access,
			"configuration_restored": True,
			"restore_configuration_overrides": [
				"db credentials/host",
				"isolated Redis",
				"scheduler paused",
				"email muted",
			],
			"secret_dollar_check": True,
			"network_internal": True,
			"published_ports": 0,
			"source_modified": False,
			"source_changes_integrated": False,
			"private_reference": str(work.relative_to(ROOT)),
			"final_integration_requires_new_restore_if_schema_changes": True,
			"mixed_engine_lab": mixed_result,
		}
		success = True
	finally:
		# Only disposable containers created by this invocation, guarded by exact ownership.
		for name in reversed(created):
			info = inspect(name)
			if (
				info["Config"]["Labels"].get("tiberio.quality.owner") != token
				or info["HostConfig"]["PortBindings"]
			):
				raise ValueError("Restore cleanup ownership/ports mismatch")
			run(["docker", "rm", "-f", "-v", name])
		if network_created:
			run(["docker", "network", "rm", token])
	if success:
		result["restore_containers_removed"] = True
		write_json(work / "result.json", result)
		return result


def main():
	os.umask(0o077)
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument(
		"action", choices=["preflight", "backup", "backup-mixed", "restore", "retention", "mixed-lab"]
	)
	parser.add_argument("--backup", type=Path)
	parser.add_argument("--subnet", help="Verified free private /24 for the isolated restore only")
	parser.add_argument("--planned-bytes", type=int, default=0)
	parser.add_argument("--keep", type=int, default=3)
	parser.add_argument("--writers-paused", action="store_true")
	parser.add_argument("--wait-seconds", type=int, default=5)
	parser.add_argument("--hold-seconds", type=int, default=60)
	args = parser.parse_args()
	private_dir(PRIVATE)
	with (PRIVATE / "operations.lock").open("a") as lock:
		fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
		if args.action == "preflight":
			result = preflight(args.planned_bytes, args.keep)
		elif args.action == "backup":
			result = backup()
		elif args.action == "backup-mixed":
			result = backup_mixed(
				writers_paused=args.writers_paused,
				wait_seconds=args.wait_seconds,
				hold_seconds=args.hold_seconds,
			)
		elif args.action in ("restore", "mixed-lab"):
			if not args.backup:
				parser.error("restore requires --backup")
			result = restore(args.backup.resolve(), mixed_lab=args.action == "mixed-lab", subnet=args.subnet)
		else:
			result = retention_plan(BACKUPS, args.keep)
	print(json.dumps(result, indent=2))
	if result.get("status") == "blocked":
		raise SystemExit(1)


if __name__ == "__main__":
	main()
