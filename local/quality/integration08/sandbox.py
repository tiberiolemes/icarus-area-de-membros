"""Segregated native test site: internal network, fresh tmpfs DB, own sites only."""

import json
import os
import secrets
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORK = ROOT / ".local/quality/08-sandbox"
OWNER = "tiberio-quality08-sandbox"
SITE = "test_quality08.localhost"
BENCH = "/home/frappe/frappe-bench"
IMAGE = "tiberio-frappe-local:quality08-20261121"
os.umask(0o077)


def run(command, label, *, data=None):
	with (WORK / (label + ".log")).open("wb") as log:
		result = subprocess.run(command, input=data, stdout=log, stderr=subprocess.STDOUT)
	if result.returncode:
		raise RuntimeError(f"{label} failed (exit {result.returncode}); private log retained")


def bench(*args, label):
	run(["docker", "exec", "-w", BENCH, OWNER + "-app", "bench", *args], label)


if __name__ == "__main__":
	assert json.loads((ROOT / ".local/quality/08-build-result.json").read_text())["exit_code"] == 0
	WORK.mkdir(mode=0o700, exist_ok=False)
	config = {"db_root": "$qc08$" + secrets.token_urlsafe(30), "admin": "Aa9!" + secrets.token_urlsafe(30)}
	(WORK / "secrets.json").write_text(json.dumps(config))
	(WORK / "db.env").write_text("MARIADB_ROOT_PASSWORD=" + config["db_root"] + "\n")
	sites = WORK / "sites"
	sites.mkdir(mode=0o700)
	(sites / "apps.txt").write_text("frappe\npayments\nlms\n")
	(sites / "assets").symlink_to(BENCH + "/assets")
	common = {
		"db_host": OWNER + "-db",
		"db_port": 3306,
		"socketio_port": 9000,
		"webserver_host": "http://" + OWNER + "-app",
		"webserver_port": 8000,
		"mute_emails": True,
		"pause_scheduler": True,
		"enable_telemetry": False,
	}
	for key in ("redis_cache", "redis_queue", "redis_socketio"):
		common[key] = "redis://" + OWNER + "-redis:6379"
	(sites / "common_site_config.json").write_text(json.dumps(common))
	run(
		["docker", "network", "create", "--internal", "--label", "tiberio.quality.owner=" + OWNER, OWNER],
		"network",
	)
	run(
		["docker", "volume", "create", "--label", "tiberio.quality.owner=" + OWNER, OWNER + "-sites"],
		"volume",
	)
	run(
		[
			"docker",
			"run",
			"--rm",
			"--pull=never",
			"--platform",
			"linux/amd64",
			"--network",
			"none",
			"--user",
			"0",
			"--entrypoint",
			"sh",
			"--tmpfs",
			BENCH + "/sites",
			"-v",
			str(sites) + ":/seed:ro",
			"-v",
			OWNER + "-sites:/target",
			IMAGE,
			"-c",
			"cp -a /seed/. /target/ && chown -R 1000:1000 /target",
		],
		"seed-volume",
	)
	for kind, image, extra, command in [
		(
			"db",
			"sha256:345fa26d595e8c7fe298e0c4098ed400356f502458769c8902229b3437d6da2b",
			["--env-file", str(WORK / "db.env"), "--tmpfs", "/var/lib/mysql:rw,size=1g"],
			[],
		),
		(
			"redis",
			"sha256:b2b95679e3b46fb51864949ed25ea976fc3a6bcc00a40a1bc00d568cb2822e50",
			["--tmpfs", "/data:rw,size=64m"],
			[],
		),
		(
			"app",
			IMAGE,
			[
				"--platform",
				"linux/amd64",
				"--init",
				"--entrypoint",
				"sleep",
				"--tmpfs",
				BENCH + "/logs:rw,uid=1000,gid=1000,size=64m",
				"-v",
				OWNER + "-sites:" + BENCH + "/sites",
				"-v",
				str(ROOT) + ":/source:ro",
			],
			["infinity"],
		),
	]:
		run(
			[
				"docker",
				"run",
				"-d",
				"--pull=never",
				"--name",
				OWNER + "-" + kind,
				"--network",
				OWNER,
				"--label",
				"tiberio.quality.owner=" + OWNER,
				*extra,
				image,
				*command,
			],
			"start-" + kind,
		)
	deadline = time.monotonic() + 60
	while True:
		result = subprocess.run(
			["docker", "exec", OWNER + "-db", "healthcheck.sh", "--connect", "--innodb_initialized"],
			capture_output=True,
		)
		if result.returncode == 0:
			break
		if time.monotonic() >= deadline:
			raise RuntimeError("Sandbox DB not ready")
		time.sleep(0.5)
	bench(
		"new-site",
		SITE,
		"--db-root-username",
		"root",
		"--db-root-password",
		config["db_root"],
		"--admin-password",
		config["admin"],
		"--mariadb-user-host-login-scope",
		"%",
		label="new-site",
	)
	bench("--site", SITE, "set-config", "-p", "allow_tests", "True", label="allow-tests")
	for app in ("payments", "lms"):
		bench("--site", SITE, "install-app", app, label="install-" + app)
	bench("--site", SITE, "migrate", label="migrate-first")
	bench("--site", SITE, "migrate", label="migrate-second")
	print(
		json.dumps(
			{
				"site": SITE,
				"internal_network": True,
				"original_volumes_mounted": False,
				"schema_installed": True,
				"second_migration_exit": 0,
			}
		)
	)
