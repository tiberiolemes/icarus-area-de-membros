"""Exercise legitimate native User REST writes without changing the legacy LMS normalizer."""

import hashlib
import json
import secrets
from pathlib import Path

import frappe
import requests

SITE = "test_quality08.localhost"
frappe.init(site=SITE)
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.allow_tests and frappe.conf.mute_emails and frappe.conf.pause_scheduler
suffix = secrets.token_hex(6)
actor = "qc08-fw-manager-" + suffix + "@example.test"
emails = ["qc08-fw-user-" + str(i) + "-" + suffix + "@example.test" for i in range(3)]
created = []
results = []
client = requests.Session()
receipt = {
	"image_source_overlay": False,
	"site": SITE,
	"cases": results,
	"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
}
path = Path(SITE) / "private" / ("qc08-framework-username-" + suffix + ".json")
try:
	doc = frappe.get_doc(
		{
			"doctype": "User",
			"email": actor,
			"first_name": "QC08 Framework Manager",
			"user_type": "System User",
			"send_welcome_email": 0,
			"roles": [{"role": "System Manager"}],
		}
	).insert(ignore_permissions=True)
	created.append(actor)
	from frappe.core.doctype.user.user import generate_keys

	secret = generate_keys(actor)["api_secret"]
	key = frappe.db.get_value("User", actor, "api_key")
	frappe.db.commit()
	client.headers.update({"Authorization": "token " + key + ":" + secret, "X-Frappe-Site-Name": SITE})
	base = "http://127.0.0.1:8000/api/resource/User"
	names = []
	snapshots = []
	for i, email in enumerate(emails):
		payload = {
			"email": email.upper() if i == 1 else email,
			"first_name": "QC08 Framework " + suffix,
			"user_type": "Website User",
			"send_welcome_email": 0,
			"roles": [{"role": "LMS Student"}],
		}
		if i < 2:
			payload["username"] = ("qc08_" + suffix).upper() if i else "qc08_" + suffix
		response = client.post(base, json=payload, timeout=30)
		assert response.status_code == 200, "Legitimate User REST creation failed: " + str(
			response.status_code
		)
		data = response.json()["data"]
		created.append(email)
		assert (
			data["name"] == email
			and data["email"] == email
			and data["enabled"] == 1
			and data["user_type"] == "Website User"
		)
		assert [r["role"] for r in data["roles"]] == ["LMS Student"]
		assert data["username"] and not frappe.db.get_value("User", email, "last_login")
		names.append(data["username"])
		frappe.db.rollback()
		persisted = frappe.get_doc("User", email).as_dict()
		snapshots.append(
			json.loads(
				json.dumps(
					{k: persisted[k] for k in ("name", "email", "username", "enabled", "user_type", "roles")},
					default=str,
				)
			)
		)
		assert len({n.casefold() for n in names}) == len(names)
		results.append(
			{
				"case": "same first name / explicit username case collision"
				if i
				else "first valid REST User",
				"status": response.status_code,
				"normalized_email": True,
				"unique_username_casefold": True,
				"roles_exact": True,
				"no_automatic_login": True,
			}
		)
	response = client.put(base + "/" + emails[1], json={"first_name": "QC08 Edited " + suffix}, timeout=30)
	assert response.status_code == 200
	data = response.json()["data"]
	assert data["username"] == names[1] and data["name"] == emails[1]
	frappe.db.rollback()
	first = frappe.get_doc("User", emails[0])
	assert json.loads(json.dumps({k: first.as_dict()[k] for k in snapshots[0]}, default=str)) == snapshots[0]
	results.append(
		{"case": "valid edit retains unique identity and leaves first account unchanged", "status": 200}
	)
	receipt["exit_code"] = 0
finally:
	frappe.db.rollback()
	frappe.set_user("Administrator")
	for email in reversed(created):
		assert email in [actor, *emails] and email.startswith("qc08-fw-")
		frappe.delete_doc("User", email, force=True, ignore_permissions=True)
	frappe.db.commit()
	receipt["owned_users_deleted"] = len(created)
	receipt["owned_users_remaining"] = sum(bool(frappe.db.exists("User", e)) for e in [actor, *emails])
	receipt.setdefault("exit_code", 1)
	path.write_text(json.dumps(receipt, indent=2) + "\n")
	path.chmod(0o600)
	print("Native username HTTP receipt: " + path.name)
	frappe.destroy()
