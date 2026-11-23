"""Exercise the reviewed chain on native files copied from an unchanged, stopped candidate."""

import argparse
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

from compose_auth import verify_composed_auth


def module(name, path):
	spec = importlib.util.spec_from_file_location(name, path)
	result = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(result)
	return result


parser = argparse.ArgumentParser()
parser.add_argument("--container", default="tiberio-quality08-r8-existing-app")
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
here = Path(__file__).parent
assert not args.output.exists()
info = json.loads(subprocess.check_output(["docker", "inspect", args.container]))[0]
assert not info["State"]["Running"] and not info["State"]["OOMKilled"]
assert info["Image"] == "sha256:22b149aac5b4ac22747b77329cc263e7254d72405fbf468c3e35228342fe88d6"
assert not any(m["Destination"].startswith("/home/frappe/frappe-bench/apps") for m in info["Mounts"])
auth = json.loads((here.parent / "auth/framework-overlay.json").read_text())
integration = json.loads((here / "realtime-overlay.json").read_text())
app = args.output / "apps/frappe"
paths = {"frappe/__init__.py"} | {"frappe/" + r["path"] for r in auth["patches"]}
paths |= {r["path"] for r in integration["patches"]}
commands = []
for name in sorted(paths):
	path = app / name
	path.parent.mkdir(parents=True, exist_ok=True)
	command = ["docker", "cp", args.container + ":/home/frappe/frappe-bench/apps/frappe/" + name, str(path)]
	result = subprocess.run(command, capture_output=True)
	commands.append({"command": command, "exit_code": result.returncode})
	assert result.returncode == 0, name
initial = {name: hashlib.sha256((app / name).read_bytes()).hexdigest() for name in paths}
historical = module("historical_auth", here.parent / "auth/overlay.py")
assert historical.verify(app / "frappe") == 12
apply = module("reviewed_apply", root / "local/i18n/apply_overlay.py").apply
patched = apply(app, integration)
assert patched == 4
assert apply(app, integration) == 0
try:
	historical.verify(app / "frappe")
except ValueError as error:
	assert "Auth overlay changed after application/build" in str(error)
	old_verifier_reproduced = True
else:
	raise AssertionError("The historical verifier must reproduce the r9 incompatibility")
assert verify_composed_auth(app / "frappe") == 12
assert all(
	hashlib.sha256((app / r["path"]).read_bytes()).hexdigest() == r["after_sha256"]
	for r in integration["patches"]
)
receipt = {
	"exit_code": 0,
	"development_reduction_only": True,
	"source_container_id": info["Id"],
	"source_image_id": info["Image"],
	"source_container_stopped": True,
	"commands": commands,
	"input_hashes": initial,
	"final_hashes": {name: hashlib.sha256((app / name).read_bytes()).hexdigest() for name in paths},
	"historical_auth_verified_before": 12,
	"integration_first_patched": patched,
	"integration_second_patched": 0,
	"historical_final_verifier_failure_reproduced": old_verifier_reproduced,
	"composed_auth_verified": 12,
	"integration_verified": len(integration["patches"]),
	"harness_hashes": {
		str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
		for p in (
			Path(__file__),
			here / "compose_auth.py",
			here / "test_compose_auth.py",
			here / "realtime-overlay.json",
			here.parent / "auth/framework-overlay.json",
			root / "local/i18n/verify_applied.py",
		)
	},
}
(args.output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(
	json.dumps(
		{
			k: v
			for k, v in receipt.items()
			if k not in ("commands", "input_hashes", "final_hashes", "harness_hashes")
		}
	)
)
