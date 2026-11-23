"""Start only the named immutable, owned integration lab's native web processes."""

import argparse
import json
import subprocess
import time

BENCH = "/home/frappe/frappe-bench"
parser = argparse.ArgumentParser()
parser.add_argument("revision")
parser.add_argument("action", choices=("http", "node", "ui-fixtures", "ws-fixtures"))
args = parser.parse_args()
assert args.revision.startswith("r") and args.revision[1:].isdigit()
owner = "tiberio-quality08-" + args.revision + "-existing"
container = owner + "-app"
info = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]
assert info["Config"]["Labels"]["tiberio.quality.owner"] == owner
assert info["State"]["Running"]
assert not any(
	m["Destination"].startswith(BENCH + "/apps") or m["Destination"] == "/source" for m in info["Mounts"]
)
prefix = ["docker", "exec", "-w", BENCH + "/sites", container]
if args.action == "http":
	if int(args.revision[1:]) >= 9:
		# Keep the image's supervisor in front of every native output before any file/driver persists it.
		start = "echo $$ > ../logs/qc08-http-wrapper.pid; exec ../env/bin/python ../apps/lms/local/quality/integration08/safe_process.py backend > ../logs/qc08-http-managed.log 2>&1"
		guard = "import os;from pathlib import Path;p=Path('../logs/qc08-http-wrapper.pid');assert not p.exists() or not Path('/proc/'+p.read_text().strip()).exists(),'Owned HTTP supervisor is already running'"
		subprocess.run(prefix + [BENCH + "/env/bin/python", "-c", guard], check=True)
		subprocess.run(
			[
				"docker",
				"exec",
				"-d",
				"-w",
				BENCH + "/sites",
				"-e",
				"GUNICORN_WORKERS=2",
				"-e",
				"GUNICORN_THREADS=2",
				"-e",
				"GUNICORN_CMD_ARGS=--pid=" + BENCH + "/logs/qc08-http-master.pid",
				container,
				"sh",
				"-c",
				start,
			],
			check=True,
		)
	else:
		subprocess.run(
			prefix
			+ [
				BENCH + "/env/bin/gunicorn",
				"--daemon",
				"--bind",
				"0.0.0.0:8000",
				"--workers",
				"1",
				"--threads",
				"2",
				"--timeout",
				"120",
				"--preload",
				"--pid",
				BENCH + "/logs/qc08-http-master.pid",
				"--error-logfile",
				BENCH + "/logs/qc08-http-error.log",
				"--access-logfile",
				BENCH + "/logs/qc08-http-access.log",
				"--access-logformat",
				"%(t)s %(p)s %(m)s %(U)s %(s)s %(L)s",
				"frappe.app:application",
			],
			check=True,
		)
	deadline = time.monotonic() + 45
	probe = "import urllib.request; r=urllib.request.Request('http://127.0.0.1:8000/api/method/ping',headers={'X-Frappe-Site-Name':'test_quality08.localhost'}); assert urllib.request.urlopen(r,timeout=3).status==200"
	while subprocess.run(prefix + [BENCH + "/env/bin/python", "-c", probe], capture_output=True).returncode:
		if time.monotonic() >= deadline:
			raise RuntimeError("Owned native HTTP readiness failed")
		time.sleep(0.3)
elif args.action == "node":
	# This starts the image's server, never a source overlay or a mock authority.
	subprocess.run(
		[
			"docker",
			"exec",
			"-d",
			"-w",
			BENCH + "/sites",
			container,
			"sh",
			"-c",
			"echo $$ > ../logs/qc08-node.pid; exec node ../apps/frappe/socketio.js > ../logs/qc08-node.log 2>&1",
		],
		check=True,
	)
elif args.action == "ui-fixtures":
	subprocess.run(
		prefix + [BENCH + "/env/bin/python", BENCH + "/apps/lms/local/quality/integration08/ui_fixtures.py"],
		check=True,
	)
elif args.action == "ws-fixtures":
	subprocess.run(
		prefix[:2]
		+ ["-i"]
		+ prefix[2:]
		+ [BENCH + "/env/bin/python", BENCH + "/apps/lms/local/quality/integration08/ws_native_state.py"],
		input=b'{"action":"setup"}',
		check=True,
	)
print(
	json.dumps(
		{
			"action": args.action,
			"container": container,
			"image_id": info["Image"],
			"application_source_overlay": False,
		}
	)
)
