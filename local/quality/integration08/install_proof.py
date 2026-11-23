"""Fresh/existing immutable-image installation in owned, internal Docker projects."""

import argparse
import gzip
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import ipaddress
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "local/quality/ops"))
import operations as ops
from validate_controls import validate as validate_controls

os.umask(0o077)
parser = argparse.ArgumentParser()
parser.add_argument("kind", choices=("fresh", "existing"))
parser.add_argument("--revision", choices=("r2", "r3", "r4", "r6", "r7", "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15", "r16", "r17", "r20", "r21"), default="r10")
parser.add_argument("--subnet", help="Explicitly verified private QA subnet when Docker default pools are exhausted")
parser.add_argument("--attempt", default="first")
parser.add_argument("--backup", type=Path, help="Verified current original capture for the existing-copy proof")
args = parser.parse_args()
assert args.attempt.isalnum()
attempt_suffix = "" if args.attempt == "first" else "-" + args.attempt
network_options = []
if args.subnet:
	requested = ipaddress.ip_network(args.subnet, strict=True)
	assert requested.version == 4 and requested.is_private and requested.prefixlen == 24
	ids = subprocess.check_output(["docker", "network", "ls", "-q"], text=True).split()
	allocated = json.loads(subprocess.check_output(["docker", "network", "inspect", *ids]))
	assert all(
		not requested.overlaps(ipaddress.ip_network(config["Subnet"]))
		for row in allocated
		for config in (row.get("IPAM", {}).get("Config") or [])
		if config.get("Subnet") and ":" not in config["Subnet"]
	)
	network_options = ["--subnet", str(requested)]
kind = args.kind
prefix = "tiberio-quality08-" + args.revision + "-" + kind + attempt_suffix
work = ROOT / ".local/quality" / ("08-" + args.revision + "-" + kind + attempt_suffix)
assert not work.exists(), "Never overwrite an installation receipt or resources"
result = json.loads((ROOT / (".local/quality/08-build-" + args.revision + "-result.json")).read_text())
assert result["exit_code"] == 0
image = result["image"]
image_id = json.loads(subprocess.check_output(["docker", "image", "inspect", image]))[0]["Id"]
BENCH = "/home/frappe/frappe-bench"
site = "tiberio.localhost"
work.mkdir(mode=0o700)
commands = []


def run(args, label, data=None):
	with (work / (label + ".log")).open("wb") as output:
		process = subprocess.run(args, input=data, stdout=output, stderr=subprocess.STDOUT)
	commands.append({"command": args, "exit_code": process.returncode, "log": label + ".log"})
	if process.returncode:
		raise RuntimeError(label + " failed; private log retained")


def execute(args, label):
	run(["docker", "exec", "-w", BENCH, prefix + "-app", *args], label)


def config_snapshot(label):
	# Private QA receipt only: configuration values never enter the public receipt.
	code = """import hashlib,json
from pathlib import Path
p=Path('sites/tiberio.localhost/site_config.json')
print(json.dumps({'config':json.loads(p.read_bytes()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'mtime_ns':p.stat().st_mtime_ns} if p.exists() else None))
"""
	execute([BENCH + "/env/bin/python", "-c", code], label)
	return json.loads((work / (label + ".log")).read_text())


def projection(label, plan=None):
	# Validation harness only; application source comes exclusively from image_id.
	code = (ROOT / "local/quality/integration08/protected_projection.py").read_text()
	wrapped = "import io,sys\nsys.stdin=io.StringIO(" + repr(json.dumps(plan or {})) + ")\n" + code
	run(
		["docker", "exec", "-i", "-w", BENCH + "/sites", prefix + "-app", BENCH + "/env/bin/python", "-"],
		label,
		wrapped.encode(),
	)
	return json.loads((work / (label + ".log")).read_text())


def controls(label, prior=None):
	code = (
		"import io,sys\nsys.stdin=io.StringIO(" + repr(json.dumps({kind: [row["name"] for row in prior["controls"][kind]] for kind in ("Has Role", "DocPerm")} if prior else {})) + ")\n"
		+ (ROOT / "local/quality/integration08/control_snapshot.py").read_text()
	)
	run(
		["docker", "exec", "-i", "-w", BENCH + "/sites", prefix + "-app", BENCH + "/env/bin/python", "-"],
		label,
		code.encode(),
	)
	return json.loads((work / (label + ".log")).read_text())


