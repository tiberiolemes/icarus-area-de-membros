"""Owned native HTTP forms; no provider, payment, reset or external recipient."""

import hashlib
import json
import os
from pathlib import Path
import secrets

import frappe
import requests

from frappe.core.doctype.user.user import generate_keys
from lms.lms.test_helpers import BaseTestUtils

os.umask(0o077)
site = "test_quality08.localhost"
frappe.init(site=site)
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.allow_tests and frappe.conf.mute_emails and frappe.conf.pause_scheduler
suffix = secrets.token_hex(6)
folder = Path(site) / "private" / ("qc08-webform-http-" + suffix)
folder.mkdir(mode=0o700)
owned = []
cases = []
base = "http://127.0.0.1:8000/api/method/"
paths = ("frappe.website.doctype.web_form.web_form.accept", "payments.overrides.payment_webform.accept")


def remember(doc):
	owned.append([doc.doctype, doc.name])
	(folder / "owned.json").write_text(json.dumps(owned))
	return doc


def form(label, **settings):
	values = dict(
		doctype="Web Form",
		title="QC08 " + label + " " + suffix,
		doc_type="Note",
		route="qc08-" + label + "-" + suffix,
		is_standard=0,
		published=1,
		login_required=0,
		allow_edit=1,
		allow_multiple=0,
		web_form_fields=[
			dict(fieldname="title", fieldtype="Data", label="Title", reqd=1),
			dict(fieldname="content", fieldtype="Text Editor", label="Content"),
		],
	)
	values.update(settings)
	doc = remember(frappe.get_doc(values).insert(ignore_permissions=True))
	frappe.db.commit()
	return doc


def call(client, path, document, data, *, expected=200, **kwargs):
	payload = {"web_form": document.name, "data": json.dumps(data), **kwargs}
	response = client.post(base + path, json=payload, timeout=20)
	frappe.db.rollback()
	assert response.status_code == expected, f"HTTP {response.status_code}, expected {expected}"
	return response.json()


def deny(client, path, document, data, **kwargs):
	before = {doctype: set(frappe.get_all(doctype, pluck="name")) for doctype in ("Note", "Error Log")}
	response = client.post(
		base + path, json={"web_form": document.name, "data": json.dumps(data), **kwargs}, timeout=20
	)
	frappe.db.rollback()
	assert response.status_code in (403, 410, 417), f"Unexpected HTTP {response.status_code}"
	assert response.json().get("exc_type") in {"PermissionError", "ValidationError", "LinkExpired"}
	if response.status_code == 410:
		assert response.json().get("exc_type") == "LinkExpired"
	after_notes = set(frappe.get_all("Note", pluck="name"))
	assert after_notes == before["Note"], "Rejected submission wrote a Note"
	# ErrorLog may record a safe native diagnostic, never a Guest-created foreign document.
	new_errors = set(frappe.get_all("Error Log", pluck="name")) - before["Error Log"]
	assert all(frappe.db.get_value("Error Log", name, "owner") != "Guest" for name in new_errors)
	return response.status_code


try:
	actor = "qc08-webform-" + suffix + "@example.test"
	remember(BaseTestUtils._create_user(actor, "QC08", "WebForm", ["LMS Student"], "Website User"))
	secret = generate_keys(actor)["api_secret"]
	api_key = frappe.db.get_value("User", actor, "api_key")
	frappe.db.commit()
	guest = requests.Session()
	guest.headers.update({"Host": site, "X-Frappe-Site-Name": site})
	member = requests.Session()
	member.headers.update(
		{"Host": site, "X-Frappe-Site-Name": site, "Authorization": "token " + api_key + ":" + secret}
	)
	foreign = remember(
		frappe.get_doc(
			dict(doctype="Note", title="QC08 foreign " + suffix, content="Original synthetic content")
		).insert(ignore_permissions=True)
	)
	frappe.db.commit()
	for index, path in enumerate(paths):
		prefix = str(index)
		public = form(prefix + "-public")
		body = call(
			guest,
			path,
			public,
			{"title": "QC08 public " + suffix, "content": "Declared", "public": 1, "notify_on_login": 1},
		)
		result = body["message"]
		assert result["doctype"] == "Note" and frappe.db.exists("Note", result["name"])
		created = remember(frappe.get_doc("Note", result["name"]))
		assert created.owner == "Guest" and not created.public and not created.notify_on_login
		assert created.content == "Declared"
		cases.append(
			{
				"endpoint": index,
				"case": "legitimate public insert and undeclared fields ignored",
				"passed": True,
			}
		)
		for flag in (False, True):
			denied_form = form(prefix + "-type-" + str(int(flag)))
			deny(guest, path, denied_form, {"doctype": "Error Log", "title": "forged"}, for_payment=flag)
		cases.append(
			{
				"endpoint": index,
				"case": "foreign type denied with both client payment flags and no foreign writer",
				"passed": True,
			}
		)
		private = form(prefix + "-login", login_required=1)
		deny(guest, path, private, {"title": "must not create"})
		valid = call(member, path, private, {"title": "QC08 member " + suffix})["message"]
		member_doc = remember(frappe.get_doc("Note", valid["name"]))
		assert member_doc.owner == actor
		call(member, path, private, {"title": "QC08 changed " + suffix}, docname=member_doc.name)
		assert frappe.db.get_value("Note", member_doc.name, "title") == "QC08 changed " + suffix
		deny(member, path, private, {"title": "forged edit"}, docname=foreign.name)
		assert frappe.db.get_value("Note", foreign.name, "content") == "Original synthetic content"
		cases.append(
			{
				"endpoint": index,
				"case": "login gate, legitimate alias edit and other-owner edit denied",
				"passed": True,
			}
		)
		unpublished = form(prefix + "-unpublished", published=0)
		deny(guest, path, unpublished, {"title": "must not create"})
		no_edit = form(prefix + "-no-edit", allow_edit=0)
		deny(member, path, no_edit, {"title": "must not edit"}, docname=member_doc.name)
		cases.append({"endpoint": index, "case": "publication and server edit gates", "passed": True})
		keyed = form(prefix + "-key", key_required=1)
		request = remember(
			frappe.get_doc(dict(doctype="Web Form Request", web_form=keyed.name)).insert(
				ignore_permissions=True
			)
		)
		frappe.db.commit()
		deny(
			guest,
			path,
			keyed,
			{"title": "must not create"},
			web_form_request_key="qc08-invalid-noncredential",
		)
		key_result = call(
			guest, path, keyed, {"title": "QC08 keyed " + suffix}, web_form_request_key=request.key
		)["message"]
		key_doc = remember(frappe.get_doc("Note", key_result["name"]))
		request.reload()
		assert request.first_used_on and request.has_reference(key_doc.name)
		deny(guest, path, keyed, {"title": "must not create replay"}, web_form_request_key=request.key)
		deny(
			guest,
			path,
			keyed,
			{"title": "must not edit foreign", "name": foreign.name},
			web_form_request_key=request.key,
		)
		cases.append(
			{
				"endpoint": index,
				"case": "request-key binding, persisted returned ID, one-use and foreign reference",
				"passed": True,
			}
		)
	assert len(cases) == 10
	print(
		json.dumps(
			{
				"passed": len(cases),
				"both_public_entry_points": True,
				"gateway_calls": 0,
				"money_or_external_delivery": False,
			}
		)
	)
finally:
	frappe.db.rollback()
	(folder / "receipt.json").write_text(
		json.dumps(
			{
				"cases": cases,
				"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
				"owned_fixture_manifest": True,
				"policies_or_original_modified": False,
			},
			indent=2,
		)
	)
	frappe.destroy()
