"""Accept native logging boundaries on the identified image, without source overlays."""

import argparse
import hashlib
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

os.umask(0o077)
parser = argparse.ArgumentParser()
parser.add_argument("revision")
parser.add_argument("--attempt", default="first")
args = parser.parse_args()
assert args.revision.startswith("r") and args.revision[1:].isdigit()
assert args.attempt.isalnum()
ROOT = Path(__file__).resolve().parents[3]
BENCH = "/home/frappe/frappe-bench"
PYTHON = BENCH + "/env/bin/python"
LAB = "tiberio-quality08-" + args.revision + "-existing"
suffix = "" if args.attempt == "first" else "-" + args.attempt
OWNER = "tiberio-quality08-" + args.revision + "-logging" + suffix
OUT = ROOT / ".local/quality" / ("08-" + args.revision + "-logging-immutable" + suffix)
assert not OUT.exists()
OUT.mkdir()


def docker(*command, check=True):
	return subprocess.run(["docker", *command], capture_output=True, check=check)


app = json.loads(docker("inspect", LAB + "-app").stdout)[0]
build = json.loads(
	(ROOT / "docs/audit/quality/evidence" / ("08-build-" + args.revision + ".json")).read_text()
)
assert app["Image"] == build["image_id"] and app["Config"]["Labels"]["tiberio.quality.owner"] == LAB
assert app["State"]["Running"]
network = json.loads(docker("network", "inspect", LAB + "-web").stdout)[0]
assert network["Labels"]["tiberio.quality.owner"] == LAB
raw_memory = docker("exec", app["Id"], "cat", "/proc/meminfo").stdout.decode()
available = (
	int(next(line.split()[1] for line in raw_memory.splitlines() if line.startswith("MemAvailable:"))) * 1024
)
assert available >= 1073741824 + 738197504, "Reserve plus both bounded logging containers is required"
original = json.loads(
	docker(
		"inspect",
		*[
			"tiberio-frappe-local-" + name + "-1"
			for name in ("frontend", "backend", "websocket", "worker", "scheduler", "db", "redis")
		],
	).stdout
)
receipt = {
	"exit_code": 1,
	"image_id": app["Image"],
	"source_overlays": False,
	"http": [],
	"raw_markers_are_credentials": False,
}
created = []
markers = ["qc08_immutable_noncredential_" + str(i) for i in range(3)]


def request(path, marker, authorization=False):
	headers = {
		"Host": "tiberio.localhost",
		"Referer": "http://quality08.localhost/login?key=" + marker + "&token=" + marker,
		"Cookie": "sid=" + marker,
	}
	if authorization:
		headers["Authorization"] = "Bearer " + marker
	try:
		with urllib.request.urlopen(
			urllib.request.Request("http://127.0.0.1:8091" + path, headers=headers), timeout=5
		) as response:
			return response.status
	except urllib.error.HTTPError as error:
		return error.code


