"""Disposable native nginx/Gunicorn reduction; source overlays are explicitly development."""

import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

os.umask(0o077)
ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).parent
BENCH = "/home/frappe/frappe-bench"
attempt = sys.argv[1] if len(sys.argv) == 2 else "first"
assert attempt.isalnum()
OWNER = "tiberio-quality08-r9-logging-reduce" + ("" if attempt == "first" else "-" + attempt)
OUT = ROOT / ".local/quality" / ("08-r9-logging-reduce" + ("" if attempt == "first" else "-" + attempt))
assert not OUT.exists()
OUT.mkdir()


def docker(*args, check=True, input=None):
	return subprocess.run(["docker", *args], capture_output=True, check=check, input=input)


app = json.loads(docker("inspect", "tiberio-quality08-r8-existing-app").stdout)[0]
assert app["Config"]["Labels"]["tiberio.quality.owner"] == "tiberio-quality08-r8-existing"
assert app["Image"] == "sha256:22b149aac5b4ac22747b77329cc263e7254d72405fbf468c3e35228342fe88d6"
original = json.loads(
	docker(
		"inspect",
		*[
			"tiberio-frappe-local-" + role + "-1"
			for role in ("frontend", "backend", "websocket", "worker", "scheduler", "db", "redis")
		],
	).stdout
)
mem = docker("exec", app["Id"], "cat", "/proc/meminfo").stdout.decode()
available = int(next(line.split()[1] for line in mem.splitlines() if line.startswith("MemAvailable:"))) * 1024
assert available >= 1073741824 + 805306368
for suffix in ("backend", "frontend"):
	assert docker("inspect", OWNER + "-" + suffix, check=False).returncode != 0

mounts = []
system = json.loads((HERE / "system-overlay.json").read_text())
for row in system["patches"]:
	before = docker("exec", app["Id"], "cat", "/" + row["path"]).stdout
	assert hashlib.sha256(before).hexdigest() == row["before_sha256"]
	text = before.decode()
	for old, new, count in row["replacements"]:
		assert text.count(old) == count
		text = text.replace(old, new)
	assert hashlib.sha256(text.encode()).hexdigest() == row["after_sha256"]
	path = OUT / row["path"]
	path.parent.mkdir(parents=True, exist_ok=True)
	path.write_text(text)
	path.chmod(0o755 if path.suffix == ".sh" else 0o644)
	mounts += ["-v", str(path) + ":/" + row["path"] + ":ro"]

backend_mounts = []
overlay = json.loads((HERE / "realtime-overlay.json").read_text())
for row in overlay["patches"]:
	if row["path"] not in ("frappe/utils/logger.py", "frappe/utils/error.py"):
		continue
	before = docker("exec", app["Id"], "cat", BENCH + "/apps/frappe/" + row["path"]).stdout
	assert hashlib.sha256(before).hexdigest() == row["before_sha256"]
	text = before.decode()
	for old, new in row["replacements"]:
		assert text.count(old) == 1
		text = text.replace(old, new)
	assert hashlib.sha256(text.encode()).hexdigest() == row["after_sha256"]
	path = OUT / row["path"]
	path.parent.mkdir(parents=True, exist_ok=True)
	path.write_text(text)
	path.chmod(0o644)
	backend_mounts += ["-v", str(path) + ":" + BENCH + "/apps/frappe/" + row["path"] + ":ro"]
backend_mounts += [
	"-v",
	str(ROOT / "lms/lms/log_sanitizer.py") + ":" + BENCH + "/apps/lms/lms/lms/log_sanitizer.py:ro",
]
for path in (
	HERE / "safe_process.py",
	HERE / "system_overlay.py",
	HERE / "system-overlay.json",
	ROOT / "lms/lms/log_sanitizer.py",
):
	mounts += ["-v", str(path) + ":/qa/" + path.name + ":ro"]
shim = "import sys,runpy,lms.lms;lms.lms.__path__.append('/qa');sys.path.insert(0,'/qa');runpy.run_path('/qa/safe_process.py',run_name='__main__')"
base = [
	"run",
	"-d",
	"--pull=never",
	"--platform",
	"linux/amd64",
	"--init",
	"--label",
	"tiberio.quality.owner=" + OWNER,
	"--network",
	"tiberio-quality08-r8-existing",
	"--entrypoint",
	BENCH + "/env/bin/python",
	"-v",
	"tiberio-quality08-r8-existing-sites:" + BENCH + "/sites",
	*mounts,
]
created = []
receipt = {
	"stage": "development-native-logging-reduction",
	"immutable_acceptance": False,
	"base_image": app["Image"],
	"source_overlays": True,
	"memory_available_before_bytes": available,
	"reserve_bytes": 1073741824,
	"markers_are_credentials": False,
	"http": [],
	"exit_code": 1,
}


def request(path, marker, *, authorization=False):
	headers = {
		"Host": "tiberio.localhost",
		"Referer": "http://quality08.localhost/login?key=" + marker + "&token=" + marker,
		"Cookie": "sid=" + marker,
	}
	if authorization:
		headers["Authorization"] = "Bearer " + marker
	request = urllib.request.Request("http://127.0.0.1:8091" + path, headers=headers)
	try:
		with urllib.request.urlopen(request, timeout=5) as response:
			return response.status
	except urllib.error.HTTPError as error:
		return error.code


