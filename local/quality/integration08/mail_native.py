"""Capture real native mail producers at a loopback SMTP sink on the segregated testsite."""

import email.policy
import argparse
import hashlib
import json
import os
import secrets
import socketserver
import sys
import threading
import subprocess
from email.parser import BytesParser
from pathlib import Path

import frappe

parser = argparse.ArgumentParser()
parser.add_argument("--configured-brand", action="store_true")
parser.add_argument(
	"--site", choices=("test_quality08.localhost", "tiberio.localhost"), default="test_quality08.localhost"
)
parser.add_argument("--reset-only", action="store_true")
parser.add_argument("--extended", action="store_true")
parser.add_argument("--bootstrap-download-only", action="store_true")
args = parser.parse_args()
assert sum((args.extended, args.reset_only, args.bootstrap_download_only)) <= 1
SITE = args.site
frappe.init(site=SITE)
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.mute_emails and frappe.conf.pause_scheduler
assert frappe.conf.allow_tests or (
	SITE == "tiberio.localhost" and (args.reset_only or args.bootstrap_download_only)
)
if args.bootstrap_download_only:
	assert SITE == "tiberio.localhost" and frappe.conf.lang == "pt-BR"
sys.path.insert(0, str(Path("/home/frappe/frappe-bench/apps/lms/local/quality/integration08")))
from smtp_sink import Sink

os.umask(0o077)
suffix = secrets.token_hex(6)
member = "qc08-privacy-departing-mail-" + suffix + "@example.test"
invitee = "qc08-mail-invite-" + suffix + "@example.test"
folder = Path(SITE) / "private" / ("qc08-mail-" + suffix)
folder.mkdir(mode=0o700)
capture = folder / "captured"
capture.mkdir(mode=0o700)
allowed = {member, invitee}
account_name = "QC08 SMTP " + suffix
before_accounts = frappe.get_all(
	"Email Account", fields=["name", "default_outgoing", "modified"], order_by="name"
)
before_queue = set(frappe.get_all("Email Queue", pluck="name"))
brand_fields = ["app_name", "banner_image", "modified", "modified_by"]
brand_before = frappe.db.sql(
	"select doctype,field,value from tabSingles where doctype='Website Settings' and field in %s order by field",
	[brand_fields],
)
created = []
retained = []
rows = []
old_mute = frappe.conf.mute_emails
old_flag = frappe.flags.mute_emails
old_lang = frappe.local.lang
server = None
thread = None
proof = {
	"site": SITE,
	"native_application_source_overlays": False,
	"smtp_scope": "127.0.0.1 only; exact synthetic recipient allowlist; no external SMTP",
	"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
	"producers": rows,
	"configured_brand_fixture": args.configured_brand,
	"reset_only_on_segregated_existing_copy": args.reset_only,
	"extended_native_producers": args.extended,
	"bootstrap_download_only": args.bootstrap_download_only,
	"native_bootstrap_config_language": frappe.conf.lang,
}
controlled = [("LMS Privacy Settings", None), ("LMS Settings", "custom_signup_content")]
policy_before = (
	{
		(dt, field): frappe.db.sql(
			"select doctype,field,value from tabSingles where doctype=%s"
			+ (" and field=%s" if field else "")
			+ " order by field",
			(dt, field) if field else (dt,),
		)
		for dt, field in controlled
	}
	if args.extended
	else {}
)


def finish_mail_job(request, method, queue):
	from frappe.utils.background_jobs import get_queue

	jobs = [
		job
		for job in get_queue(queue).get_jobs()
		if job.kwargs.get("site") == SITE
		and job.kwargs.get("kwargs", {}).get("name") == request.name
		and job.kwargs["kwargs"].get("doc_method") == method
	]
	assert len(jobs) == 1
	path = folder / ("native-" + method + "-private.log")
	with path.open("xb") as output:
		result = subprocess.run(
			[
				sys.executable,
				"/home/frappe/frappe-bench/apps/lms/local/quality/integration08/privacy_selected_worker.py",
			],
			input=json.dumps(
				{"id": jobs[0].id, "request": request.name, "method": method, "queue": queue, "site": SITE}
			).encode(),
			stdout=output,
			stderr=subprocess.STDOUT,
			timeout=45,
		)
	assert result.returncode == 0
	worker_proof = json.loads(path.read_text().splitlines()[-1])
	assert worker_proof["success"]
	if args.bootstrap_download_only:
		assert worker_proof["bootstrap_job_language"] == "pt-BR"
		proof["new_native_rq_process_language"] = worker_proof["bootstrap_job_language"]
	frappe.db.rollback()
	frappe.set_user("Administrator")


