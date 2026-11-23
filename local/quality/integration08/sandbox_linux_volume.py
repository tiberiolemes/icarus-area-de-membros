"""Move only our disposable test sites to Linux storage; preserve its DB and data."""

import hashlib
import json
import subprocess
from pathlib import Path

from sandbox import BENCH, IMAGE, OWNER, ROOT, WORK, run

info = json.loads(subprocess.check_output(["docker", "inspect", OWNER + "-app"]))[0]
assert info["Config"]["Labels"]["tiberio.quality.owner"] == OWNER
assert all(m.get("Name", "").startswith(OWNER) for m in info["Mounts"] if m["Type"] == "volume")
run(
	["docker", "volume", "create", "--label", "tiberio.quality.owner=" + OWNER, OWNER + "-sites"],
	"linux-volume-create",
)
run(
	[
		"docker",
		"run",
		"--rm",
		"--pull=never",
		"--platform",
		"linux/amd64",
		"--network",
		"none",
		"--user",
		"0",
		"--entrypoint",
		"sh",
		"--tmpfs",
		BENCH + "/sites",
		"-v",
		str(WORK / "sites") + ":/seed:ro",
		"-v",
		OWNER + "-sites:/target",
		IMAGE,
		"-c",
		"cp -a /seed/. /target/ && chown -R 1000:1000 /target",
	],
	"linux-volume-copy",
)
run(["docker", "stop", "--time", "30", info["Id"]], "linux-volume-stop")
stopped = json.loads(subprocess.check_output(["docker", "inspect", info["Id"]]))[0]
assert not stopped["State"]["Running"] and stopped["State"]["ExitCode"] != 137
run(["docker", "rm", info["Id"]], "linux-volume-old-container-remove")
run(
	[
		"docker",
		"run",
		"-d",
		"--pull=never",
		"--name",
		OWNER + "-app",
		"--network",
		OWNER,
		"--label",
		"tiberio.quality.owner=" + OWNER,
		"--platform",
		"linux/amd64",
		"--init",
		"--entrypoint",
		"sleep",
		"--tmpfs",
		BENCH + "/logs:rw,uid=1000,gid=1000,size=64m",
		"-v",
		OWNER + "-sites:" + BENCH + "/sites",
		"-v",
		str(ROOT) + ":/source:ro",
		IMAGE,
		"infinity",
	],
	"linux-volume-app",
)
run(
	["docker", "exec", OWNER + "-app", "mkdir", "-p", BENCH + "/sites/test_quality08.localhost/logs"],
	"linux-site-logs",
)
inputs = json.loads((ROOT / ".local/quality/08-build-inputs.json").read_text())["files"]
delta = {}
for name, previous in inputs.items():
	path = ROOT / name
	if not name.startswith("lms/") or not path.is_file():
		continue
	current = hashlib.sha256(path.read_bytes()).hexdigest()
	if current != previous:
		run(
			["docker", "cp", str(path), OWNER + "-app:" + BENCH + "/apps/lms/" + name],
			"copy-" + name.replace("/", "_"),
		)
		delta[name] = {"image_source_sha256": previous, "development_source_sha256": current}
(WORK / "development-delta.json").write_text(json.dumps(delta, indent=2) + "\n")
print(
	json.dumps(
		{
			"own_linux_volume": OWNER + "-sites",
			"development_files": len(delta),
			"original_resources_changed": False,
		}
	)
)
