"""Verify the exact auth04 → integration08 chain, without accepting an intermediate source."""

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).parent
SUCCESSORS = {"utils/logger.py", "core/api/user_invitation.py", "templates/includes/login/login.js"}


def verify_composed_auth(root, *, auth_manifest=None, integration_manifest=None):
	auth = auth_manifest or json.loads((HERE.parent / "auth/framework-overlay.json").read_text())
	integration = integration_manifest or json.loads((HERE / "realtime-overlay.json").read_text())
	assert auth["framework_version"] == integration["framework_version"] == "16.60.2"
	assert '__version__ = "16.60.2"' in (root / "__init__.py").read_text()
	assert len({row["path"] for row in auth["patches"]}) == len(auth["patches"])
	assert len({row["path"] for row in integration["patches"]}) == len(integration["patches"])
	auth_paths = {row["path"] for row in auth["patches"]}
	successors = {
		row["path"].removeprefix("frappe/"): row
		for row in integration["patches"]
		if row["path"].startswith("frappe/") and row["path"].removeprefix("frappe/") in auth_paths
	}
	assert set(successors) == SUCCESSORS
	assert SUCCESSORS <= {row["path"] for row in auth["patches"]}
	for row in auth["patches"]:
		path = root / row["path"]
		assert not path.is_symlink() and path.resolve().is_relative_to(root.resolve())
		data = path.read_bytes()
		if row["path"] in successors:
			next_row = successors[row["path"]]
			assert next_row["before_sha256"] == row["after_sha256"], row["path"]
			assert hashlib.sha256(data).hexdigest() == next_row["after_sha256"], row["path"]
			# Reconstruct the auth04 output from the final bytes; the bridge itself is also checked.
			text = data.decode()
			for before, after in reversed(next_row["replacements"]):
				assert after and text.count(after) == 1, row["path"]
				text = text.replace(after, before)
			assert hashlib.sha256(text.encode()).hexdigest() == row["after_sha256"], row["path"]
		else:
			assert hashlib.sha256(data).hexdigest() == row["after_sha256"], row["path"]
	return len(auth["patches"])
