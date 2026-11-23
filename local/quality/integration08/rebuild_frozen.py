"""Reproduce the identified candidate from frozen inputs and a separately pinned recipe."""

import hashlib
import json
import os
import signal
import subprocess
import tarfile
import time
from pathlib import Path, PurePosixPath

os.umask(0o077)
root = Path(__file__).resolve().parents[3]
private = root / ".local/quality"
stem = "08-build-r6"
manifest = json.loads((private / "08-build-r4-inputs.json").read_text())
assert manifest["source_sha256"] == "3987c60a0d6ed4b8cfb91c2fac23fe6f9655e5411487cdc01fa1378539e8d95a"
source = private / "08-build-r4-context.tar"
with source.open("rb") as stream:
	assert hashlib.file_digest(stream, "sha256").hexdigest() == manifest["context_archive_sha256"]
recipe = root / "local/quality/integration08/quality08-frozen.Dockerfile"
recipe_hash = hashlib.sha256(recipe.read_bytes()).hexdigest()
assert recipe_hash == "b2c2999204098a4096fb810efa666ed22a59d182cd860f1b9d2c603c5f3939c9"
context = private / (stem + "-context")
assert not context.exists() and not (private / (stem + "-result.json")).exists()
context.mkdir(mode=0o700)
with tarfile.open(source) as archive:
	assert set(archive.getnames()) == set(manifest["files"])
	links = []
	for item in archive:
		name = PurePosixPath(item.name)
		assert not name.is_absolute() and ".." not in name.parts
		path = context / item.name
		path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
		if item.issym():
			assert not Path(item.linkname).is_absolute()
			assert (path.parent / item.linkname).resolve().is_relative_to(context)
			links.append((path, item.linkname))
		else:
			assert item.isfile(), "Only reviewed regular files and internal symlinks"
			data = archive.extractfile(item).read()
			assert hashlib.sha256(data).hexdigest() == manifest["files"][item.name]["sha256"]
			path.write_bytes(data)
			path.chmod(item.mode)
	for path, target in links:
		path.symlink_to(target)
image = "tiberio-frappe-local:quality08-20261121-r6"
proof = {**manifest, "image": image, "source_archive": str(source.relative_to(root)), "effective_recipe": {"path": str(recipe.relative_to(root)), "sha256": recipe_hash}, "context_driver": "verified extracted directory; effective recipe supplied via stdin outside COPY", "frontend_cache_claim_pending_log": True}
(private / (stem + "-inputs.json")).write_text(json.dumps(proof, indent=2) + "\n")
command = ["docker", "build", "--platform", "linux/amd64", "--progress=plain", "--build-arg", "TIBERIO_SOURCE_SHA256=" + manifest["source_sha256"], "--build-arg", "TIBERIO_BUILD_RECIPE_SHA256=" + recipe_hash, "-t", image, "-f", "-", str(context)]


def sample():
	raw = subprocess.check_output(["docker", "exec", "tiberio-frappe-local-db-1", "cat", "/proc/meminfo"], text=True)
	return {"utc_epoch": time.time(), **{line.split(":")[0]: int(line.split()[1]) * 1024 for line in raw.splitlines() if line.startswith(("MemTotal:", "MemAvailable:"))}}


samples = [sample()]
reserve = 1073741824
assert samples[0]["MemAvailable"] >= 3221225472 + reserve
with (private / (stem + ".log")).open("wb") as output, recipe.open("rb") as data:
	process = subprocess.Popen(command, stdin=data, stdout=output, stderr=subprocess.STDOUT)
	aborted = False
	try:
		while process.poll() is None:
			time.sleep(2)
			samples.append(sample())
			if samples[-1]["MemAvailable"] < reserve:
				aborted = True
				break
	finally:
		if process.poll() is None:
			process.send_signal(signal.SIGINT)
		code = process.wait(timeout=60)
result = {"command": command, "exit_code": code or int(aborted), "source_sha256": manifest["source_sha256"], "image": image, "source_archive_sha256": manifest["context_archive_sha256"], "effective_recipe_sha256": recipe_hash, "resource_aborted": aborted}
(private / (stem + "-result.json")).write_text(json.dumps(result, indent=2) + "\n")
(private / (stem + "-memory.json")).write_text(json.dumps({"samples": samples, "reserve_bytes": reserve, "envelope_bytes": 3221225472, "aborted": aborted}, indent=2) + "\n")
print(json.dumps(result))
raise SystemExit(result["exit_code"])
