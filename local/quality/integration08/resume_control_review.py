"""Complete only an existing-copy proof stopped by its reviewed control guard."""

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

from validate_controls import validate

os.umask(0o077)
parser = argparse.ArgumentParser()
parser.add_argument("revision")
revision = parser.parse_args().revision
assert revision.startswith("r") and revision[1:].isdigit()
root = Path(__file__).resolve().parents[3]
work = root / ".local/quality" / ("08-" + revision + "-existing")
prior = json.loads((work / "failure-receipt.json").read_text())
stage = json.loads((work.parent / ("08-" + revision + "-stage-existing.json")).read_text())
assert stage["exit_code"] == 1 and not stage["reserve_breached"]
assert all(row["exit_code"] == 0 for row in prior["commands"])
assert (
	"validate_controls(before_controls, first_controls, ROOT)"
	in (work.parent / ("08-" + revision + "-stage-existing.log")).read_text()
)
assert not (work / "receipt.json").exists() and not (work / "bootstrap-second.log").exists()
result = json.loads((work.parent / ("08-build-" + revision + "-result.json")).read_text())
inputs = json.loads((work.parent / ("08-build-" + revision + "-inputs.json")).read_text())
image_id = json.loads(subprocess.check_output(["docker", "image", "inspect", result["image"]]))[0]["Id"]
bench = "/home/frappe/frappe-bench"
owner = "tiberio-quality08-" + revision + "-existing"
info = json.loads(subprocess.check_output(["docker", "inspect", owner + "-app"]))[0]
assert info["Image"] == image_id and info["Config"]["Labels"]["tiberio.quality.owner"] == owner
assert info["State"]["Running"] and info["HostConfig"]["PortBindings"] == {}
assert all(m["Destination"] in (bench + "/sites", "/run/tiberio", "/opt/local") for m in info["Mounts"])
assert json.loads(subprocess.check_output(["docker", "network", "inspect", owner]))[0]["Internal"]
commands = list(prior["commands"])


def run(args, label, data=None):
	path = work / (label + ".log")
	assert not path.exists()
	with path.open("wb") as output:
		r = subprocess.run(args, input=data, stdout=output, stderr=subprocess.STDOUT)
	commands.append({"command": args, "exit_code": r.returncode, "log": path.name})
	(work / "review-stage.json").write_text(json.dumps(commands, indent=2) + "\n")
	assert r.returncode == 0, label + " failed; raw log retained"
	return path.read_text()


def capture(filename, label, plan):
	code = (
		"import io,sys\nsys.stdin=io.StringIO("
		+ repr(json.dumps(plan))
		+ ")\n"
		+ (root / "local/quality/integration08" / filename).read_text()
	)
	return json.loads(
		run(
			["docker", "exec", "-i", "-w", bench + "/sites", owner + "-app", bench + "/env/bin/python", "-"],
			label,
			code.encode(),
		)
	)


before, first = [
	json.loads((work / ("protected-" + name + ".log")).read_text()) for name in ("before", "first")
]
old_controls, first_controls = [
	json.loads((work / ("controls-" + name + ".log")).read_text()) for name in ("before", "first")
]
assert {name for name in before["tables"] if before["tables"][name] != first["tables"][name]} <= {
	"tabHas Role"
}
for path in (root / "lms/lms/doctype").rglob("*.json"):
	name = str(path.relative_to(root))
	assert hashlib.sha256(path.read_bytes()).hexdigest() == inputs["files"][name]["sha256"]
first_proof = validate(old_controls, first_controls, root, migrating=True)
(work / "control-proof-first.json").write_text(json.dumps(first_proof, indent=2) + "\n")
current = capture("protected_projection.py", "protected-before-reviewed-repeat", first["original_columns"])
assert current["tables"] == first["tables"], "State changed after the reviewed guard failure"
run(
	["docker", "exec", "-w", bench, owner + "-app", "python", bench + "/apps/lms/local/bootstrap.py"],
	"bootstrap-second",
)
second = capture("protected_projection.py", "protected-second", first["original_columns"])
assert {name for name in first["tables"] if first["tables"][name] != second["tables"][name]} <= {
	"tabHas Role"
}
second_controls = capture(
	"control_snapshot.py",
	"controls-second",
	{kind: [row["name"] for row in first_controls["controls"][kind]] for kind in ("Has Role", "DocPerm")},
)
second_proof = validate(first_controls, second_controls, root, migrating=False)
(work / "control-proof-second.json").write_text(json.dumps(second_proof, indent=2) + "\n")
catalogue = run(
	[
		"docker",
		"exec",
		"-w",
		bench,
		owner + "-app",
		"bench",
		"--site",
		"tiberio.localhost",
		"execute",
		"lms.tiberio_i18n.apply_and_commit",
		"--kwargs",
		json.dumps({"catalog_path": bench + "/apps/lms/local/i18n/merged-pt-BR.json"}),
	],
	"i18n-third-noop",
)
assert all(value == 0 for value in json.loads(catalogue).values())
metadata = """import frappe,json
frappe.init(site='tiberio.localhost');frappe.connect()
try:
 field=frappe.get_meta('LMS Video Watch Duration').get_field('source_identity');indexes=frappe.db.sql('SHOW INDEX FROM `tabLMS Video Watch Duration`',as_dict=True);keys={}
 for row in indexes:
  if not row.Non_unique:keys.setdefault(row.Key_name,[]).append((row.Seq_in_index,row.Column_name))
 value={'native_identity_field':bool(field and field.fieldtype=='Data' and field.unique and field.length==64 and field.read_only),'custom_field_count':frappe.db.count('Custom Field',{'dt':'LMS Video Watch Duration','fieldname':'source_identity'}),'single_column_unique_index':any([column for _,column in sorted(rows)]==['source_identity'] for rows in keys.values()),'position_rows':frappe.db.count('LMS Video Watch Duration')}
 print(json.dumps(value));assert value['native_identity_field'] and not value['custom_field_count'] and value['single_column_unique_index'] and value['position_rows']==0
finally:frappe.db.rollback();frappe.destroy()
"""
run(
	["docker", "exec", "-i", "-w", bench + "/sites", owner + "-app", bench + "/env/bin/python", "-"],
	"video-metadata-second",
	metadata.encode(),
)
actual = subprocess.check_output(
	["docker", "exec", owner + "-db", "sh", "-c", 'printf %s "$MARIADB_ROOT_PASSWORD"']
)
assert (
	actual == json.loads((work / "credentials/secrets.json").read_text())["db_root"].encode()
	and b"$" in actual
)
receipt = {
	"kind": "existing",
	"image_id": image_id,
	"source_sha256": result["source_sha256"],
	"original_site_mutated": False,
	"image_application_source_overlays": False,
	"internal_network": True,
	"ports_published": False,
	"secret_dollar_check": True,
	"bootstrap_applications": 2,
	"protected_original_business_columns_equal": True,
	"second_protected_business_state_equal": True,
	"raw_first_guard_failure_preserved": True,
	"first_pass_native_application_succeeded_before_guard_review": True,
	"not_a_resumed_clean_installation": True,
	"validation_harness_sha256": {
		name: hashlib.sha256((root / "local/quality/integration08" / name).read_bytes()).hexdigest()
		for name in (
			"resume_control_review.py",
			"protected_projection.py",
			"control_snapshot.py",
			"validate_controls.py",
		)
	},
	"native_controls_first": first_proof,
	"native_controls_second": second_proof,
	"commands": commands,
}
(work / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({key: value for key, value in receipt.items() if key != "commands"}))
