"""Run one local acceptance stage with explicit memory reserve and retained logs."""

import argparse
import hashlib
import json
import os
import signal
import subprocess
import time
from pathlib import Path

os.umask(0o077)
parser = argparse.ArgumentParser()
parser.add_argument("revision")
parser.add_argument("stage", choices=("fresh", "existing", "native-setup", "native-suite", "webform-http", "privacy-http", "privacy-negative-rq", "invitation-http", "signup-http", "ws-native", "ws-more", "ws-load", "flow", "framework", "native-report"))
parser.add_argument("--subnet")
parser.add_argument("--backup", type=Path)
parser.add_argument("--attempt", default="first")
args = parser.parse_args()
assert args.attempt.isalnum()
attempt_suffix = "" if args.attempt == "first" else "-" + args.attempt
assert args.revision.startswith("r") and args.revision[1:].isdigit()
root = Path(__file__).resolve().parents[3]
bench = "/home/frappe/frappe-bench"
owner = "tiberio-quality08-" + args.revision + "-existing"
commands = {
	"fresh": [
		"python3",
		"local/quality/integration08/install_proof.py",
		"fresh",
		"--revision",
		args.revision,
	],
	"existing": [
		"python3",
		"local/quality/integration08/install_proof.py",
		"existing",
		"--revision",
		args.revision,
	],
	"native-setup": ["python3", "local/quality/integration08/native_setup.py", args.revision],
	"native-suite": [
		"docker",
		"exec",
		"-w",
		bench + "/sites",
		owner + "-app",
		bench + "/env/bin/python",
		bench + "/apps/lms/local/quality/integration08/native_suite.py",
	],
}
for name, script in (("webform-http", "webform_native_http.py"), ("privacy-http", "privacy_native_http.py"), ("privacy-negative-rq", "privacy_negative_rq.py"), ("invitation-http", "invitation_gunicorn.py"), ("signup-http", "privacy_signup_http.py")):
	commands[name] = ["docker", "exec", "-w", bench + "/sites", owner + "-app", bench + "/env/bin/python", bench + "/apps/lms/local/quality/integration08/" + script]
for name, script in (("ws-native", "ws_native.cjs"), ("ws-more", "ws_native_more.cjs"), ("ws-load", "ws_native_load.cjs"), ("flow", "ws_flow.cjs")):
	commands[name] = ["docker", "exec", "-w", bench + "/sites", owner + "-app", "node", bench + "/apps/lms/local/quality/integration08/" + script]
commands["framework"] = ["docker", "exec", "-e", "PYTHONPATH=/tmp/qc08-framework-deps", "-e", "QC08_FRAMEWORK_ATTEMPT=r16full", "-w", bench + "/sites", owner + "-app", bench + "/env/bin/python", bench + "/apps/lms/local/quality/integration08/framework_lab.py", "frappe.core.doctype.file.test_file", "frappe.core.doctype.error_log.test_error_log", "frappe.core.doctype.user.test_user", "frappe.tests.test_auth", "frappe.tests.test_password", "frappe.tests.test_password_strength", "frappe.tests.test_twofactor", "frappe.tests.test_twofactor_login", "frappe.website.doctype.web_form.test_web_form", "frappe.website.doctype.web_form.test_web_form_table_multiselect", "frappe.website.doctype.web_form_request.test_web_form_request", "frappe.website.doctype.personal_data_deletion_request.test_personal_data_deletion_request", "frappe.website.doctype.personal_data_download_request.test_personal_data_download_request"]
commands["native-report"] = ["docker", "exec", "-w", bench + "/sites", owner + "-app", bench + "/env/bin/python", bench + "/apps/lms/local/quality/integration08/pdf_layout_fixture.py", "/tmp/qc08-pdf-immutable21"]
if args.stage == "native-report":
	assert args.revision == "r21"
	image = json.loads((root / "docs/audit/quality/evidence/08-build-r21.json").read_text())["image_id"]
	info = json.loads(subprocess.check_output(["docker", "inspect", owner + "-app"]))[0]
	assert info["Image"] == image and info["Config"]["Labels"]["tiberio.quality.owner"] == owner
	assert not any(m["Destination"].startswith(bench + "/apps") for m in info["Mounts"])
if args.backup:
	assert args.stage == "existing"
	commands[args.stage] += ["--backup", str(args.backup.resolve())]
if args.subnet:
	assert args.stage in ("fresh", "existing")
	commands[args.stage] += ["--subnet", args.subnet]
if attempt_suffix and args.stage in ("fresh", "existing"):
	commands[args.stage] += ["--attempt", args.attempt]
stem = root / ".local/quality" / ("08-" + args.revision + "-stage-" + args.stage + attempt_suffix)
assert not any(stem.with_suffix(suffix).exists() for suffix in (".json", ".log"))


def sample():
	raw = subprocess.check_output(
		["docker", "exec", "tiberio-frappe-local-db-1", "cat", "/proc/meminfo"], text=True
	)
	return {
		"utc_epoch": time.time(),
		**{
			line.split(":")[0]: int(line.split()[1]) * 1024
			for line in raw.splitlines()
			if line.startswith(("MemTotal:", "MemAvailable:"))
		},
	}


reserve, envelope = 1073741824, 1610612736
samples = [sample()]
assert samples[0]["MemAvailable"] >= reserve + envelope, "Insufficient local memory before stage"
aborted = False
stopped_on_reserve_abort = []
with stem.with_suffix(".log").open("wb") as output:
	process = subprocess.Popen(commands[args.stage], cwd=root, stdout=output, stderr=subprocess.STDOUT)
	try:
		while process.poll() is None:
			time.sleep(5)
			samples.append(sample())
			if samples[-1]["MemAvailable"] < reserve:
				aborted = True
				break
	finally:
		if process.poll() is None:
			process.send_signal(signal.SIGINT)
		if aborted:
			# A disconnected docker exec is not proof its in-container work stopped.
			for kind in ("fresh", "existing"):
				label = "tiberio-quality08-" + args.revision + "-" + kind + (attempt_suffix if args.stage == kind else "")
				ids = subprocess.check_output(
					["docker", "ps", "-q", "--filter", "label=tiberio.quality.owner=" + label], text=True
				).split()
				for container in ids:
					info = json.loads(subprocess.check_output(["docker", "inspect", container]))[0]
					assert info["Config"]["Labels"]["tiberio.quality.owner"] == label
					subprocess.run(
						["docker", "stop", "--time", "20", container], check=True, stdout=subprocess.DEVNULL
					)
					stopped_on_reserve_abort.append(container)
		code = process.wait(timeout=60)
proof = {
	"stage": args.stage,
	"command": commands[args.stage],
	"exit_code": code or int(aborted),
	"samples": samples,
	"reserve_bytes": reserve,
	"envelope_bytes": envelope,
	"minimum_available_bytes": min(s["MemAvailable"] for s in samples),
	"reserve_breached": aborted,
	"owned_containers_stopped_on_reserve_abort": stopped_on_reserve_abort,
	"scope": "Docker VM global samples every5s; no public capacity claim",
	"log_sha256": hashlib.sha256(stem.with_suffix(".log").read_bytes()).hexdigest(),
	"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
}
stem.with_suffix(".json").write_text(json.dumps(proof, indent=2) + "\n")
print(json.dumps({k: v for k, v in proof.items() if k != "samples"}))
raise SystemExit(proof["exit_code"])
