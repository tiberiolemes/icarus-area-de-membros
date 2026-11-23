"""Intentionally stop only a verified owned lab; never resume its discarded tmpfs DB."""

import argparse
import json
import subprocess
import time
import urllib.request
from pathlib import Path


def inspect(names):
	return json.loads(subprocess.check_output(["docker", "inspect", *names]))


def projection(rows):
	return [
		{
			"id": row["Id"],
			"name": row["Name"],
			"image_id": row["Image"],
			"running": row["State"]["Running"],
			"started_at": row["State"]["StartedAt"],
			"oom_killed": row["State"]["OOMKilled"],
			"restart_policy": row["HostConfig"]["RestartPolicy"],
			"health": row["State"].get("Health", {}).get("Status"),
		}
		for row in rows
	]


parser = argparse.ArgumentParser()
parser.add_argument("revision")
parser.add_argument("--kind", choices=("fresh", "existing"), default="existing")
parser.add_argument("--attempt", default="first")
args = parser.parse_args()
assert args.attempt.isalnum()
attempt_suffix = "" if args.attempt == "first" else "-" + args.attempt
assert args.revision.startswith("r") and args.revision[1:].isdigit()
owner = "tiberio-quality08-" + args.revision + "-" + args.kind + attempt_suffix
names = [
	owner + "-" + service
	for service in (("frontend", "app", "db", "redis") if args.kind == "existing" else ("app", "db", "redis"))
]
originals = [
	"tiberio-frappe-local-" + service + "-1"
	for service in ("frontend", "backend", "websocket", "worker", "scheduler", "db", "redis")
]
before = projection(inspect(originals))
rows = inspect(names)
assert all(row["Config"]["Labels"]["tiberio.quality.owner"] == owner for row in rows)
output = Path(".local/quality/08-" + args.revision + "-" + args.kind + attempt_suffix + "-stopped.json")
assert not output.exists()
commands = []
for name in names:
	if name.endswith("-frontend"):
		command = ["docker", "exec", name, "nginx", "-s", "quit"]
		result = subprocess.run(command, capture_output=True)
		commands.append({"command": command, "exit_code": result.returncode})
	command = ["docker", "stop", "--time", "20", name]
	result = subprocess.run(command, capture_output=True)
	commands.append({"command": command, "exit_code": result.returncode})
	assert result.returncode == 0
after = projection(inspect(originals))
request = urllib.request.Request("http://127.0.0.1:8088/lms", headers={"Host": "tiberio.localhost"})
with urllib.request.urlopen(request, timeout=5) as response:
	status = response.status
proof = {
	"utc_epoch": time.time(),
	"owner": owner,
	"commands": commands,
	"before": projection(rows),
	"after": projection(inspect(names)),
	"original_before": before,
	"original_after": after,
	"original_unchanged": before == after,
	"original_http_status": status,
	"tmpfs_database_discarded_intentionally": True,
	"containers_images_sites_volume_retained": True,
	"not_a_clean_installation_or_restorable_resume": True,
}
output.write_text(json.dumps(proof, indent=2) + "\n")
assert before == after and status == 200 and all(not row["running"] for row in proof["after"])
print(
	json.dumps(
		{
			key: proof[key]
			for key in (
				"owner",
				"original_unchanged",
				"original_http_status",
				"tmpfs_database_discarded_intentionally",
			)
		}
	)
)
