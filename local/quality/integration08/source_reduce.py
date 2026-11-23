"""Check tours/catalogue/templates and local Python on the same final frontend reduction context."""

import argparse
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("label")
parser.add_argument("--container", default="tiberio-quality08-r8-existing-app")
parser.add_argument("--attempt", default="first")
args = parser.parse_args()
assert args.label.replace("-", "").isalnum()
assert args.attempt.isalnum()
root = Path(__file__).resolve().parents[3]
frontend = json.loads((root / ".local/quality" / ("08-frontend-reduce-" + args.label + ".json")).read_text())
assert frontend["exit_code"] == 0 and frontend["development_only"]
target = frontend["target"]
info = json.loads(subprocess.check_output(["docker", "inspect", args.container]))[0]
assert info["Image"] == frontend["container_image_id"]
assert not any(m["Destination"].startswith("/home/frappe/frappe-bench/apps") for m in info["Mounts"])
out = (
	root
	/ ".local/quality"
	/ ("08-source-reduce-" + args.label + ("" if args.attempt == "first" else "-" + args.attempt))
)
assert not out.exists()
out.mkdir()
data = io.BytesIO()
hashes = dict(frontend["files"])
with tarfile.open(fileobj=data, mode="w") as tar:
	for name in (
		"local/translations.json",
		".local/i18n-apps/frappe/frappe/core/doctype/user/user.json",
		"docs/audit/quality/evidence/05-course-card-before.py",
	):
		path = root / name
		raw = path.read_bytes()
		hashes[name] = hashlib.sha256(raw).hexdigest()
		entry = tarfile.TarInfo(name)
		entry.size = len(raw)
		tar.addfile(entry, io.BytesIO(raw))
	for folder in ("lms", "local/quality/privacy07", "local/quality/integration08"):
		for path in sorted((root / folder).rglob("*")):
			if (
				not path.is_file()
				or "__pycache__" in path.parts
				or "public/frontend" in str(path)
				or path.suffix == ".pyc"
			):
				continue
			name = str(path.relative_to(root))
			raw = path.read_bytes()
			if name in hashes:
				assert hashes[name] == hashlib.sha256(raw).hexdigest()
			hashes[name] = hashlib.sha256(raw).hexdigest()
			entry = tarfile.TarInfo(name)
			entry.size = len(raw)
			tar.addfile(entry, io.BytesIO(raw))
python = "/home/frappe/frappe-bench/env/bin/python"
prefix = ["docker", "exec", "-w", target, args.container, python]
subprocess.run(
	[
		"docker",
		"exec",
		"-i",
		args.container,
		python,
		"-c",
		"import sys,tarfile;tarfile.open(fileobj=sys.stdin.buffer,mode='r|').extractall("
		+ repr(target)
		+ ",filter='data')",
	],
	input=data.getvalue(),
	check=True,
)
commands = [
	["local/quality/privacy07/tour_definitions.py"],
	["local/quality/privacy07/catalogue.py"],
	["local/quality/privacy07/check_public.py"],
	[
		"local/i18n/merge_catalogs.py",
		"--frontend",
		"local/i18n/lms-pt-BR.json",
		"--output",
		"local/i18n/merged-pt-BR.json",
		"--csv",
		"lms/translations/pt-BR.csv",
	],
	["frontend/scripts/audit-i18n.py"],
	["-m", "unittest", "discover", "-s", "local/i18n", "-p", "test_framework.py", "-v"],
	["-m", "unittest", "discover", "-s", "lms/tests", "-p", "*_isolated.py", "-v"],
	["-m", "unittest", "discover", "-s", "local/quality/integration08", "-p", "test_safe_process.py", "-v"],
	["-m", "unittest", "discover", "-s", "local/quality/integration08", "-p", "test_system_overlay.py", "-v"],
]
receipt = {
	"development_source_only": True,
	"immutable_acceptance": False,
	"files": hashes,
	"commands": [],
	"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
}
for index, command in enumerate(commands):
	log = out / (str(index) + ".log")
	with log.open("wb") as output:
		result = subprocess.run(prefix + command, stdout=output, stderr=subprocess.STDOUT)
	receipt["commands"].append(
		{
			"command": prefix + command,
			"exit_code": result.returncode,
			"log_sha256": hashlib.sha256(log.read_bytes()).hexdigest(),
		}
	)
	(out / "receipt.json").write_text(json.dumps(receipt, indent=2))
	assert result.returncode == 0, "Retained source check failure: " + str(log)
generated = [
	"lms/public/tours/quality07.json",
	"local/i18n/privacy07-pt-BR.json",
	"local/i18n/merged-pt-BR.json",
	"lms/translations/pt-BR.csv",
]
verify = (
	"import hashlib,json;from pathlib import Path;expected=json.loads("
	+ repr(json.dumps({name: hashes[name] for name in generated}))
	+ ");assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in expected.items());print(json.dumps({'generators_byte_equal':True}))"
)
result = subprocess.run(prefix + ["-c", verify], capture_output=True)
(out / "verify.log").write_bytes(result.stdout + result.stderr)
receipt["generators_byte_equal"] = result.returncode == 0
receipt["exit_code"] = result.returncode
(out / "receipt.json").write_text(json.dumps(receipt, indent=2))
print(
	json.dumps(
		{
			"source_check_commands": len(commands),
			"generators_byte_equal": receipt["generators_byte_equal"],
			"exit_code": result.returncode,
		}
	)
)
raise SystemExit(result.returncode)
