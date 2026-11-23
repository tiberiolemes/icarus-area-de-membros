"""Worker execution negatives using explicitly synthetic approved-state fixtures."""

import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
from uuid import uuid4

import frappe
from frappe.utils.background_jobs import get_job
from lms.lms.privacy import REQUIRED, deletion_preview, policy_state, privacy_job_failure
from lms.lms.test_helpers import BaseTestUtils

os.umask(0o077)
site = "test_quality08.localhost"
frappe.init(site=site)
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.allow_tests and frappe.conf.mute_emails and frappe.conf.pause_scheduler
suffix = secrets.token_hex(6)
folder = Path(site) / "private" / ("qc08-privacy-negative-rq-" + suffix)
folder.mkdir(mode=0o700)
owned = []
cases = []
controlled = [("LMS Privacy Settings", None), ("LMS Settings", "custom_signup_content")]
singles = {
	(dt, field): frappe.db.sql(
		"select doctype,field,value from tabSingles where doctype=%s"
		+ (" and field=%s" if field else "")
		+ " order by field",
		(dt, field) if field else (dt,),
	)
	for dt, field in controlled
}


def remember(doc):
	owned.append([doc.doctype, doc.name])
	(folder / "owned.json").write_text(json.dumps(owned))
	return doc


try:
	manager = remember(
		BaseTestUtils._create_user(
			"qc08-privacy-manager-" + suffix + "@example.test", "QC08", "Manager", ["System Manager"]
		)
	)
	subject = remember(
		BaseTestUtils._create_user(
			"qc08-privacy-departing-" + suffix + "@example.test", "QC08", "Subject", ["LMS Student"]
		)
	)
	request = remember(
		frappe.get_doc({"doctype": "Personal Data Deletion Request", "email": subject.name}).insert(
			ignore_permissions=True
		)
	)
	# Verification itself is covered by privacy_native_http.py; prepare only the worker precondition here.
	frappe.db.set_value(request.doctype, request.name, "status", "Pending Approval")
	frappe.db.set_single_value("LMS Settings", "custom_signup_content", "QC08 SYNTHETIC TERMS ONLY")
	settings = frappe.get_single("LMS Privacy Settings")
	for field in REQUIRED:
		settings.set(field, "QC08 SYNTHETIC TEST ONLY " + field)
	settings.publication_approved = 1
	settings.save()
	frappe.db.commit()
	frappe.clear_cache()
	fields = ["enabled", "email", "first_name", "last_name", "username", "modified", "api_key"]
	before = frappe.db.get_value("User", subject.name, fields, as_dict=True)
	before_mail = set(frappe.get_all("Email Queue", pluck="name"))
	for case in ("actor", "digest", "policy"):
		frappe.set_user("Administrator")
		if case == "policy":
			frappe.db.set_single_value("LMS Privacy Settings", "publication_approved", 0)
			frappe.db.commit()
			frappe.clear_cache()
		frappe.set_user(manager.name)
		preview = deletion_preview(request.name)
		assert preview["ready"] == (case != "policy")
		job_id = "lms-privacy-" + uuid4().hex
		frappe.enqueue_doc(
			request.doctype,
			request.name,
			"icarus_anonymize",
			queue="long",
			job_id=job_id,
			on_failure=privacy_job_failure,
			enqueue_after_commit=True,
			digest="qc08-invalid-noncredential" if case == "digest" else preview["digest"],
			actor=subject.name if case == "actor" else manager.name,
			retention_note="QC08 synthetic worker rejection test.",
		)
		frappe.db.commit()
		job = get_job(job_id)
		payload = {
			"id": job.id,
			"request": request.name,
			"method": "icarus_anonymize",
			"queue": "long",
			"expected_rejection": "actor" if case == "actor" else "impact",
		}
		path = folder / (case + "-private.log")
		with path.open("xb") as log:
			process = subprocess.run(
				[sys.executable, "/tmp/qc08-privacy-selected-worker.py"],
				input=json.dumps(payload).encode(),
				stdout=log,
				stderr=subprocess.STDOUT,
				timeout=45,
			)
		assert process.returncode == 0
		result = json.loads(path.read_text().splitlines()[-1])
		assert (
			not result["success"]
			and result["exception"] == ("ActorDenied" if case == "actor" else "ImpactChanged")
			and result["context_cleared"]
		)
		frappe.db.rollback()
		assert frappe.db.get_value("User", subject.name, fields, as_dict=True) == before
		assert frappe.db.get_value(request.doctype, request.name, "status") == "Pending Approval"
		assert frappe.db.count("Personal Data Deletion Step", {"parent": request.name}) == 0
		assert set(frappe.get_all("Email Queue", pluck="name")) == before_mail
		assert get_job(job_id).meta["lms_privacy_state"] == "failed"
		cases.append({"case": case, "native_result": result, "no_partial_state": True})
	print(
		json.dumps(
			{
				"worker_negatives_passed": len(cases),
				"synthetic_verified_state_fixture": True,
				"http_verification_claimed": False,
			}
		)
	)
finally:
	frappe.db.rollback()
	frappe.set_user("Administrator")
	for (dt, field), rows in singles.items():
		frappe.db.delete("Singles", {"doctype": dt, **({"field": field} if field else {})})
		if rows:
			frappe.db.bulk_insert("Singles", ["doctype", "field", "value"], rows)
	frappe.db.commit()
	frappe.clear_cache()
	restored = all(
		frappe.db.sql(
			"select doctype,field,value from tabSingles where doctype=%s"
			+ (" and field=%s" if field else "")
			+ " order by field",
			(dt, field) if field else (dt,),
		)
		== rows
		for (dt, field), rows in singles.items()
	)
	assert restored and not policy_state()["ready"]
	(folder / "receipt.json").write_text(
		json.dumps(
			{
				"cases": cases,
				"policy_restored_exact": restored,
				"policy_ready_after": False,
				"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
			},
			indent=2,
		)
	)
	frappe.destroy()
