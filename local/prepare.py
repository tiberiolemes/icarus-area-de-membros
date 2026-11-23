"""Verify pinned Payments bytes and tree; publish a complete directory by rename."""

import fcntl
import hashlib
import io
import os
import tarfile
import tempfile
import urllib.request
from pathlib import Path, PurePosixPath

SHA = "1978965f38b8a1f0ea30c5f5dfd1c37d4888afe3"
ARCHIVE_SHA256 = "35f65c2082a3a9d306969453ba0dc6da5f14bb26b30026d01f25f8a32ab5b0a7"
URL = f"https://codeload.github.com/frappe/payments/tar.gz/{SHA}"
ROOT = Path(__file__).resolve().parents[1]
MAX_ARCHIVE = 8 * 1024 * 1024
MAX_TREE = 32 * 1024 * 1024


def download():
	with urllib.request.urlopen(URL, timeout=60) as response:
		if response.url != URL:
			raise ValueError("Payments origin changed; manual review required")
		return response.read(MAX_ARCHIVE + 1)


def unpack(data, destination):
	if len(data) > MAX_ARCHIVE or hashlib.sha256(data).hexdigest() != ARCHIVE_SHA256:
		raise ValueError("Payments archive integrity mismatch")
	root = f"payments-{SHA}"
	with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
		members = archive.getmembers()
		seen, total = set(), 0
		for member in members:
			path = PurePosixPath(member.name)
			if (
				path.is_absolute()
				or ".." in path.parts
				or "\\" in member.name
				or not path.parts
				or path.parts[0] != root
				or member.name.rstrip("/") in seen
				or not (member.isdir() or member.isfile())
			):
				raise ValueError("Unsafe Payments archive member")
			seen.add(member.name.rstrip("/"))
			total += member.size
			if total > MAX_TREE or member.size < 0:
				raise ValueError("Payments tree exceeds budget")
		for member in members:
			relative = PurePosixPath(member.name).relative_to(root)
			path = destination.joinpath(*relative.parts)
			if member.isdir():
				path.mkdir(parents=True, exist_ok=True)
			else:
				path.parent.mkdir(parents=True, exist_ok=True)
				with archive.extractfile(member) as source, path.open("xb") as output:
					output.write(source.read())
					output.flush()
					os.fsync(output.fileno())
				path.chmod(0o755 if member.mode & 0o111 else 0o644)
	for required in ("pyproject.toml", "payments/hooks.py", "license.txt"):
		if not (destination / required).is_file():
			raise ValueError("Incomplete Payments tree")


def tree(path):
	if path.is_symlink() or not path.is_dir():
		raise ValueError("Payments destination must be a real directory")
	result = {}
	for item in sorted(path.rglob("*")):
		if item.is_symlink() or not (item.is_dir() or item.is_file()):
			raise ValueError("Unsupported entry in Payments tree")
		result[item.relative_to(path).as_posix()] = (
			"directory"
			if item.is_dir()
			else (hashlib.sha256(item.read_bytes()).hexdigest(), bool(item.stat().st_mode & 0o111))
		)
	return result


def prepare(target=ROOT / ".local/payments", fetch=download):
	target = Path(target)
	target.parent.mkdir(parents=True, exist_ok=True)
	# flock releases even after SIGKILL; incomplete staging never occupies target.
	with (target.parent / ".payments-prepare.lock").open("a") as lock:
		fcntl.flock(lock, fcntl.LOCK_EX)
		with tempfile.TemporaryDirectory(prefix=".payments-stage-", dir=target.parent) as temporary:
			staged = Path(temporary) / "tree"
			staged.mkdir()
			unpack(fetch(), staged)
			expected = tree(staged)
			if target.exists() or target.is_symlink():
				if tree(target) != expected:
					raise ValueError(
						"Existing Payments tree differs; preserved unchanged. "
						"Review and quarantine it explicitly before retrying."
					)
				return "verified_existing"
			os.rename(staged, target)
			directory = os.open(target.parent, os.O_RDONLY)
			try:
				os.fsync(directory)
			finally:
				os.close(directory)
			return "prepared_atomic"


if __name__ == "__main__":
	print(f"Payments {SHA}: {prepare()}")