try:
	for role in ("backend", "frontend"):
		name = OWNER + "-" + role
		assert docker("inspect", name, check=False).returncode != 0
		env = (
			["-e", "GUNICORN_WORKERS=1", "-e", "GUNICORN_THREADS=2"]
			if role == "backend"
			else [
				"-e",
				"BACKEND=" + OWNER + "-backend:8000",
				"-e",
				"SOCKETIO=" + LAB + "-app:9000",
				"-e",
				"FRAPPE_SITE_NAME_HEADER=tiberio.localhost",
				"-e",
				"NGINX_LISTEN_PORT=8080",
				"-p",
				"127.0.0.1:8091:8080",
			]
		)
		docker(
			"run",
			"-d",
			"--pull=never",
			"--platform",
			"linux/amd64",
			"--init",
			"--name",
			name,
			"--label",
			"tiberio.quality.owner=" + OWNER,
			"--network",
			LAB,
			"--memory",
			"512m" if role == "backend" else "192m",
			"--entrypoint",
			PYTHON,
			"-v",
			LAB + "-sites:" + BENCH + "/sites" + (":ro" if role == "frontend" else ""),
			*env,
			app["Image"],
			BENCH + "/apps/lms/local/quality/integration08/safe_process.py",
			"backend" if role == "backend" else "nginx",
		)
		created.append(name)
		info = json.loads(docker("inspect", name).stdout)[0]
		assert info["Image"] == app["Image"]
		assert {m["Destination"] for m in info["Mounts"]} == {BENCH + "/sites", BENCH + "/logs"}
		assert all(m["Type"] == "volume" for m in info["Mounts"])
		assert (
			next(m for m in info["Mounts"] if m["Destination"] == BENCH + "/sites")["Name"] == LAB + "-sites"
		)
		if role == "frontend":
			docker("network", "connect", LAB + "-web", name)
			assert info["HostConfig"]["PortBindings"] == {
				"8080/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8091"}]
			}
	deadline = time.monotonic() + 45
	while True:
		try:
			if request("/api/method/ping", "qc08_ready_noncredential") == 200:
				break
		except OSError:
			pass
		assert time.monotonic() < deadline, "Immutable logging servers readiness failed"
		time.sleep(0.3)
	for marker in markers:
		status = request(
			"/api/method/ping?key=" + marker + "&token=" + marker + "&value=%22" + marker + "%5C%22", marker
		)
		assert status == 200
		receipt["http"].append({"kind": "normal-multiple-query-escaped-referrer-cookie", "status": status})
	assert request("/api/method/ping?key=" + markers[0], markers[1], True) == 401
	receipt["http"].append({"kind": "invalid-authorization-cookie", "status": 401})
	# The probe is QA code only; runtime application/supervisor files come from the image.
	probe = ROOT / "local/quality/integration08/log_native_probe.py"
	docker("cp", str(probe), OWNER + "-backend:/tmp/qc08-log-native-probe.py")
	receipt["native_probe_harness_sha256"] = hashlib.sha256(probe.read_bytes()).hexdigest()
	native = docker(
		"exec",
		"-w",
		BENCH + "/sites",
		OWNER + "-backend",
		PYTHON,
		"/tmp/qc08-log-native-probe.py",
		check=False,
	)
	(OUT / "native-file-db.log").write_bytes(native.stdout + native.stderr)
	assert native.returncode == 0, "Native file/DB logging boundary failed"
	receipt["native_file_db_boundary"] = json.loads(native.stdout.splitlines()[-1])
	frontend, backend = OWNER + "-frontend", OWNER + "-backend"
	patch = (
		"from pathlib import Path;p=Path('/etc/nginx/conf.d/frappe.conf');s=p.read_text();assert s.count("
		+ repr(backend + ":8000")
		+ ")==1;p.write_text(s.replace("
		+ repr(backend + ":8000")
		+ ","
		+ repr(LAB + "-app:65500")
		+ "))"
	)
	docker("exec", frontend, PYTHON, "-c", patch)
	docker("kill", "--signal", "SIGHUP", frontend)
	time.sleep(0.5)
	assert request("/api/method/ping?key=" + markers[0] + "&token=" + markers[1], markers[2]) == 502
	receipt["http"].append({"kind": "real-upstream-connection-refused", "status": 502})
	docker("stop", "--signal", "SIGTERM", "--time", "40", backend)
	docker("stop", "--signal", "SIGQUIT", "--time", "40", frontend)
	receipt["logs"] = {}
	for name in created:
		result = docker("logs", name)
		logs = result.stdout + result.stderr
		(OUT / (name.removeprefix(OWNER + "-") + ".log")).write_bytes(logs)
		assert not any(marker.encode() in logs for marker in markers + ["qc08_ready_noncredential"])
		assert b"status=200" in logs and b"method=GET" in logs and b"request_id=" in logs
		if name == frontend:
			assert b"status=502" in logs and b"[error]" in logs and b"Connection refused" in logs
		info = json.loads(docker("inspect", name).stdout)[0]
		assert (
			not info["State"]["Running"] and not info["State"]["OOMKilled"] and info["State"]["ExitCode"] == 0
		)
		receipt["logs"][name] = {
			"sha256": hashlib.sha256(logs).hexdigest(),
			"bytes": len(logs),
			"markers_absent": True,
			"native_exit_code": 0,
			"oom_killed": False,
		}
	receipt["exit_code"] = 0
finally:
	for name in created:
		state = json.loads(docker("inspect", name).stdout)[0]
		assert state["Config"]["Labels"]["tiberio.quality.owner"] == OWNER
		if state["State"]["Running"]:
			docker("stop", "--signal", "SIGQUIT", "--time", "40", name)
	current = json.loads(docker("inspect", *[row["Id"] for row in original]).stdout)
	project = lambda x: (x["Id"], x["Image"], x["State"]["StartedAt"], x["HostConfig"]["RestartPolicy"])
	assert [project(x) for x in current] == [project(x) for x in original]
	assert all(x["State"]["Running"] and not x["State"]["OOMKilled"] for x in current)
	with urllib.request.urlopen(
		urllib.request.Request("http://127.0.0.1:8088/lms", headers={"Host": "tiberio.localhost"}), timeout=5
	) as response:
		assert response.status == 200
	receipt["original_seven_unchanged_http200"] = True
	receipt["harness_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
	(OUT / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt))
