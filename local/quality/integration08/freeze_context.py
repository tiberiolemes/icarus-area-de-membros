"""Freeze the complete Docker input, including vendored payments and no private site data."""

import hashlib
import io
import json
import tarfile
from pathlib import Path


def freeze(root: Path, destination: Path):
	assert not destination.exists(), "Never overwrite a frozen build context"
	files = {}

	def ignored(path):
		relative = path.relative_to(root)
		parts = relative.parts
		return (
			any(part in {".git", "node_modules", "__pycache__", ".ruff_cache"} for part in parts)
			or (parts[0] == ".local" and (len(parts) == 1 or parts[1] != "payments"))
			or parts[:2] == ("local", "assets")
			or path.name in {"yarn-error.log", ".DS_Store", ".env"}
			or path.name.startswith(".env.")
		)

	# Walk explicitly so excluded private directories are never read.
	pending = [root]
	with tarfile.open(destination, "x") as archive:
		while pending:
			directory = pending.pop()
			for path in sorted(directory.iterdir()):
				if path == root / ".local":
					payments = path / "payments"
					assert payments.is_dir() and not payments.is_symlink()
					pending.append(payments)
					continue
				if ignored(path):
					continue
				if path.is_dir() and not path.is_symlink():
					pending.append(path)
					continue
				name = str(path.relative_to(root))
				info = archive.gettarinfo(str(path), arcname=name)
				info.uid = info.gid = 1000
				info.uname = info.gname = "frappe"
				info.mtime = 0
				if path.is_symlink():
					assert not Path(info.linkname).is_absolute(), "External absolute context symlink"
					assert path.resolve().is_relative_to(root), "Context symlink escapes workspace"
					files[name] = {"symlink": info.linkname, "mode": info.mode}
					archive.addfile(info)
				else:
					assert path.is_file(), "Only regular files and internal symlinks are build inputs"
					with path.open("rb") as stream:
						data = stream.read()
					files[name] = {"sha256": hashlib.sha256(data).hexdigest(), "mode": info.mode}
					archive.addfile(info, io.BytesIO(data))
	digest = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
	with destination.open("rb") as stream:
		archive_digest = hashlib.file_digest(stream, "sha256").hexdigest()
	return {"source_sha256": digest, "files": files, "archive_sha256": archive_digest}
