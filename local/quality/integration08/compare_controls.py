"""No blanket Has Role exception: preserve User rows and all control-specific deltas."""

import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
original = json.loads((root / ".local/quality/08-roles-original.json").read_text())
migrated = json.loads((root / ".local/quality/08-roles-migrated.json").read_text())
old_ids = sorted({row["name"] for row in original} - {row["name"] for row in migrated})
assert len(old_ids) == 2
code = (
	"import io,sys\nsys.stdin=io.StringIO("
	+ repr(json.dumps(old_ids))
	+ ")\n"
	+ (root / "local/quality/integration08/control_snapshot.py").read_text()
)
states = []
for label, app in (
	("original", "tiberio-frappe-local-backend-1"),
	("migrated", "tiberio-quality08-final-existing-app"),
):
	result = subprocess.run(
		[
			"docker",
			"exec",
			"-i",
			"-w",
			"/home/frappe/frappe-bench/sites",
			app,
			"/home/frappe/frappe-bench/env/bin/python",
			"-",
		],
		input=code.encode(),
		capture_output=True,
		check=True,
	)
	(root / ".local/quality" / ("08-controls-" + label + ".json")).write_bytes(result.stdout)
	states.append(json.loads(result.stdout))
summary = {}
for doctype in ("DocPerm", "Custom DocPerm", "User Permission", "DocShare"):
	before, after = [{row["name"]: row for row in state["controls"][doctype]} for state in states]
	changes = {}
	for name in before.keys() & after.keys():
		fields = [field for field in before[name] if before[name][field] != after[name].get(field)]
		if fields:
			changes[name] = fields
	summary[doctype] = {
		"counts": [len(before), len(after)],
		"removed_rows": len(before.keys() - after.keys()),
		"added_rows": len(after.keys() - before.keys()),
		"changed_rows": len(changes),
		"changed_columns": sorted({field for fields in changes.values() for field in fields}),
	}
assert all(not state["live_link_references"] and state["foreign_keys_to_has_role"] == 0 for state in states)
summary["regenerated_workspace_child_ids_have_no_live_references"] = True
(root / ".local/quality/08-controls-diff.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary))