def video_metadata(label):
	code = """import frappe,json
frappe.init(site='tiberio.localhost');frappe.connect()
try:
 meta=frappe.get_meta('LMS Video Watch Duration');field=meta.get_field('source_identity')
 indexes=frappe.db.sql('SHOW INDEX FROM `tabLMS Video Watch Duration`',as_dict=True)
 keys={}
 for row in indexes:
  if not row.Non_unique: keys.setdefault(row.Key_name,[]).append((row.Seq_in_index,row.Column_name))
 unique=any([column for _,column in sorted(rows)]==['source_identity'] for rows in keys.values())
 result={'native_identity_field':bool(field and field.fieldtype=='Data' and field.unique and field.length==64 and field.read_only),'custom_field_count':frappe.db.count('Custom Field',{'dt':'LMS Video Watch Duration','fieldname':'source_identity'}),'single_column_unique_index':unique,'position_rows':frappe.db.count('LMS Video Watch Duration')}
 print(json.dumps(result));assert result['native_identity_field'] and result['custom_field_count']==0 and unique and result['position_rows']==0
finally:frappe.db.rollback();frappe.destroy()
"""
	run(["docker", "exec", "-i", "-w", BENCH + "/sites", prefix + "-app", BENCH + "/env/bin/python", "-"], label, code.encode())


