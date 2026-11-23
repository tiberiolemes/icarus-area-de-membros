"""Create a new synthetic native test site inside the verified immutable lab."""

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

os.umask(0o077)
parser = argparse.ArgumentParser()
parser.add_argument("revision")
parser.add_argument("--finish-prerequisites", action="store_true")
options = parser.parse_args()
revision = options.revision
assert revision.startswith("r") and revision[1:].isdigit()
root = Path(__file__).resolve().parents[3]
work = root / ".local/quality" / ("08-" + revision + "-native")
if options.finish_prerequisites:
	assert work.is_dir() and not (work / "receipt.json").exists()
else:
	work.mkdir(exist_ok=False)
owner = "tiberio-quality08-" + revision + "-existing"
bench = "/home/frappe/frappe-bench"
site = "test_quality08.localhost"
prior = root / ".local/quality" / ("08-" + revision + "-existing")
receipt = json.loads((prior / "receipt.json").read_text())
secrets = json.loads((prior / "credentials/secrets.json").read_text())
info = json.loads(subprocess.check_output(["docker", "inspect", owner + "-app"]))[0]
assert info["Image"] == receipt["image_id"] and info["Config"]["Labels"]["tiberio.quality.owner"] == owner
assert all(m["Destination"] in (bench + "/sites", "/run/tiberio", "/opt/local") for m in info["Mounts"])
assert info["HostConfig"]["PortBindings"] == {} and info["State"]["Running"]
commands = json.loads((work / "stage.json").read_text()) if options.finish_prerequisites else []
if options.finish_prerequisites:
	assert commands[-1] == {"label": "native-fixture-prerequisites", "exit_code": 1}
	assert all(row["exit_code"] == 0 for row in commands[:-1])


def run(args, label, data=None):
	assert not (work / (label + ".log")).exists()
	with (work / (label + ".log")).open("wb") as output:
		result = subprocess.run(
			[
				"docker",
				"exec",
				"-i",
				"-w",
				bench + "/sites" if args[0] == bench + "/env/bin/python" else bench,
				owner + "-app",
				*args,
			],
			input=data,
			stdout=output,
			stderr=subprocess.STDOUT,
		)
	commands.append({"label": label, "exit_code": result.returncode})
	(work / ("stage-prerequisites.json" if options.finish_prerequisites else "stage.json")).write_text(
		json.dumps(commands) + "\n"
	)
	assert result.returncode == 0, label + " failed; raw log retained"


if not options.finish_prerequisites:
	run(
		[
			"bench",
			"new-site",
			site,
			"--db-root-username",
			"root",
			"--db-root-password",
			secrets["db_root"],
			"--admin-password",
			secrets["admin"],
			"--mariadb-user-host-login-scope",
			"%",
		],
		"new-site",
	)
	for key in ("allow_tests", "mute_emails", "pause_scheduler"):
		run(["bench", "--site", site, "set-config", "-p", key, "True"], "set-" + key)
	run(["bench", "--site", site, "set-config", "-p", "enable_telemetry", "False"], "disable-telemetry")
	for app in ("payments", "lms"):
		run(["bench", "--site", site, "install-app", app], "install-" + app)
	for label in ("migrate-first", "migrate-second"):
		run(["bench", "--site", site, "migrate"], label)
code = """import frappe,json
frappe.init(site='test_quality08.localhost',sites_path='/home/frappe/frappe-bench/sites');frappe.connect();frappe.set_user('Administrator')
assert frappe.conf.allow_tests and frappe.conf.mute_emails
try:
 settings=frappe.get_single('System Settings');settings.language='en';settings.time_zone='America/Sao_Paulo';settings.save()
 if not frappe.db.exists('Role','Blogger'):frappe.get_doc({'doctype':'Role','role_name':'Blogger','desk_access':1}).insert()
 assert frappe.db.count('DocPerm',{'role':'Blogger'})==0
 frappe.db.commit();print(json.dumps({'testsite_locale_configured':True,'native_fixture_role':'Blogger','new_docperm_grants':0,'original_touched':False}))
finally:frappe.db.rollback();frappe.destroy()
"""
run(
	[bench + "/env/bin/python", "-"],
	"native-fixture-prerequisites-second" if options.finish_prerequisites else "native-fixture-prerequisites",
	code.encode(),
)
proof = {
	"site": site,
	"image_id": info["Image"],
	"application_source_overlays": False,
	"published_ports": False,
	"synthetic_credentials": True,
	"commands": commands,
	"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
}
(work / "receipt.json").write_text(json.dumps(proof, indent=2) + "\n")
print(json.dumps(proof))
