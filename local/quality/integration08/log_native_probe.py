"""Prove native rotating logs and Error Log redact before persistence on the test site."""

import hashlib
import json
import secrets
import subprocess
import sys
from pathlib import Path

import frappe
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

site = "test_quality08.localhost"
frappe.init(site=site)
frappe.connect()
assert frappe.conf.allow_tests and frappe.conf.mute_emails
frappe.set_user("Administrator")
marker = "qc08_noncredential_" + secrets.token_hex(8)
hash_marker = "qc08_hash_noncredential_" + secrets.token_hex(8)
hashes = [prefix + hash_marker for prefix in ("$argon2id$", "$pbkdf2-sha256$", "$2b$")]
module = "qc08-log-boundary-" + secrets.token_hex(6)
name = None
try:
	frappe.local.request = Request(
		EnvironBuilder(
			path="/api/method/ping",
			query_string={"key": marker, "token": marker, "_signature": marker},
			headers={
				"Referer": "http://quality08.localhost/login?key=" + marker + "&token=" + marker,
				"Authorization": "Bearer " + marker,
				"Cookie": "sid=" + marker,
			},
		).get_environ()
	)
	frappe.local.form_dict = frappe._dict(
		key=marker,
		data=json.dumps({"new_password": marker, "nested": [{"token": marker, "safe_count": 7}]}),
		options={"headers": {"Authorization": "Bearer " + marker}},
		native_hash_context=hashes,
		_signature=marker,
		signature=marker,
		_SIGNAture=marker,
		signed_payload=json.dumps(
			{"_signature": marker, "nested": [{"SIGNATURE": marker}], "safe_count": 11}
		),
		proof_list=[{"_signature": marker, "safe_count": 11}],
		context="verified_command _signature=" + marker + " safe_count=11",
		safe_count=9,
	)
	logger = frappe.logger(module, with_more_info=True, allow_site=True)
	logger.error("native_safe_probe method=GET status=500 url=http://host/reset?key=" + marker)
	logger.error("native_safe_hash_probe method=GET status=500 " + " ".join(hashes))
	logger.error("native_safe_signature_probe method=GET status=500 _signature=" + marker + " safe_count=11")
	child = (
		"import sys;print("
		+ repr(
			"native_safe_hash_probe stdout " + " ".join(hashes) + " _signature=" + marker + " safe_count=11"
		)
		+ ");print("
		+ repr(
			"native_safe_hash_probe stderr " + " ".join(hashes) + " SIGNATURE=" + marker + " safe_count=11"
		)
		+ ",file=sys.stderr)"
	)
	supervisor = (
		"import sys;sys.path.insert(0,'/home/frappe/frappe-bench/apps/lms/local/quality/integration08');from safe_process import run;raise SystemExit(run("
		+ repr([sys.executable, "-c", child])
		+ "))"
	)
	streams = subprocess.run([sys.executable, "-c", supervisor], capture_output=True, check=True)
	assert hash_marker.encode() not in streams.stdout + streams.stderr
	assert marker.encode() not in streams.stdout + streams.stderr
	# The supervisor merges native stdout/stderr into one sanitized destination.
	assert streams.stdout.count(b"safe_count=11") == 2
	assert (
		b"native_safe_hash_probe stdout" in streams.stdout
		and b"native_safe_hash_probe stderr" in streams.stdout
	)
	error = frappe.log_error(
		title="native_safe_probe url=http://host/reset?key=" + marker,
		message='ValueError: synthetic upstream failure\nrequest: "GET /api?key='
		+ marker
		+ ' HTTP/1.1"\nAuthorization: Bearer '
		+ marker
		+ "\nnative hash context "
		+ " ".join(hashes),
	)
	name = error.name
	frappe.db.commit()
	frappe.db.rollback()
	stored = frappe.get_doc("Error Log", name)
	assert marker not in json.dumps(stored.as_dict(), default=str)
	assert hash_marker not in json.dumps(stored.as_dict(), default=str)
	metadata = json.loads(stored.metadata)
	assert metadata["method"] == "GET" and metadata["path"] == "/api/method/ping"
	assert metadata["referrer"] == "http://quality08.localhost/login"
	assert metadata["form_dict"]["safe_count"] == 9
	assert json.loads(metadata["form_dict"]["data"])["nested"][0]["safe_count"] == 7
	assert json.loads(metadata["form_dict"]["signed_payload"])["safe_count"] == 11
	assert metadata["form_dict"]["proof_list"][0]["safe_count"] == 11
	assert "safe_count=11" in metadata["form_dict"]["context"]
	assert "ValueError: synthetic upstream failure" in stored.error
	logs = []
	for path in (Path("../logs") / (module + ".log"), Path(site) / "logs" / (module + ".log")):
		data = path.read_bytes()
		assert marker.encode() not in data
		assert hash_marker.encode() not in data
		assert b"ERROR" in data and b"native_safe_probe method=GET status=500" in data
		assert b"native_safe_signature_probe" in data and b"safe_count=11" in data
		logs.append(
			{
				"path": str(path),
				"sha256": hashlib.sha256(data).hexdigest(),
				"bytes": len(data),
				"marker_absent": True,
			}
		)
	print(
		json.dumps(
			{
				"native_error_log_persisted_sanitized": True,
				"native_rotating_logs": logs,
				"raw_request_markers_are_credentials": False,
				"native_hash_markers_are_credentials": False,
				"stdout_stderr_native_hash_boundary": True,
				"native_signature_structure_text_json_stream_file_errorlog": True,
				"exit_code": 0,
			}
		)
	)
finally:
	frappe.db.rollback()
	if name:
		frappe.db.delete("Error Log", {"name": name})
		frappe.db.commit()
	frappe.destroy()
