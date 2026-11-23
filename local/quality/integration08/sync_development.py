"""Record every source delta applied to our development sandbox, never the product."""

import hashlib
import json
import subprocess
from pathlib import Path

from sandbox import BENCH, OWNER, ROOT, WORK, run

inputs = json.loads((ROOT / ".local/quality/08-build-inputs.json").read_text())["files"]
delta = {}
files = subprocess.check_output(
	["git", "ls-files", "--cached", "--others", "--exclude-standard", "lms/"], cwd=ROOT, text=True
).splitlines()
for name in sorted(set(files)):
	previous = inputs.get(name)
	path = ROOT / name
	if name.startswith("lms/") and path.is_file():
		current = hashlib.sha256(path.read_bytes()).hexdigest()
		if current != previous:
			run(
				["docker", "cp", str(path), OWNER + "-app:" + BENCH + "/apps/lms/" + name],
				"copy-" + name.replace("/", "_"),
			)
			delta[name] = {"image_source_sha256": previous, "development_source_sha256": current}
(WORK / "development-delta.json").write_text(json.dumps(delta, indent=2) + "\n")
print(json.dumps({"development_files": len(delta), "pristine_image_acceptance": False}))
