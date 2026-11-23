"""Build the authorized OLD recovery image locally by exact ID, without project data."""

import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path

os.umask(0o077)
ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).parent
BENCH = "/home/frappe/frappe-bench"
BASE = "sha256:81045a6d8e1db3c49fd7aca81c5d145bdbd9715b4f2454ef4612b66fbaa3ed2c"
NAME = "tiberio-quality08-recovery-build"
TAG = "tiberio-frappe-local:rollback-compat08-20261122"
parser = argparse.ArgumentParser()
parser.add_argument("--wheels", required=True, type=Path)
args = parser.parse_args()
work = ROOT / ".local/quality/08-recovery-image-third"
assert not work.exists()
work.mkdir()
manifest = json.loads((HERE / "wheels-manifest.json").read_text())
overlay = json.loads((HERE / "context-overlay.json").read_text())
assert manifest["base_image_id"] == overlay["base_image_id"] == BASE
assert set(p.name for p in args.wheels.iterdir()) == set(manifest["wheels"])
for name, entry in manifest["wheels"].items():
	assert hashlib.sha256((args.wheels / name).read_bytes()).hexdigest() == entry["sha256"]
base = json.loads(subprocess.check_output(["docker", "image", "inspect", BASE]))[0]
proof = {"base_image_id": BASE, "method": "create exact local ID, install two verified wheels, exact declaration overlay, commit; not Dockerfile build or byte-reproducible commit digest", "commands": [], "memory_samples": [], "exit_code": 1}


def memory():
	raw = subprocess.check_output(["docker", "exec", "tiberio-frappe-local-db-1", "cat", "/proc/meminfo"], text=True)
	value = {line.split(":")[0]: int(line.split()[1]) * 1024 for line in raw.splitlines() if line.startswith(("MemTotal:", "MemAvailable:"))}
	proof["memory_samples"].append({"epoch": time.time(), **value})
	assert value["MemAvailable"] > 1073741824, "Preserve 1GiB VM reserve"
	return value


def run(command, label, data=None):
	memory()
	with (work / (label + ".log")).open("xb") as log:
		result = subprocess.run(command, input=data, stdout=log, stderr=subprocess.STDOUT)
	proof["commands"].append({"command": command, "exit_code": result.returncode, "log_sha256": hashlib.sha256((work / (label + ".log")).read_bytes()).hexdigest()})
	assert result.returncode == 0, label
	memory()
	return (work / (label + ".log")).read_bytes()


def python(code, label, data=None):
	return run(["docker", "exec", "-i", NAME, BENCH + "/env/bin/python", "-B", "-c", code], label, data)


