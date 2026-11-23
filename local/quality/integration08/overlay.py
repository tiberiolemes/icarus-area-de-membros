"""Exact-version overlay for delivery-time native session enforcement."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[1] / "i18n"))
from apply_overlay import apply


def verify(root):
	manifest = json.loads((HERE / "realtime-overlay.json").read_text())
	for row in manifest["patches"]:
		assert hashlib.sha256((root / row["path"]).read_bytes()).hexdigest() == row["after_sha256"], row[
			"path"
		]
	return len(manifest["patches"])


if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("--framework-app", required=True, type=Path)
	parser.add_argument("--verify-only", action="store_true")
	args = parser.parse_args()
	if not args.verify_only:
		manifest = json.loads((HERE / "realtime-overlay.json").read_text())
		print(json.dumps({"session_delivery_overlay_applied": apply(args.framework_app, manifest)}))
	print(json.dumps({"session_delivery_overlay_verified": verify(args.framework_app)}))