def deliver(label, producer):
	prior = set(capture.glob("*.eml"))
	producer()
	frappe.db.commit()
	queue = set(frappe.get_all("Email Queue", pluck="name")) - before_queue
	for name in queue:
		doc = frappe.get_doc("Email Queue", name)
		assert doc.recipients and all(r.recipient.lower() in allowed for r in doc.recipients)
		assert doc.get_email_account(raise_error=True).name == account_name
		if doc.status != "Sent":
			doc.send()
	messages = sorted(set(capture.glob("*.eml")) - prior)
	assert messages, "No SMTP capture for " + label
	for path in messages:
		message = BytesParser(policy=email.policy.default).parsebytes(path.read_bytes())
		html = [p.get_content() for p in message.walk() if p.get_content_type() == "text/html"]
		assert html, "Native message has no HTML part"
		if args.bootstrap_download_only:
			assert str(message["Subject"]) == "Baixe seus dados"
			assert all(
				text in html[0]
				for text in (
					"Recebemos seu pedido para baixar seus dados em",
					"Clique no link abaixo para baixar seus dados",
					"Baixar dados",
					"Você também pode copiar e colar este",
					"link de download",
					"no navegador",
				)
			)
			proof["native_subject_and_seven_sources_pt_br"] = True
		rows.append(
			{
				"label": label,
				"capture": path.name,
				"sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
				"html_parts": len(html),
				"subject": str(message["Subject"]),
				"bytes": path.stat().st_size,
			}
		)


def download_data():
	frappe.set_user("Guest")
	doc = frappe.get_doc({"doctype": "Personal Data Download Request", "user": member}).insert(
		ignore_permissions=True
	)
	retained.append((doc.doctype, doc.name))
	frappe.db.commit()
	finish_mail_job(doc, "generate_file_and_send_mail", "short")
	file = frappe.get_last_doc(
		"File", filters={"attached_to_doctype": doc.doctype, "attached_to_name": doc.name}
	)
	assert file.is_private and file.owner == member
	retained.extend((("File", file.name), ("User", member)))


