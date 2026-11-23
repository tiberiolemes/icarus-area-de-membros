"""Pin the three local native startup/config changes; refuse any source drift."""

import argparse
import hashlib
import json
from pathlib import Path

TARGETS = {
	"usr/local/bin/nginx-entrypoint.sh",
	"usr/local/bin/start.sh",
	"templates/nginx/frappe.conf.template",
}


def apply(root, manifest, *, verify_only=False):
	assert {row["path"] for row in manifest["patches"]} == TARGETS
	assert len(manifest["patches"]) == len(TARGETS)
	changed = 0
	for row in manifest["patches"]:
		path = root / row["path"]
		assert not path.is_symlink() and path.resolve().is_relative_to(root.resolve())
		data = path.read_bytes()
		digest = hashlib.sha256(data).hexdigest()
		if digest == row["after_sha256"]:
			continue
		assert not verify_only and digest == row["before_sha256"], (
			"Unreviewed native startup source: " + row["path"]
		)
		text = data.decode()
		for old, new, count in row["replacements"]:
			assert type(count) is int and 0 < count <= 4 and text.count(old) == count
			text = text.replace(old, new)
		assert hashlib.sha256(text.encode()).hexdigest() == row["after_sha256"]
		path.write_text(text)
		changed += 1
	return changed


if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("--root", type=Path, default=Path("/"))
	parser.add_argument("--verify-only", action="store_true")
	args = parser.parse_args()
	manifest = json.loads(Path(__file__).with_name("system-overlay.json").read_text())
	print(
		json.dumps(
			{"native_startup_overlay_changed": apply(args.root, manifest, verify_only=args.verify_only)}
		)
	)
