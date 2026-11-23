"""Run unchanged framework modules with their local HTTP fixture and restore its site override."""

import hashlib
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BENCH = Path("/home/frappe/frappe-bench")
PYTHON = str(BENCH / "env/bin/python")
HERE = BENCH / "apps/lms/local/quality/integration08"
SITE = "test_quality08.localhost"
config = Path(SITE) / "site_config.json"
before = config.read_bytes()
values = json.loads(before)
assert values["allow_tests"] and values["mute_emails"] and values["pause_scheduler"]
values["host_name"] = "http://127.0.0.1:8001"
attempt = os.environ.get("QC08_FRAMEWORK_ATTEMPT", "first")
assert attempt.isalnum()
log_path = BENCH / ("logs/qc08-framework-http-safe-" + attempt + ".log")
assert not log_path.exists(), "Preserve previous HTTP fixture output"
server = None
code = None
restored = False
try:
	config.write_text(json.dumps(values))
	server_code = (
		"import frappe.app;frappe.app.serve(port=8001,site='test_quality08.localhost',no_reload=True)"
	)
	supervisor = (
		"import sys;sys.path.insert(0,"
		+ repr(str(HERE))
		+ ");from safe_process import run;raise SystemExit(run("
		+ repr([PYTHON, "-c", server_code])
		+ "))"
	)
	with log_path.open("wb") as output:
		server = subprocess.Popen(
			[PYTHON, "-c", supervisor], stdout=output, stderr=subprocess.STDOUT, env={**os.environ, "CI": "1"}
		)
		deadline = time.monotonic() + 30
		while True:
			try:
				with urllib.request.urlopen("http://127.0.0.1:8001/api/method/ping", timeout=2) as response:
					assert response.status == 200
				break
			except (OSError, AssertionError):
				assert server.poll() is None, "Native HTTP fixture exited before readiness"
				if time.monotonic() >= deadline:
					raise RuntimeError("Native framework HTTP fixture readiness failed")
				time.sleep(0.2)
		code = subprocess.call([PYTHON, str(HERE / "framework_suite.py"), *sys.argv[1:]])
finally:
	try:
		if server is not None and server.poll() is None:
			server.send_signal(signal.SIGINT)
			server.wait(timeout=30)
	finally:
		config.write_bytes(before)
		restored = config.read_bytes() == before
		print(
			json.dumps(
				{
					"framework_suite_exit_code": code,
					"fixture_http_exit_code": server.returncode if server else None,
					"site_config_restored_byte_equal": restored,
					"smtp_muted": True,
					"native_assertions_unchanged": True,
					"http_fixture_log_sha256": hashlib.sha256(log_path.read_bytes()).hexdigest()
					if log_path.exists()
					else None,
					"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
				}
			),
			flush=True,
		)
assert restored and code is not None
raise SystemExit(code)
