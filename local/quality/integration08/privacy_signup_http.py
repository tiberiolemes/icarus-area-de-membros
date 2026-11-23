"""Synthetic approval on the segregated testsite only; always restore its draft configuration."""

import hashlib
import json
import secrets
import os
from pathlib import Path

import frappe
import requests

SITE = "test_quality08.localhost"
frappe.init(site=SITE)
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.allow_tests and frappe.conf.mute_emails and frappe.conf.pause_scheduler
from lms.lms.privacy import REQUIRED, policy_state

fields = [*REQUIRED, "publication_approved", "approved_revision"]
settings = frappe.get_single("LMS Privacy Settings")
before = {f: settings.get(f) for f in fields}
terms = frappe.db.get_single_value("LMS Settings", "custom_signup_content")
disabled = frappe.db.get_single_value("Website Settings", "disable_signup")
controlled = [
	("LMS Privacy Settings", None),
	("LMS Settings", "custom_signup_content"),
	("Website Settings", "disable_signup"),
]
controlled_before = {
	(dt, field): frappe.db.sql(
		"select doctype,field,value from tabSingles where doctype=%s" + (" and field=%s" if field else ""),
		(dt, field) if field else (dt,),
	)
	for dt, field in controlled
}
suffix = secrets.token_hex(6)
emails = ["qc08-policy-" + str(i) + "-" + suffix + "@example.test" for i in range(5)]
port = os.environ.get("QC08_SIGNUP_TEST_PORT", "8000")
assert port in ("8000", "8001")
base = "http://127.0.0.1:" + port
session = requests.Session()
session.headers["X-Frappe-Site-Name"] = SITE
cases = []
receipt = {
	"site": SITE,
	"source_overlays": port == "8001",
	"synthetic_policies_only": True,
	"cases": cases,
	"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
}
path = Path(SITE) / "private" / ("qc08-privacy-signup-" + suffix + ".json")


def post(label, email, terms_value, revision, success=False):
	response = session.post(
		base + "/api/method/lms.lms.user.sign_up",
		json={
			"email": email,
			"full_name": "QC08 Synthetic",
			"verify_terms": terms_value,
			"user_category": "Student",
			"policy_revision": revision,
		},
		timeout=30,
	)
	frappe.db.rollback()
	exists = bool(frappe.db.exists("User", email))
	error = response.json() if response.status_code != 200 else {}
	if error:
		cases.append(
			{
				"case": label + " diagnostic",
				"status": response.status_code,
				"exception_type": error.get("exc_type"),
				"message": json.loads(json.loads(error.get("_server_messages", "[]"))[0]).get("message")
				if error.get("_server_messages")
				else None,
			}
		)
	expected = {
		"draft blocks public registration": "Public registration is awaiting",
		"false consent rejected": "Please accept the terms",
		"stale policy revision rejected": "The terms changed",
	}
	if not success:
		assert expected[label] in str(error.get("_server_messages", "")), "Wrong rejection cause for " + label
	assert (
		(response.status_code == 200 and exists)
		if success
		else (response.status_code in (403, 417) and not exists)
	), label + ": " + str(response.status_code)
	cases.append(
		{
			"case": label,
			"status": response.status_code,
			"user_created": exists,
			"no_automatic_login": session.cookies.get("sid") in (None, "Guest"),
		}
	)
	return response


try:
	assert not policy_state()["ready"]
	frappe.db.set_single_value("Website Settings", "disable_signup", 0)
	frappe.clear_cache()
	frappe.db.commit()
	post("draft blocks public registration", emails[0], 1, "")
	frappe.db.set_single_value(
		"LMS Settings", "custom_signup_content", "<p>QC08 SYNTHETIC TERMS — NOT A REAL POLICY</p>"
	)
	settings = frappe.get_single("LMS Privacy Settings")
	for f in REQUIRED:
		settings.set(f, "QC08 SYNTHETIC " + f + " — NOT APPROVED FOR ANY REAL SITE")
	settings.publication_approved = 1
	settings.save()
	frappe.db.commit()
	frappe.clear_cache()
	frappe.clear_document_cache("Website Settings", "Website Settings")
	state = policy_state()
	assert state["ready"] and state["revision"]
	post("false consent rejected", emails[1], "false", state["revision"])
	post("stale policy revision rejected", emails[2], 1, "stale-synthetic")
	reply = post("current consent permits synthetic signup", emails[3], 1, state["revision"], True).json()[
		"message"
	]
	data = frappe.get_doc("User", emails[3])
	assert data.verify_terms == 1 and [r.role for r in data.roles] == ["LMS Student"] and not data.last_login
	existing = session.post(
		base + "/api/method/lms.lms.user.sign_up",
		json={
			"email": emails[3],
			"full_name": "QC08 Synthetic",
			"verify_terms": 1,
			"user_category": "Student",
			"policy_revision": state["revision"],
		},
		timeout=30,
	)
	assert existing.status_code == 200 and existing.json()["message"] == reply
	cases.append({"case": "existing account gets same non-enumerating reply", "status": 200})
	response = session.post(
		base + "/api/resource/User",
		json={
			"email": emails[4],
			"first_name": "QC08 Bypass",
			"verify_terms": 1,
			"roles": [{"role": "System Manager"}],
		},
		timeout=30,
	)
	frappe.db.rollback()
	assert response.status_code in (403, 417) and not frappe.db.exists("User", emails[4])
	cases.append(
		{
			"case": "generic Guest REST cannot reuse approval context or grant roles",
			"status": response.status_code,
		}
	)
	receipt["exit_code"] = 0
finally:
	frappe.db.rollback()
	frappe.set_user("Administrator")
	for email in emails:
		assert email.startswith("qc08-policy-") and email.endswith("@example.test")
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)
	frappe.db.set_single_value("LMS Settings", "custom_signup_content", terms)
	frappe.db.set_single_value("Website Settings", "disable_signup", disabled)
	settings = frappe.get_single("LMS Privacy Settings")
	for f in fields:
		settings.set(f, before[f])
	settings.save()
	frappe.db.commit()
	frappe.clear_cache()
	for (dt, field), rows in controlled_before.items():
		frappe.db.delete("Singles", {"doctype": dt, **({"field": field} if field else {})})
		if rows:
			frappe.db.bulk_insert("Singles", ["doctype", "field", "value"], rows)
	frappe.db.commit()
	frappe.clear_cache()
	frappe.clear_document_cache("Website Settings", "Website Settings")
	receipt["draft_settings_restored"] = all(
		frappe.db.sql(
			"select doctype,field,value from tabSingles where doctype=%s"
			+ (" and field=%s" if field else ""),
			(dt, field) if field else (dt,),
		)
		== rows
		for (dt, field), rows in controlled_before.items()
	)
	receipt["ready_after"] = policy_state()["ready"]
	receipt["owned_users_remaining"] = sum(bool(frappe.db.exists("User", e)) for e in emails)
	receipt.setdefault("exit_code", 1)
	path.write_text(json.dumps(receipt, indent=2) + "\n")
	path.chmod(0o600)
	print("Native privacy signup receipt: " + path.name)
	assert (
		receipt["draft_settings_restored"]
		and not receipt["ready_after"]
		and receipt["owned_users_remaining"] == 0
	)
	frappe.destroy()