try:
	server = socketserver.ThreadingTCPServer(("127.0.0.1", 1026), Sink)
	server.allowed = allowed
	server.output = capture
	server.daemon_threads = True
	thread = threading.Thread(target=server.serve_forever, daemon=True)
	thread.start()
	frappe.local.lang = "pt-BR"
	if args.configured_brand:
		frappe.db.set_single_value(
			"Website Settings",
			{"app_name": "Tibério Lemes", "banner_image": "/assets/lms/images/assinatura-tiberio.svg"},
		)
		frappe.clear_document_cache("Website Settings", "Website Settings")
		if hasattr(frappe.local, "website_settings"):
			del frappe.local.website_settings
	account = frappe.get_doc(
		{
			"doctype": "Email Account",
			"email_account_name": account_name,
			"email_id": "qc08-sandbox@example.test",
			"enable_outgoing": 1,
			"default_outgoing": 1,
			"enable_incoming": 0,
			"smtp_server": "127.0.0.1",
			"smtp_port": "1026",
			"no_smtp_authentication": 1,
			"use_tls": 0,
			"use_ssl_for_outgoing": 0,
			"always_use_account_email_id_as_sender": 1,
		}
	).insert(ignore_permissions=True)
	assert account.name == account_name
	created.append(("Email Account", account.name))
	frappe.db.commit()
	frappe.conf.mute_emails = 0
	frappe.flags.mute_emails = False
	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": member,
			"first_name": "QC08 SMTP",
			"user_type": "Website User",
			"language": "pt-BR",
			"send_welcome_email": 0,
		}
	).insert(ignore_permissions=True)
	created.append(("User", user.name))
	frappe.db.commit()
	if not (args.reset_only or args.bootstrap_download_only):
		deliver("native welcome", user.send_welcome_mail_to_user)
	if not args.bootstrap_download_only:
		deliver("native reset", lambda: user._reset_password(send_email=True))
	if not (args.reset_only or args.bootstrap_download_only):
		invitation = frappe.get_doc(
			{
				"doctype": "User Invitation",
				"email": invitee,
				"roles": [{"role": "LMS Student"}],
				"app_name": "lms",
				"redirect_to_path": "/lms",
			}
		).insert()
		created.append(("User Invitation", invitation.name))
		deliver("native administrative invitation", invitation.send_invitation_mail)

	def privacy_request():
		request = frappe.get_doc({"doctype": "Personal Data Deletion Request", "email": member}).insert()
		created.append((request.doctype, request.name))

	if not (args.reset_only or args.bootstrap_download_only):
		deliver("native privacy request confirmation", privacy_request)
	if args.bootstrap_download_only:
		deliver("native bootstrap personal data download", download_data)
	if args.extended:
		from lms.lms.privacy import REQUIRED, deletion_preview, policy_state, privacy_job_failure
		from lms.lms.test_helpers import BaseTestUtils
		from lms.lms.doctype.lms_certificate.lms_certificate import get_default_certificate_template
		from uuid import uuid4

		assert SITE == "test_quality08.localhost" and frappe.conf.allow_tests
		gate = Path(SITE) / "private/qc08-signature-immutable-passed.json"
		assert json.loads(gate.read_text())["native_signature_structure_text_json_stream_file_errorlog"]
		proof["signature_negative_gate_sha256"] = hashlib.sha256(gate.read_bytes()).hexdigest()
		manager = BaseTestUtils._create_user(
			"qc08-privacy-manager-mail-" + suffix + "@example.test",
			"QC08",
			"SMTP Manager",
			["System Manager", "Course Creator", "Moderator"],
			"System User",
		)
		manager.language = "pt-BR"
		manager.save()
		retained.append(("User", manager.name))
		course = BaseTestUtils._create_course("QC08 SMTP certificate " + suffix, manager.name)
		course.enable_certification = 1
		course.save()
		chapter = BaseTestUtils._create_chapter("QC08 SMTP chapter " + suffix, course.name)
		lesson = BaseTestUtils._create_outline_lesson("QC08 SMTP lesson " + suffix, chapter.name, course.name)
		enrollment = BaseTestUtils._create_enrollment(member, course.name)
		progress = frappe.get_doc(
			{
				"doctype": "LMS Course Progress",
				"member": member,
				"course": course.name,
				"lesson": lesson.name,
				"status": "Complete",
			}
		).insert(ignore_permissions=True)
		retained.extend((doc.doctype, doc.name) for doc in (course, chapter, lesson, enrollment, progress))
		frappe.db.commit()

		def certificate():
			frappe.set_user(manager.name)
			doc = frappe.get_doc(
				{
					"doctype": "LMS Certificate",
					"member": member,
					"course": course.name,
					"template": get_default_certificate_template(),
				}
			).insert()
			retained.append((doc.doctype, doc.name))
			frappe.set_user("Administrator")

		deliver("native eligible course certificate", certificate)

		deliver("native private personal data download", download_data)

		def completed():
			frappe.set_user("Administrator")
			request = frappe.get_last_doc("Personal Data Deletion Request", filters={"email": member})
			# Only the worker/mail precondition is prepared here; HTTP verification has its own acceptance.
			frappe.db.set_value(request.doctype, request.name, "status", "Pending Approval")
			frappe.db.set_single_value("LMS Settings", "custom_signup_content", "QC08 SYNTHETIC SMTP TERMS")
			settings = frappe.get_single("LMS Privacy Settings")
			for field in REQUIRED:
				settings.set(field, "QC08 SYNTHETIC SMTP TEST ONLY " + field)
			settings.publication_approved = 1
			settings.save()
			frappe.db.commit()
			frappe.clear_cache()
			frappe.set_user(manager.name)
			impact = deletion_preview(request.name)
			assert impact["ready"]
			frappe.enqueue_doc(
				request.doctype,
				request.name,
				"icarus_anonymize",
				queue="long",
				job_id="lms-privacy-" + uuid4().hex,
				digest=impact["digest"],
				actor=manager.name,
				retention_note="QC08 synthetic SMTP capture; keep learning records and private export.",
				enqueue_after_commit=True,
				on_failure=privacy_job_failure,
			)
			frappe.db.commit()
			finish_mail_job(request, "icarus_anonymize", "long")
			request.reload()
			assert request.status == "Deleted"
			assert frappe.db.get_value("LMS Enrollment", enrollment.name, "member") == request.name
			assert frappe.db.get_value("LMS Course Progress", progress.name, "member") == request.name
			retained.extend(((request.doctype, request.name), ("User", request.name)))
			proof["synthetic_worker_precondition_not_http_verification"] = True
			proof["mail_only_not_full_profile_anonymization_acceptance"] = True

		deliver("native profile anonymization completion", completed)
	proof["exit_code"] = 0
