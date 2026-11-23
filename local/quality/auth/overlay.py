"""Hash-pinned auth overlay; the integrator composes its verification with i18n."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
MANIFEST = HERE / "framework-overlay.json"


def expected_after(path, earlier_after):
	manifest = json.loads(MANIFEST.read_text())
	row = next((row for row in manifest["patches"] if row["path"] == path), None)
	if not row:
		return earlier_after
	if row["before_sha256"] != earlier_after:
		raise ValueError("Auth overlay does not follow the expected i18n hash: " + path)
	return row["after_sha256"]


def verify(root):
	manifest = json.loads(MANIFEST.read_text())
	if '__version__ = "16.60.2"' not in (root / "__init__.py").read_text():
		raise ValueError("Unsupported framework version")
	for row in manifest["patches"]:
		actual = hashlib.sha256((root / row["path"]).read_bytes()).hexdigest()
		if actual != row["after_sha256"]:
			raise ValueError("Auth overlay changed after application/build: " + row["path"])
	return len(manifest["patches"])


if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("--framework", required=True, type=Path)
	parser.add_argument("--verify-only", action="store_true")
	args = parser.parse_args()
	if not args.verify_only:
		sys.path.insert(0, str(HERE.parents[1] / "i18n"))
		from apply_overlay import apply

		print(json.dumps({"auth_files_applied": apply(args.framework, json.loads(MANIFEST.read_text()))}))
	print(json.dumps({"auth_files_verified": verify(args.framework)}))
