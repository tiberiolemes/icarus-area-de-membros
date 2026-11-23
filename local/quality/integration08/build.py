"""Build one identified local candidate after the proven pre-migration restore."""

import argparse
from contextlib import ExitStack
import hashlib
import json
import signal
import subprocess
import time
from pathlib import Path

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser()
parser.add_argument("--final", action="store_true")
parser.add_argument("--revision", choices=("r2", "r3", "r4"))
args = parser.parse_args()
final = args.final
prefix = "08-build-" + args.revision if args.revision else ("08-build-final" if final else "08-build")
private = root / ".local/quality"
restore = json.loads((private / "08-restore-before.json").read_text())
assert (
	restore["tables_equal"] == 367
	and restore["secret_dollar_check"]
	and restore["restore_containers_removed"]
)
assert not (private / (prefix + "-result.json")).exists(), "Preserve every prior build receipt"
context_path = None
if args.revision == "r4":
	from freeze_context import freeze

	context_path = private / (prefix + "-context.tar")
	context_proof = freeze(root, context_path)
	inputs = context_proof["files"]
	digest = context_proof["source_sha256"]
else:
	files = subprocess.check_output(
		["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=root, text=True
	).splitlines()
	inputs = {}
	for name in sorted(set(files)):
		path = root / name
		if not path.is_file() or path.is_symlink():
			continue
		if (
			name.startswith(("frontend/", "lms/", "local/"))
			and "/evidence/" not in name
			and not name.endswith("yarn-error.log")
			or name
			in {
				"pyproject.toml",
				"package.json",
				"yarn.lock",
				".dockerignore",
				"docs/audit/quality/evidence/02-new-messages.json",
				"docs/audit/quality/evidence/11-child-content-pt-BR.json",
			}
		):
			inputs[name] = hashlib.sha256(path.read_bytes()).hexdigest()
	digest = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
image = "tiberio-frappe-local:quality08-20261121" + (
	"-" + args.revision if args.revision else ("-final" if final else "")
)
assert not (private / (prefix + "-result.json")).exists(), (
	"Preserve the existing build receipt; never overwrite it"
)
(private / (prefix + "-inputs.json")).write_text(
	json.dumps({"source_sha256": digest, "image": image, "files": inputs, "context_scope": "complete frozen Docker input including vendored payments" if context_path else "selected source inputs", **({"context_archive_sha256": context_proof["archive_sha256"]} if context_path else {})}, indent=2) + "\n"
)
command = [
	"docker",
	"build",
	"--platform",
	"linux/amd64",
	"--progress=plain",
	"--build-arg",
	"TIBERIO_SOURCE_SHA256=" + digest,
	"-t",
	image,
	"-f",
	"local/Dockerfile",
	"-" if context_path else ".",
]


def available_memory():
	raw = subprocess.check_output(
		["docker", "exec", "tiberio-frappe-local-db-1", "cat", "/proc/meminfo"], text=True
	)
	values = {
		line.split(":")[0]: int(line.split()[1]) * 1024
		for line in raw.splitlines()
		if line.startswith(("MemTotal:", "MemAvailable:", "MemFree:", "Cached:"))
	}
	return {"time_utc": time.time(), **values}


samples = [available_memory()]
build_envelope = 3221225472 if args.revision == "r4" else 2684354560
reserve = 1073741824
assert samples[0]["MemAvailable"] >= build_envelope + reserve, (
	"Insufficient measured Docker memory; stop only owned labs before building"
)
with ExitStack() as stack:
	log = stack.enter_context((private / (prefix + ".log")).open("w"))
	stream = stack.enter_context(context_path.open("rb")) if context_path else None
	process = subprocess.Popen(command, cwd=root, stdin=stream, stdout=log, stderr=subprocess.STDOUT)
	memory_aborted = False
	try:
		while process.poll() is None:
			samples.append(available_memory())
			if samples[-1]["MemAvailable"] < reserve:
				memory_aborted = True
				break
			time.sleep(5)
	finally:
		if process.poll() is None:
			process.send_signal(signal.SIGINT)
		process.wait(timeout=60)
result = subprocess.CompletedProcess(
	command, (process.returncode or 1) if memory_aborted else process.returncode
)
(private / (prefix + "-memory.json")).write_text(
	json.dumps(
		{
			"scope": "Docker VM global MemAvailable sampled every5s, not a public load/cgroup capacity result",
			"envelope_bytes": build_envelope,
			"reserve_bytes": reserve,
			"aborted": memory_aborted,
			"node_test_heap_mib": 768,
			"vitest_workers": 1,
			"node_assets_heap_mib": 768 if args.revision == "r4" else 1536,
			"samples": samples,
		},
		indent=2,
	)
	+ "\n"
)
(private / (prefix + "-result.json")).write_text(
	json.dumps(
		{"command": command, "exit_code": result.returncode, "source_sha256": digest, "image": image, **({"context_archive": str(context_path.relative_to(root)), "context_archive_sha256": context_proof["archive_sha256"]} if context_path else {})},
		indent=2,
	)
	+ "\n"
)
raise SystemExit(result.returncode)