finally:
	frappe.db.rollback()
	frappe.set_user("Administrator")
	for name in set(frappe.get_all("Email Queue", pluck="name")) - before_queue:
		doc = frappe.get_doc("Email Queue", name)
		assert doc.recipients and all(r.recipient.lower() in allowed for r in doc.recipients)
		frappe.delete_doc("Email Queue", name, force=True, ignore_permissions=True)
	for doctype, name in reversed(created):
		if frappe.db.exists(doctype, name):
			if (doctype, name) in retained:
				continue
			frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
	for (dt, field), records in policy_before.items():
		frappe.db.delete("Singles", {"doctype": dt, **({"field": field} if field else {})})
		if records:
			frappe.db.bulk_insert("Singles", ["doctype", "field", "value"], records)
	for row in before_accounts:
		frappe.db.set_value(
			"Email Account",
			row.name,
			{"default_outgoing": row.default_outgoing, "modified": row.modified},
			update_modified=False,
		)
	frappe.db.commit()
	frappe.clear_cache(doctype="Email Account")
	if policy_before:
		frappe.clear_cache()
	if args.configured_brand:
		frappe.db.delete("Singles", {"doctype": "Website Settings", "field": ["in", brand_fields]})
		if brand_before:
			frappe.db.bulk_insert("Singles", ["doctype", "field", "value"], brand_before)
		frappe.db.commit()
		frappe.clear_document_cache("Website Settings", "Website Settings")
		if hasattr(frappe.local, "website_settings"):
			del frappe.local.website_settings
	proof["native_brand_fields_restored_exact"] = (
		frappe.db.sql(
			"select doctype,field,value from tabSingles where doctype='Website Settings' and field in %s order by field",
			[brand_fields],
		)
		== brand_before
	)
	frappe.conf.mute_emails = old_mute
	frappe.flags.mute_emails = old_flag
	frappe.local.lang = old_lang
	if server is not None:
		server.shutdown()
		server.server_close()
	if thread is not None:
		thread.join(timeout=3)
	proof["outgoing_accounts_restored"] = (
		frappe.get_all("Email Account", fields=["name", "default_outgoing", "modified"], order_by="name")
		== before_accounts
	)
	proof["mute_emails_config_unchanged"] = frappe.conf.mute_emails == old_mute
	proof["owned_queue_remaining"] = len(set(frappe.get_all("Email Queue", pluck="name")) - before_queue)
	proof["synthetic_policy_singles_restored_exact"] = all(
		frappe.db.sql(
			"select doctype,field,value from tabSingles where doctype=%s"
			+ (" and field=%s" if field else "")
			+ " order by field",
			(dt, field) if field else (dt,),
		)
		== records
		for (dt, field), records in policy_before.items()
	)
	if policy_before:
		from lms.lms.privacy import policy_state

		proof["policy_ready_after"] = policy_state()["ready"]
		assert not proof["policy_ready_after"]
	(folder / "retained-owned-fixtures.json").write_text(json.dumps(retained))
	proof.setdefault("exit_code", 1)
	(folder / "receipt.json").write_text(json.dumps(proof, ensure_ascii=False, indent=2, default=str) + "\n")
	print("Private native SMTP capture: " + folder.name)
	assert (
		proof["outgoing_accounts_restored"]
		and proof["mute_emails_config_unchanged"]
		and proof["owned_queue_remaining"] == 0
	)
	frappe.destroy()