try:
	seed = work / "seed"
	seed.mkdir()
	private = work / "credentials"
	private.mkdir()
	credentials = {key: "Aa9!" + secrets.token_urlsafe(24) for key in ("admin", "student", "other")}
	credentials["db_root"] = "$qc08-final$" + secrets.token_urlsafe(30)
	(private / "secrets.json").write_text(json.dumps(credentials))
	(private / "db.env").write_text("MARIADB_ROOT_PASSWORD=" + credentials["db_root"] + "\n")
	(seed / "apps.txt").write_text("frappe\npayments\nlms\n")
	(seed / "assets").symlink_to(BENCH + "/assets")
	common = {
		"db_host": "db",
		"db_port": 3306,
		"redis_cache": "redis://redis:6379",
		"redis_queue": "redis://redis:6379",
		"redis_socketio": "redis://redis:6379",
		"pause_scheduler": True,
		"mute_emails": True,
		"enable_telemetry": False,
	}
	backup = args.backup.resolve() if args.backup else ROOT / ".local/quality/ops/backups/20261121T195710134198Z"
	if kind == "existing":
		record = ops.verify_backup(backup)
		# Safe extractor rejects paths/links and only our private destination is writable.
		ops.safe_extract(backup / "site.tar.gz", seed)
		config_path = seed / site / "site_config.json"
		config = json.loads(config_path.read_text())
		config.update(
			db_user="root",
			db_password=credentials["db_root"],
			db_host="db",
			pause_scheduler=True,
			mute_emails=True,
			enable_telemetry=False,
		)
		config_path.write_text(json.dumps(config))
		db_name = config["db_name"]
		(seed / site / "logs").mkdir(mode=0o700, exist_ok=True)
		previous_common = json.loads((seed / "common_site_config.json").read_text())
		previous_common.update(common)
		common = previous_common
	(seed / "common_site_config.json").write_text(json.dumps(common))
	fixture_data = work / "seed-data"
	fixture_data.mkdir()
	shutil.copy2(ROOT / "local/translations.json", fixture_data / "translations.json")
	shutil.copytree(ROOT / "local/assets", fixture_data / "assets")
	seed_hashes = {
		str(path.relative_to(fixture_data)): hashlib.sha256(path.read_bytes()).hexdigest()
		for path in fixture_data.rglob("*")
		if path.is_file()
	}
	run(
		["docker", "network", "create", "--internal", *network_options, "--label", "tiberio.quality.owner=" + prefix, prefix],
		"network",
	)
	run(
		["docker", "volume", "create", "--label", "tiberio.quality.owner=" + prefix, prefix + "-sites"],
		"sites-volume",
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
			str(seed) + ":/seed:ro",
			"-v",
			prefix + "-sites:/target",
			image_id,
			"-c",
			"cp -a /seed/. /target/ && chown -R 1000:1000 /target",
		],
		"seed-volume",
	)
	for name, tag, extra, command in (
		(
			"db",
			"sha256:345fa26d595e8c7fe298e0c4098ed400356f502458769c8902229b3437d6da2b",
			["--env-file", str(private / "db.env"), "--tmpfs", "/var/lib/mysql:rw,size=1g"],
			[],
		),
		(
			"redis",
			"sha256:b2b95679e3b46fb51864949ed25ea976fc3a6bcc00a40a1bc00d568cb2822e50",
			["--tmpfs", "/data:rw,size=64m"],
			[],
		),
		(
			"app",
			image_id,
			[
				"--platform",
				"linux/amd64",
				"--init",
				"--entrypoint",
				"sleep",
				"--tmpfs",
				BENCH + "/logs:rw,uid=1000,gid=1000,size=64m",
				"-v",
				prefix + "-sites:" + BENCH + "/sites",
				"-v",
				str(private) + ":/run/tiberio:ro",
				"-v",
				str(fixture_data) + ":/opt/local:ro",
			],
			["infinity"],
		),
	):
		run(
			[
				"docker",
				"run",
				"-d",
				"--pull=never",
				"--name",
				prefix + "-" + name,
				"--network",
				prefix,
				"--network-alias",
				"backend" if name == "app" else name,
				"--label",
				"tiberio.quality.owner=" + prefix,
				*extra,
				tag,
				*command,
			],
			"start-" + name,
		)
	deadline = time.monotonic() + 60
	while subprocess.run(
		["docker", "exec", prefix + "-db", "sh", "-c", 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec healthcheck.sh --no-defaults --connect --innodb_initialized'],
		capture_output=True,
	).returncode:
		if time.monotonic() >= deadline:
			raise RuntimeError("Isolated database readiness timeout")
		time.sleep(0.5)
	inside = subprocess.check_output(
		["docker", "exec", prefix + "-db", "sh", "-c", 'printf %s "$MARIADB_ROOT_PASSWORD"']
	)
	assert inside == credentials["db_root"].encode()
	if kind == "existing":
		assert db_name.replace("_", "").isalnum()
		run(
			[
				"docker",
				"exec",
				"-i",
				prefix + "-db",
				"sh",
				"-c",
				'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot',
			],
			"create-db",
			f"CREATE DATABASE `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;".encode(),
		)
		with gzip.open(backup / "database.sql.gz", "rb") as stream:
			run(
				[
					"docker",
					"exec",
					"-i",
					prefix + "-db",
					"sh",
					"-c",
					'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb -uroot "$1"',
					"qc08",
					db_name,
				],
				"import-db",
				stream.read(),
			)
		before = projection("protected-before")
		before_controls = controls("controls-before")
	config_before = config_snapshot("config-before-private")
	execute(["python", BENCH + "/apps/lms/local/bootstrap.py"], "bootstrap-first")
	config_first = config_snapshot("config-first-private")
	if int(args.revision[1:]) >= 17:
		assert config_first["config"].get("lang") == "pt-BR", "Bootstrap did not persist native worker language"
		if config_before is not None:
			assert json.dumps({key: value for key, value in config_before["config"].items() if key != "lang"}, sort_keys=True) == json.dumps({
				key: value for key, value in config_first["config"].items() if key != "lang"
			}, sort_keys=True), "Bootstrap changed protected site configuration beyond lang"
	video_metadata("video-metadata-first")
	after = projection("protected-first", before["original_columns"] if kind == "existing" else None)
	first_controls = controls("controls-first", before_controls if kind == "existing" else None)
	if kind == "existing":
		assert {name for name in before["tables"] if before["tables"][name] != after["tables"][name]} <= {
			"tabHas Role"
		}, "Unexpected protected business-column delta"
		control_proof = validate_controls(before_controls, first_controls, ROOT)
		(work / "control-proof-first.json").write_text(json.dumps(control_proof, indent=2) + "\n")
	execute(["python", BENCH + "/apps/lms/local/bootstrap.py"], "bootstrap-second")
	config_second = config_snapshot("config-second-private")
	if int(args.revision[1:]) >= 17:
		assert json.dumps(config_first["config"], sort_keys=True) == json.dumps(config_second["config"], sort_keys=True), "Second bootstrap changed configuration values"
	video_metadata("video-metadata-second")
	second = projection("protected-second", after["original_columns"])
	if kind == "existing":
		assert {name for name in after["tables"] if after["tables"][name] != second["tables"][name]} <= {
			"tabHas Role"
		}
		(work / "control-proof-second.json").write_text(
			json.dumps(validate_controls(first_controls, controls("controls-second", first_controls), ROOT, migrating=False), indent=2) + "\n"
		)
	else:
		assert {name for name in after["tables"] if after["tables"][name] != second["tables"][name]} <= {
			"tabHas Role"
		}
		(work / "control-proof-second.json").write_text(
			json.dumps(
				validate_controls(first_controls, controls("controls-second", first_controls), ROOT, migrating=False),
				indent=2,
			)
			+ "\n"
		)
	execute(
		[
			"bench",
			"--site",
			site,
			"execute",
			"lms.tiberio_i18n.apply_and_commit",
			"--kwargs",
			json.dumps({"catalog_path": BENCH + "/apps/lms/local/i18n/merged-pt-BR.json"}),
		],
		"i18n-third-noop",
	)
	config_third = config_snapshot("config-third-private")
	if int(args.revision[1:]) >= 17:
		assert config_third == config_second, "Repeated language application wrote site configuration"
		assert json.loads((work / "i18n-third-noop.log").read_text())["site_config_changed"] == 0
	metadata = "import frappe,json;frappe.init(site='tiberio.localhost',sites_path='/home/frappe/frappe-bench/sites');frappe.connect();print(json.dumps({'moderation_column':frappe.db.has_column('Discussion Topic','lms_moderation_state'),'community_count':frappe.db.count('LMS Community'),'child_column':frappe.db.has_column('Course Lesson','is_archived'),'account_security':frappe.db.table_exists('LMS Account Security'),'privacy_single_metadata':bool(frappe.db.exists('DocType','LMS Privacy Settings') and frappe.get_meta('LMS Privacy Settings').issingle),'private_account_security_docperms':frappe.db.count('DocPerm',{'parent':'LMS Account Security'})}));frappe.db.rollback();frappe.destroy()"
	run(["docker", "exec", "-w", BENCH + "/sites", prefix + "-app", BENCH + "/env/bin/python", "-c", metadata], "native-metadata")
	receipt = {
		"kind": kind,
		"backup_reference": str(backup.relative_to(ROOT)) if kind == "existing" else None,
		"image_id": image_id,
		"source_sha256": result["source_sha256"],
		"original_site_mutated": False,
		"image_application_source_overlays": False,
		"internal_network": True,
		"ports_published": False,
		"secret_dollar_check": True,
		"bootstrap_applications": 2,
		"native_worker_language_persisted": int(args.revision[1:]) >= 17 and config_first["config"].get("lang") == "pt-BR",
		"config_guard": {
			"protected_values_preserved_except_lang": int(args.revision[1:]) >= 17 and kind == "existing",
			"fresh_has_no_prior_site_config": kind == "fresh" and config_before is None,
			"second_bootstrap_values_equal": json.dumps(config_first["config"], sort_keys=True) == json.dumps(config_second["config"], sort_keys=True),
			"third_apply_bytes_and_mtime_equal": config_second == config_third,
			"bootstrap_itself_may_rewrite_config_format_or_mtime": True,
			"values_omitted_from_public_receipt": True,
		},
		"protected_original_business_columns_equal": kind == "existing",
		"has_role_native_metadata_equivalence_only": True,
		"second_protected_business_state_equal": True,
		"second_control_delta": "none except exact Workspace Flow child ID/timestamps from native sync",
		"validation_harness_sha256": {name: hashlib.sha256((ROOT / "local/quality/integration08" / name).read_bytes()).hexdigest() for name in ("install_proof.py", "protected_projection.py", "control_snapshot.py", "validate_controls.py")},
		"seed_input_sha256": seed_hashes,
		"resources_retained_for_next_tests": prefix,
		"commands": commands,
	}
	(work / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
	print(
		json.dumps(
			{key: value for key, value in receipt.items() if key not in {"commands", "seed_input_sha256"}}
		)
	)
except BaseException:
	(work / "failure-receipt.json").write_text(
		json.dumps(
			{"commands": commands, "owned_resource_prefix": prefix, "original_site_mutated": False}, indent=2
		)
		+ "\n"
	)
	raise