try:
	backend = OWNER + "-backend"
	docker(
		*base,
		"--name",
		backend,
		"--memory",
		"512m",
		"--memory-swap",
		"512m",
		*backend_mounts,
		"-e",
		"GUNICORN_WORKERS=2",
		"-e",
		"GUNICORN_THREADS=1",
		app["Image"],
		"-c",
		shim,
		"backend",
	)
	created.append(backend)
	frontend = OWNER + "-frontend"
	docker(
		*base,
		"--name",
		frontend,
		"--memory",
		"192m",
		"--memory-swap",
		"192m",
		"-p",
		"127.0.0.1:8091:8080",
		"-e",
		"BACKEND=" + backend + ":8000",
		"-e",
		"SOCKETIO=tiberio-quality08-r8-existing-app:9000",
		"-e",
		"FRAPPE_SITE_NAME_HEADER=tiberio.localhost",
		"-e",
		"NGINX_LISTEN_PORT=8080",
		app["Image"],
		"-c",
		shim,
		"nginx",
	)
	created.append(frontend)
	docker("network", "connect", "tiberio-quality08-r8-existing-web", frontend)
	deadline = time.monotonic() + 45
	while True:
		try:
			if request("/api/method/ping", "qc08_ready_noncredential") == 200:
				break
		except OSError:
			pass
		assert time.monotonic() < deadline, "Native supervised servers did not become ready"
		time.sleep(0.3)
	markers = ["qc08_log_synthetic_" + str(index) for index in range(3)]
	for index, marker in enumerate(markers):
		path = "/api/method/ping?key=" + marker + "&token=" + marker + "&value=%22" + marker + "%5C%22"
		status = request(path, marker)
		assert status == 200
		receipt["http"].append(
			{"kind": "normal-multiple-query-escaped-referrer-authorization-cookie", "status": status}
		)
	assert request("/api/method/ping?key=" + markers[0], markers[1], authorization=True) == 401
	receipt["http"].append({"kind": "invalid-synthetic-authorization-cookie", "status": 401})
	native = docker(
		"exec",
		"-i",
		"-w",
		BENCH + "/sites",
		backend,
		BENCH + "/env/bin/python",
		"-",
		input=(HERE / "log_native_probe.py").read_bytes(),
		check=False,
	)
	(OUT / "native-file-db.log").write_bytes(native.stdout + native.stderr)
	assert native.returncode == 0, "Native file/DB boundary probe failed; retained private log"
	receipt["native_file_db_boundary"] = json.loads(native.stdout.splitlines()[-1])
	# A running owned upstream with a closed port gives a real refusal, rather than an orphaned IP timeout.
	patch = (
		"from pathlib import Path;p=Path('/etc/nginx/conf.d/frappe.conf');s=p.read_text();assert s.count("
		+ repr(backend + ":8000")
		+ ")==1;p.write_text(s.replace("
		+ repr(backend + ":8000")
		+ ", 'tiberio-quality08-r8-existing-app:65500'))"
	)
	docker("exec", frontend, BENCH + "/env/bin/python", "-c", patch)
	docker("kill", "--signal", "SIGHUP", frontend)
	time.sleep(0.5)
	status = request("/api/method/ping?key=" + markers[0] + "&token=" + markers[1], markers[2])
	assert status == 502
	receipt["http"].append({"kind": "real-upstream-unavailable", "status": status})
	# Native graceful exits are tested against the supervised processes, never by killing their child.
	docker("stop", "--signal", "SIGTERM", "--time", "40", backend)
	docker("stop", "--signal", "SIGQUIT", "--time", "40", frontend)
	receipt["logs"] = {}
	for name in created:
		logs = docker("logs", name).stdout + docker("logs", name).stderr
		assert not any(marker.encode() in logs for marker in markers + ["qc08_ready_noncredential"])
		path = OUT / (name.removeprefix(OWNER + "-") + ".log")
		path.write_bytes(logs)
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
			"native_exit_code": info["State"]["ExitCode"],
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
	assert [
		(x["Id"], x["Image"], x["State"]["StartedAt"], x["HostConfig"]["RestartPolicy"]) for x in current
	] == [(x["Id"], x["Image"], x["State"]["StartedAt"], x["HostConfig"]["RestartPolicy"]) for x in original]
	assert all(x["State"]["Running"] and not x["State"]["OOMKilled"] for x in current)
	with urllib.request.urlopen(
		urllib.request.Request("http://127.0.0.1:8088/lms", headers={"Host": "tiberio.localhost"}), timeout=5
	) as response:
		assert response.status == 200
	receipt["original_seven_unchanged_http200"] = True
	receipt["harness_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
	receipt["inputs"] = {
		str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
		for path in [
			HERE / "safe_process.py",
			HERE / "system_overlay.py",
			HERE / "system-overlay.json",
			HERE / "realtime-overlay.json",
			ROOT / "lms/lms/log_sanitizer.py",
		]
	}
	(OUT / "receipt.json").write_text(json.dumps(receipt, indent=2))
print(json.dumps(receipt))
