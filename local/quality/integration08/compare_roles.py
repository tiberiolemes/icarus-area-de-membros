"""Read-only original versus isolated migrated role rows; stdout has no identities."""

import collections
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
prefix = (
	(root / "local/quality/integration08/protected_projection.py")
	.read_text()
	.split("plan = json.load(sys.stdin)")[0]
)
code = (
	prefix
	+ "\ntry:\n with db.cursor(pymysql.cursors.DictCursor) as cursor:\n  cursor.execute('SELECT * FROM `tabHas Role`'); print(json.dumps(cursor.fetchall(),default=str))\nfinally:\n db.rollback(); db.close()\n"
)
rows = []
for label, container in (
	("original", "tiberio-frappe-local-backend-1"),
	("migrated", "tiberio-quality08-final-existing-app"),
):
	result = subprocess.run(
		["docker", "exec", "-i", container, "/home/frappe/frappe-bench/env/bin/python", "-"],
		input=code.encode(),
		capture_output=True,
		check=True,
	)
	(root / ".local/quality" / ("08-roles-" + label + ".json")).write_bytes(result.stdout)
	rows.append({row["name"]: row for row in json.loads(result.stdout)})
users = [{key: row for key, row in group.items() if row["parenttype"] == "User"} for group in rows]
assert users[0] == users[1], "A User role row changed"
keys = ("parenttype", "parentfield", "parent", "role", "idx")
semantic = [collections.Counter(tuple(row[key] for key in keys) for row in group.values()) for group in rows]
assert semantic[0] == semantic[1], "A permission audience, role, parent, field or order changed"
matched = [{tuple(row[key] for key in keys): row for row in group.values()} for group in rows]
assert all(len(group) == len(original) for group, original in zip(matched, rows, strict=True))
changed = []
for key, before in matched[0].items():
	after = matched[1][key]
	fields = {field for field in before if before[field] != after[field]}
	if fields:
		assert before["parenttype"] == "Workspace" and fields <= {"name", "creation", "modified"}
		changed.append(
			{
				"doctype": "Has Role",
				"parenttype": before["parenttype"],
				"parent": before["parent"],
				"parentfield": before["parentfield"],
				"changed_fields": sorted(fields),
				"role_audience_and_idx_equal": True,
			}
		)
assert len(changed) == 2, "The bounded native Workspace sync delta changed"
print(
	json.dumps(
		{
			"row_counts": [len(row) for row in rows],
			"user_rows_byte_equal": len(users[0]),
			"all_permission_links_and_order_equal": True,
			"workspace_native_sync": changed,
		}
	)
)
