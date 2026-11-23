"""Resume the owned existing-copy proof after a missing log-directory harness error."""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
work = ROOT / ".local/quality/08-final-existing"
owner = "tiberio-quality08-final-existing"
bench = "/home/frappe/frappe-bench"
previous = json.loads((work / "failure-receipt.json").read_text())
assert not (work / "resumed-receipt.json").exists(), (
	"Preserve the accepted proof; use a new attempt directory"
)
assert previous["owned_resource_prefix"] == owner
image = json.loads((ROOT / "docs/audit/quality/evidence/08-build-final.json").read_text())["image_id"]
info = json.loads(subprocess.check_output(["docker", "inspect", owner + "-app"]))[0]
assert info["Image"] == image and info["Config"]["Labels"]["tiberio.quality.owner"] == owner
assert not info["HostConfig"]["PortBindings"]
assert {mount["Destination"] for mount in info["Mounts"]} == {bench + "/sites", "/run/tiberio", "/opt/local"}
assert info["HostConfig"]["Tmpfs"] == {bench + "/logs": "rw,uid=1000,gid=1000,size=64m"}
commands = []


def run(args, name, data=None):
	with (work / (name + ".log")).open("wb") as output:
		result = subprocess.run(
			["docker", "exec", *(["-i"] if data else []), "-w", bench, owner + "-app", *args],
			input=data,
			stdout=output,
			stderr=subprocess.STDOUT,
		)
	commands.append({"args": args, "exit_code": result.returncode, "log": name + ".log"})
	assert result.returncode == 0, name


def projection(name, plan):
	code = (
		"import io,sys\nsys.stdin=io.StringIO("
		+ repr(json.dumps(plan))
		+ ")\n"
		+ (ROOT / "local/quality/integration08/protected_projection.py").read_text()
	)
	run([bench + "/env/bin/python", "-"], name, code.encode())
	return json.loads((work / (name + ".log")).read_text())


try:
	run(
		[
			bench + "/env/bin/python",
			"-c",
			"from pathlib import Path;Path('sites/tiberio.localhost/logs').mkdir(mode=0o700,exist_ok=True)",
		],
		"create-owned-log-directory",
	)
	before = json.loads((work / "protected-before.log").read_text())
	run(["python", bench + "/apps/lms/local/bootstrap.py"], "bootstrap-resumed-first")
	after = projection("protected-resumed-first", before["original_columns"])
	diff = {name for name in before["tables"] if before["tables"][name] != after["tables"][name]}
	assert diff == {"tabHas Role"}, "Unexpected original business-column delta"
	# The raw failed hash is retained. A separate bounded proof requires all45
	# User rows byte-equal and only two unreferenced Workspace child IDs regenerated.
	for script in ("compare_roles.py", "compare_controls.py"):
		proof = subprocess.run(
			["python3", str(ROOT / "local/quality/integration08" / script)],
			stdout=subprocess.PIPE,
			stderr=subprocess.STDOUT,
		)
		(work / (script + "-first.log")).write_bytes(proof.stdout)
		assert proof.returncode == 0, script
	run(["python", bench + "/apps/lms/local/bootstrap.py"], "bootstrap-resumed-second")
	second = projection("protected-resumed-second", before["original_columns"])
	assert {name for name in after["tables"] if after["tables"][name] != second["tables"][name]} == {
		"tabHas Role"
	}
	for script in ("compare_roles.py", "compare_controls.py"):
		proof = subprocess.run(
			["python3", str(ROOT / "local/quality/integration08" / script)],
			stdout=subprocess.PIPE,
			stderr=subprocess.STDOUT,
		)
		(work / (script + "-second.log")).write_bytes(proof.stdout)
		assert proof.returncode == 0, script
	run(
		[
			"bench",
			"--site",
			"tiberio.localhost",
			"execute",
			"lms.tiberio_i18n.apply_and_commit",
			"--kwargs",
			json.dumps({"catalog_path": bench + "/apps/lms/local/i18n/merged-pt-BR.json"}),
		],
		"i18n-resumed-third",
	)
	(work / "resumed-receipt.json").write_text(
		json.dumps(
			{
				"image_id": image,
				"commands": commands,
				"protected_original_columns_equal": True,
				"second_protected_state_equal": True,
				"fresh_install_known_failed_same_candidate": True,
				"product_cutover_permitted": False,
			},
			indent=2,
		)
		+ "\n"
	)
	print(
		json.dumps(
			{
				"existing_migration_equal": True,
				"second_application_equal": True,
				"fresh_candidate_still_failed": True,
			}
		)
	)
finally:
	(work / "resume-command-history.json").write_text(json.dumps(commands, indent=2) + "\n")
