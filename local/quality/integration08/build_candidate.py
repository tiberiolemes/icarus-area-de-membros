"""Build a new candidate once from a complete frozen archive and its pinned recipe."""

import argparse
import hashlib
import json
import os
import re
import signal
import subprocess
import time
from pathlib import Path

from freeze_context import freeze


def main():
	os.umask(0o077)
	parser = argparse.ArgumentParser()
	parser.add_argument("revision")
	parser.add_argument(
		"--resume-frozen",
		action="store_true",
		help="Use an existing archive only when no Docker build log/result exists",
	)
	args = parser.parse_args()
	assert re.fullmatch(r"r[0-9]+", args.revision)
	root = Path(__file__).resolve().parents[3]
	private = root / ".local/quality"
	stem = "08-build-" + args.revision
	assert not any(
		(private / (stem + suffix)).exists()
		for suffix in (
			("-result.json", ".log")
			if args.resume_frozen
			else ("-result.json", "-inputs.json", "-context.tar", ".log")
		)
	), "Preserve every prior attempt"
	restore = json.loads((private / "08-restore-before.json").read_text())
	assert (
		restore["tables_equal"] == 367
		and restore["secret_dollar_check"]
		and restore["restore_containers_removed"]
	)
	archive = private / (stem + "-context.tar")
	if args.resume_frozen:
		inputs = json.loads((private / (stem + "-inputs.json")).read_text())
		proof = {
			"source_sha256": inputs["source_sha256"],
			"archive_sha256": inputs["context_archive_sha256"],
			"files": inputs["files"],
		}
		assert hashlib.file_digest(archive.open("rb"), "sha256").hexdigest() == proof["archive_sha256"]
	else:
		proof = freeze(root, archive)
	recipe_hash = hashlib.sha256((root / "local/Dockerfile").read_bytes()).hexdigest()
	assert proof["files"]["local/Dockerfile"]["sha256"] == recipe_hash
	image = "tiberio-frappe-local:quality08-20261121-" + args.revision
	inputs = {
		"source_sha256": proof["source_sha256"],
		"context_archive_sha256": proof["archive_sha256"],
		"files": proof["files"],
		"image": image,
		"effective_recipe": {"path": "local/Dockerfile", "sha256": recipe_hash},
		"context_scope": "complete frozen Docker input including vendored payments; no site data or external source mounts",
	}
	if not args.resume_frozen:
		(private / (stem + "-inputs.json")).write_text(json.dumps(inputs, indent=2) + "\n")
	command = [
		"docker",
		"build",
		"--platform",
		"linux/amd64",
		"--progress=plain",
		"--build-arg",
		"TIBERIO_SOURCE_SHA256=" + proof["source_sha256"],
		"--build-arg",
		"TIBERIO_BUILD_RECIPE_SHA256=" + recipe_hash,
		"-t",
		image,
		"-f",
		"local/Dockerfile",
		"-",
	]

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

	reserve, envelope = 1073741824, 3221225472
	samples = [sample()]
	assert samples[0]["MemAvailable"] >= reserve + envelope
	assert hashlib.file_digest(archive.open("rb"), "sha256").hexdigest() == proof["archive_sha256"]
	aborted = False
	with (private / (stem + ".log")).open("wb") as output, archive.open("rb") as data:
		process = subprocess.Popen(command, cwd=root, stdin=data, stdout=output, stderr=subprocess.STDOUT)
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
	result = {
		"command": command,
		"exit_code": code or int(aborted),
		"source_sha256": proof["source_sha256"],
		"image": image,
		"context_archive": str(archive.relative_to(root)),
		"context_archive_sha256": proof["archive_sha256"],
		"effective_recipe_sha256": recipe_hash,
		"resource_aborted": aborted,
		"resumed_frozen_before_any_docker_build": args.resume_frozen,
		"runner_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
	}
	(private / (stem + "-result.json")).write_text(json.dumps(result, indent=2) + "\n")
	(private / (stem + "-memory.json")).write_text(
		json.dumps(
			{"samples": samples, "reserve_bytes": reserve, "envelope_bytes": envelope, "aborted": aborted},
			indent=2,
		)
		+ "\n"
	)
	print(json.dumps(result))
	raise SystemExit(result["exit_code"])


if __name__ == "__main__":
	main()
