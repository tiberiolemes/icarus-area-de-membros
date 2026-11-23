"""Use the installed native formatter; application source is read from stdin only."""

import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
manifest = json.loads((root / "docs/audit/quality/evidence/08-field-lengths.json").read_text())
paths = {"frontend/src/" + row["component"] for row in manifest["fields"] if row["counter"]}
paths.update(
	{
		"frontend/src/components/Sidebar/UserDropdown.vue",
		"frontend/src/pages/Courses/Courses.vue",
		"frontend/src/tests/bundledBranding.test.ts",
		"frontend/src/tests/textLength.test.ts",
		"frontend/src/utils/textLength.ts",
	}
)
for name in sorted(paths):
	path = root / name
	process = subprocess.run(
		[
			"docker",
			"exec",
			"-i",
			"tiberio-quality08-final-existing-app",
			"node",
			"/home/frappe/frappe-bench/apps/frappe/node_modules/.bin/prettier",
			"--stdin-filepath",
			"/home/frappe/frappe-bench/apps/lms/" + name,
		],
		input=path.read_bytes(),
		capture_output=True,
		check=True,
	)
	assert process.stdout and len(process.stdout) > len(path.read_bytes()) / 2
	path.write_bytes(process.stdout)
print(json.dumps({"formatted": len(paths)}))
