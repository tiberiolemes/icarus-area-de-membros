"""Exercise the combined source using installed dependencies without a product mount."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

source = Path("/source")
root = Path("/tmp/quality08")
bench = Path("/home/frappe/frappe-bench")
for folder in ("frontend", "lms", "local", "docs/audit/quality"):
	shutil.copytree(
		source / folder,
		root / folder,
		ignore=shutil.ignore_patterns("node_modules", "__pycache__", "evidence"),
	)
evidence = root / "docs/audit/quality/evidence"
evidence.mkdir(parents=True, exist_ok=True)
for name in ("02-new-messages.json", "11-child-content-pt-BR.json"):
	shutil.copy2(source / "docs/audit/quality/evidence" / name, evidence / name)
(root / "frontend/node_modules").symlink_to(bench / "apps/lms/frontend/node_modules")
(root.parent / "frappe").symlink_to(bench / "apps/frappe")
result = subprocess.run(
	[
		"node",
		"node_modules/.bin/vitest",
		"run",
		"--maxWorkers=2",
		"--reporter=json",
		"--outputFile=/out/" + os.environ.get("QC08_REPORT", "08-vitest-combined.json"),
		*sys.argv[1:],
	],
	cwd=root / "frontend",
)
raise SystemExit(result.returncode)