created = False
try:
	assert memory()["MemAvailable"] > 2684354560
	tmpfs = [argument for target in (base["Config"].get("Volumes") or {}) for argument in ("--tmpfs", target + ":rw,uid=1000,gid=1000,size=32m")]
	run(["docker", "create", "--pull=never", "--platform", "linux/amd64", "--network", "none", "--name", NAME, "--label", "tiberio.quality.owner=" + NAME, "--entrypoint", BENCH + "/env/bin/python", *tmpfs, "--mount", "type=bind,source=" + str(args.wheels.resolve()) + ",target=/opt/qc08-wheels,readonly", "--mount", "type=bind,source=" + str(HERE) + ",target=/opt/qc08-recovery,readonly", BASE, "-B", "-c", "import signal,sys,time;signal.signal(signal.SIGTERM,lambda *_:sys.exit(0));time.sleep(86400)"], "create")
	created = True
	info = json.loads(subprocess.check_output(["docker", "inspect", NAME]))[0]
	assert info["Image"] == BASE and info["HostConfig"]["NetworkMode"] == "none"
	assert all(m["Type"] != "volume" and (m["Type"] == "tmpfs" or not m["RW"]) for m in info["Mounts"])
	assert not info["HostConfig"]["PortBindings"]
	run(["docker", "start", NAME], "start")
	distributions = "import importlib.metadata as m,json;print(json.dumps({d.metadata['Name'].lower():d.version for d in m.distributions()},sort_keys=True))"
	before = json.loads(python(distributions, "distributions-before"))
	python("import importlib.metadata as m;from packaging.specifiers import SpecifierSet;assert m.version('cffi') in SpecifierSet('>=1.0.1');print('preinstalled cffi satisfies native wheel requirement')", "cffi-precondition")
	run(["docker", "exec", NAME, BENCH + "/env/bin/python", "-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir", "--no-index", "--no-deps", "--require-hashes", "--find-links=/opt/qc08-wheels", "-r", "/opt/qc08-recovery/requirements.txt"], "install-two-wheels")
	python("import hashlib,json;from pathlib import Path;m=json.loads(Path('/opt/qc08-recovery/context-overlay.json').read_text());p=Path(m['path']);s=p.read_bytes();assert hashlib.sha256(s).hexdigest()==m['before_sha256'];t=s.decode();assert t.count(m['before'])==1;t=t.replace(m['before'],m['after']);assert hashlib.sha256(t.encode()).hexdigest()==m['after_sha256'];p.write_text(t);print('full preimage, one declaration and full output SHA verified')", "exact-context-overlay")
	after = json.loads(python(distributions, "distributions-after"))
	assert {k: v for k, v in after.items() if k not in before} == {"argon2-cffi": "25.1.0", "argon2-cffi-bindings": "25.1.0"}
	assert all(after.get(k) == v for k, v in before.items())
	diff = run(["docker", "diff", NAME], "filesystem-diff").decode().splitlines()
	paths = [line[2:] for line in diff]
	code = "import hashlib,json,sys;from pathlib import Path;out={};\nfor n in json.load(sys.stdin):\n p=Path(n);out[n]={'type':'directory' if p.is_dir() else 'file' if p.is_file() else 'other','sha256':hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None}\nprint(json.dumps(out,sort_keys=True))"
	files = json.loads(python(code, "changed-files", json.dumps(paths).encode()))
	packages = ("argon2/", "_argon2_cffi_bindings/", "argon2_cffi-25.1.0.dist-info/", "argon2_cffi_bindings-25.1.0.dist-info/")
	venv = BENCH + "/env/lib/python3.14/site-packages/"
	for line in diff:
		operation, path = line[0], line[2:]
		assert operation != "D", "Unexpected deletion: " + path
		if files[path]["type"] == "directory":
			assert path in {"/opt", "/opt/qc08-recovery", "/opt/qc08-wheels"} or path.startswith(tuple(venv + p for p in packages)) or any(target.startswith(path.rstrip("/") + "/") for target in (overlay["path"], *(venv + p for p in packages))), path
		else:
			assert path == overlay["path"] or path.startswith(tuple(venv + p for p in packages)), "Unexpected file: " + path
	assert files[overlay["path"]]["sha256"] == overlay["after_sha256"]
	proof["distributions_delta"] = {"added": {"argon2-cffi": "25.1.0", "argon2-cffi-bindings": "25.1.0"}, "existing_unchanged": len(before)}
	proof["filesystem_diff"] = diff
	proof["changed_file_inventory"] = files
	run(["docker", "stop", "--time", "20", NAME], "stop-before-commit")
	labels = {"io.tiberio.recovery.base": BASE, "io.tiberio.recovery.overlay": hashlib.sha256((HERE / "context-overlay.json").read_bytes()).hexdigest(), "io.tiberio.recovery.generator": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
	changes = [value for key in ("Entrypoint", "Cmd") for value in ("--change", ("ENTRYPOINT" if key == "Entrypoint" else "CMD") + " " + json.dumps(base["Config"][key]))]
	changes += [value for key, val in labels.items() for value in ("--change", "LABEL " + key + "=" + val)]
	run(["docker", "commit", *changes, NAME, TAG], "commit-new-image")
	final = json.loads(subprocess.check_output(["docker", "image", "inspect", TAG]))[0]
	assert final["RootFS"]["Layers"][:len(base["RootFS"]["Layers"])] == base["RootFS"]["Layers"]
	assert {k: v for k, v in final["Config"].items() if k != "Labels"} == {k: v for k, v in base["Config"].items() if k != "Labels"}, "Executable image configuration changed"
	expected_labels = {**(base["Config"].get("Labels") or {}), "tiberio.quality.owner": NAME, **labels}
	assert final["Config"]["Labels"] == expected_labels
	proof.update(exit_code=0, image_id=final["Id"], executable_configuration_preserved=True, base_layers_preserved=True, application_source_delta_only_context=True, build_network="none", project_data_credentials_or_site_volumes_present=False, labels_added={"tiberio.quality.owner": NAME, **labels})
finally:
	if created:
		info = json.loads(subprocess.check_output(["docker", "inspect", NAME]))[0]
		if info["State"]["Running"]:
			subprocess.run(["docker", "stop", "--time", "20", NAME], check=True, capture_output=True)
	proof["generator_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
	proof["input_sha256"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (HERE / "wheels-manifest.json", HERE / "requirements.txt", HERE / "context-overlay.json")}
	(work / "receipt.json").write_text(json.dumps(proof, indent=2) + "\n")
print(json.dumps({k: proof[k] for k in ("exit_code", "image_id", "executable_configuration_preserved", "base_layers_preserved")}))
