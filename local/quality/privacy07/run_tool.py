"""Run source checks in a disposable offline image, never a product site."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

SOURCE = Path("/source")
ROOT = Path("/tmp/quality07")
BENCH = Path("/home/frappe/frappe-bench")


def run(*args, cwd=None):
	result = subprocess.run([str(arg) for arg in args], cwd=cwd, check=False)
	if result.returncode:
		raise SystemExit(result.returncode)


shutil.copytree(SOURCE / "frontend", ROOT / "frontend", ignore=shutil.ignore_patterns("node_modules"))
(ROOT / "frontend/node_modules").symlink_to(
	BENCH / "apps/lms/frontend/node_modules", target_is_directory=True
)
for folder in ("local/i18n", "lms", "local/quality/privacy07"):
	shutil.copytree(
		SOURCE / folder,
		ROOT / folder,
		dirs_exist_ok=True,
		ignore=shutil.ignore_patterns("frontend", "__pycache__"),
	)
(ROOT.parent / "frappe").symlink_to(BENCH / "apps/frappe", target_is_directory=True)
run(BENCH / "env/bin/python", ROOT / "local/quality/privacy07/check_public.py")
run(
	"node",
	"node_modules/.bin/vitest",
	"run",
	"--maxWorkers=2",
	"--reporter=json",
	"--outputFile=/out/"
	+ os.environ.get("QC07_REPORT", "07-vitest-broad.json" if sys.argv[1:] else "07-tours-targeted.json"),
	*(
		sys.argv[1:]
		or [
			"src/tests/guidedTour.test.ts",
			"src/tests/tourHost.test.ts",
			"src/tests/tourReport.test.ts",
			"src/tests/helpOnboarding.test.ts",
			"src/tests/releaseNotes.test.ts",
			"src/tests/communityModeration.test.ts",
			"src/tests/formFeedback.test.ts",
			"src/tests/newCourseForm.test.ts",
			"src/tests/qualityCourseControls.test.ts",
		]
	),
	cwd=ROOT / "frontend",
)
