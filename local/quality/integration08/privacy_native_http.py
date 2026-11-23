"""Owned HTTP/RQ/MariaDB privacy acceptance, only after immutable signature-negative gate."""

import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.parse import parse_qs, urlsplit

import frappe
import requests
from frappe.utils.background_jobs import get_queue
from lms.lms.privacy import REQUIRED, policy_state, safe_export
from lms.lms.test_helpers import BaseTestUtils
from profile_privacy_fixture import assert_profile_export, assert_profile_redacted, fill_profile

os.umask(0o077)
site = "test_quality08.localhost"
frappe.init(site=site)
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.allow_tests and frappe.conf.mute_emails and frappe.conf.pause_scheduler
gate = Path(site) / "private/qc08-signature-immutable-passed.json"
assert (
	gate.is_file()
	and json.loads(gate.read_text())["native_signature_structure_text_json_stream_file_errorlog"]
)
suffix = secrets.token_hex(6)
folder = Path(site) / "private" / ("qc08-privacy-http-" + suffix)
folder.mkdir(mode=0o700)
worker = Path("/tmp/qc08-privacy-selected-worker.py")
assert worker.is_file()
base = "http://127.0.0.1:8000"
cases = []
owned = []
clients = {}
jobs = []
children = []
receipt = {
	"site": site,
	"native_application_source_overlay": bool(os.environ.get("QC08_SOURCE_OVERLAY")),
	"signature_negative_gate_sha256": hashlib.sha256(gate.read_bytes()).hexdigest(),
	"cases": cases,
	"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
	"fixture_manifest_private": True,
	"original_touched": False,
}
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
before_queue = set(frappe.get_all("Email Queue", pluck="name"))
marker_before = {
	dt: frappe.db.get_value(dt, "[REDACTED]", "*", as_dict=True) for dt in ("User Skill", "Industry")
}
rate_key = frappe.cache.make_key("rl:lms.lms.privacy.confirm_data_deletion:127.0.0.1") + b":300"
assert not frappe.cache.get(rate_key), "QA requires a fresh native rate window; no counter is reset."


def remember(dt, name):
	owned.append([dt, name])
	(folder / "owned.json").write_text(json.dumps(owned))


def api(actor, path, data=None, method="POST"):
	response = clients[actor].request(method, base + path, json=data, timeout=30, allow_redirects=False)
	frappe.db.rollback()
	return response


def post(actor, method, payload, status=200, error=None):
	response = api(actor, "/api/method/" + method, payload)
	assert response.status_code == status, "HTTP " + str(response.status_code) + " for " + method
	body = response.json()
	if error:
		assert body.get("exc_type") == error
	return body.get("message")


def denied(actor, method, payload, expected):
	response = api(actor, "/api/method/" + method, payload)
	assert response.status_code in (403, 417) and response.json().get("exc_type") == expected
	cases.append(
		{
			"case": method.rsplit(".", 1)[-1] + " denied " + actor,
			"status": response.status_code,
			"exception": expected,
		}
	)


def enqueue_ids(queue_name, request, method):
	queue = get_queue(queue_name)
	return [
		j.id
		for j in queue.get_jobs()
		if j.kwargs.get("site") == site
		and j.kwargs.get("method") == "frappe.utils.background_jobs.run_doc_method"
		and j.kwargs.get("kwargs", {}).get("name") == request
		and j.kwargs["kwargs"].get("doc_method") == method
	]


def selected(
	job_id,
	request,
	method,
	queue="long",
	barrier=None,
	index=None,
	expected_collision=False,
	inject_sql_error=False,
):
	data = {
		"id": job_id,
		"request": request,
		"method": method,
		"queue": queue,
		"expected_collision": expected_collision,
		"inject_sql_error": inject_sql_error,
	}
	if barrier:
		data.update(barrier=str(barrier), marker=str(folder / ("ready-" + str(index))))
	path = folder / ("worker-" + str(len(children)) + ".log")
	log = path.open("xb")
	process = subprocess.Popen(
		[sys.executable, str(worker)], stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT
	)
	process.stdin.write(json.dumps(data).encode())
	process.stdin.close()
	children.append((process, log, path))
	jobs.append(job_id)
	return children[-1]


def finish(child):
	process, log, path = child
	code = process.wait(timeout=45)
	log.close()
	assert code == 0
	result = json.loads(path.read_text().splitlines()[-1])
	assert result["selected_native_rq_job"]
	return result


def configure_synthetic_policy():
	frappe.set_user("Administrator")
	frappe.db.set_single_value(
		"LMS Settings", "custom_signup_content", "<p>QC08 SYNTHETIC TERMS — NOT A REAL POLICY</p>"
	)
	settings = frappe.get_single("LMS Privacy Settings")
	for field in REQUIRED:
		settings.set(field, "QC08 SYNTHETIC " + field + " — NOT APPROVED FOR ANY REAL SITE")
	settings.publication_approved = 1
	settings.save()
	frappe.db.commit()
	frappe.clear_cache()
	assert policy_state()["ready"]


def preview(request):
	return post("manager", "lms.lms.privacy.get_deletion_preview", {"request": request})


def confirmation(request, impact, **kwargs):
	return {
		"request": request,
		"confirmation": request,
		"digest": impact["digest"],
		"reviewed_retention": True,
		"retention_note": "QC08 SYNTHETIC review: retain learning history and private lesson file; no real personal data.",
		**kwargs,
	}


try:
	from frappe.core.doctype.user.user import generate_keys

	actors = {}
	for role, roles in [
		("manager", ["System Manager", "Moderator", "Course Creator"]),
		("departing", ["Course Creator", "LMS Student"]),
		("successor", ["Course Creator"]),
		("outsider", ["LMS Student"]),
	]:
		name = "qc08-privacy-" + role + "-" + suffix + "@example.test"
		user = BaseTestUtils._create_user(
			name, "QC08 Privacy", role, roles, "System User" if role == "manager" else "Website User"
		)
		actors[role] = name
		remember("User", name)
		secret = generate_keys(name)["api_secret"]
		key = frappe.db.get_value("User", name, "api_key")
		client = requests.Session()
		client.headers.update(
			{"X-Frappe-Site-Name": site, "Host": site, "Authorization": "token " + key + ":" + secret}
		)
		clients[role] = client
	clients["guest"] = requests.Session()
	clients["guest"].headers.update({"X-Frappe-Site-Name": site, "Host": site})
	frappe.set_user(actors["departing"])
	course = BaseTestUtils._create_course("QC08 Privacy " + suffix, actors["departing"])
	remember(course.doctype, course.name)
	frappe.set_user("Administrator")
	assert course.owner == actors["departing"]
	chapter = BaseTestUtils._create_chapter("QC08 Privacy Chapter " + suffix, course.name)
	remember(chapter.doctype, chapter.name)
	lesson = BaseTestUtils._create_outline_lesson("QC08 Privacy Lesson " + suffix, chapter.name, course.name)
	remember(lesson.doctype, lesson.name)
	enrollment = BaseTestUtils._create_enrollment(actors["departing"], course.name)
	remember(enrollment.doctype, enrollment.name)
	other_enrollment = BaseTestUtils._create_enrollment(actors["outsider"], course.name)
	remember(other_enrollment.doctype, other_enrollment.name)
	progress = frappe.get_doc(
		{
			"doctype": "LMS Course Progress",
			"member": actors["departing"],
			"course": course.name,
			"lesson": lesson.name,
			"status": "Complete",
		}
	).insert(ignore_permissions=True)
	remember(progress.doctype, progress.name)
	private_file = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": "qc08-privacy-" + suffix + ".txt",
			"content": "QC08 SYNTHETIC PRIVATE CONTENT " + suffix,
			"is_private": 1,
		}
	).insert(ignore_permissions=True)
	private_file.db_set("owner", actors["departing"])
	remember("File", private_file.name)
	profile_fixture = fill_profile(actors["departing"], suffix, remember)
	(folder / "profile-fixture-private.json").write_text(json.dumps(profile_fixture, default=str))
	frappe.db.commit()
	assert not policy_state()["ready"]
	# Native public web form returns only receipt fields; the artifact is sent to its recipient.
	post(
		"guest",
		"frappe.website.doctype.web_form.web_form.accept",
		{
			"web_form": "request-data",
			"data": json.dumps({"doctype": "Personal Data Download Request", "user": actors["departing"]}),
		},
	)
	download = frappe.get_last_doc("Personal Data Download Request", filters={"user": actors["departing"]})
	remember(download.doctype, download.name)
	export_jobs = enqueue_ids("short", download.name, "generate_file_and_send_mail")
	assert len(export_jobs) == 1
	# Claim only this native job; unrelated jobs remain queued.
	export_result = finish(selected(export_jobs[0], download.name, "generate_file_and_send_mail", "short"))
	assert export_result["success"]
	frappe.db.rollback()
	export_file = frappe.get_last_doc(
		"File", filters={"attached_to_doctype": download.doctype, "attached_to_name": download.name}
	)
	remember("File", export_file.name)
	assert export_file.is_private and export_file.owner == actors["departing"]
	content = export_file.get_content()
	content = content.decode() if isinstance(content, bytes) else content
	exported = json.loads(content)
	assert_profile_export(exported, profile_fixture)
	receipt["nonempty_profile_export_fields"] = len(profile_fixture["values"])
	receipt["nonempty_profile_export_children"] = len(profile_fixture["children"])
	assert [u["name"] for u in exported["User"]] == [actors["departing"]]
	assert actors["outsider"] not in content and actors["manager"] not in content
	assert not set(exported["User"][0]) & {"api_key", "api_secret", "reset_password_key", "password"}
	for role, status in [("departing", 200), ("outsider", 403), ("guest", 403)]:
		response = clients[role].get(
			base + "/api/method/frappe.utils.file_manager.download_file",
			params={"file_url": export_file.file_url},
			timeout=20,
		)
		assert response.status_code == status
		if status == 200:
			assert json.loads(response.content) == exported
	from frappe.utils.verified_command import get_signed_params

	signed = dict(
		(k, v[0]) for k, v in parse_qs(get_signed_params({"file_url": export_file.file_url})).items()
	)
	response = clients["guest"].get(
		base + "/api/method/frappe.utils.file_manager.download_file", params=signed, timeout=20
	)
	assert response.status_code == 403, "A signature never bypasses private export owner authorization"
	signed["_signature"] = "qc08-invalid-noncredential"
	response = clients["guest"].get(
		base + "/api/method/frappe.utils.file_manager.download_file", params=signed, timeout=20
	)
	assert response.status_code in (403, 417)
	cases.append(
		{
			"case": "native public request / selected export job / private owner download / Guest including signed request and outsider denied",
			"passed": True,
			"secrets_and_other_users_absent": True,
		}
	)
	from lms.lms.doctype.lms_certificate.lms_certificate import get_default_certificate_template

	certificate = frappe.get_doc(
		{
			"doctype": "LMS Certificate",
			"member": actors["departing"],
			"course": course.name,
			"template": get_default_certificate_template(),
		}
	).insert(ignore_permissions=True)
	remember(certificate.doctype, certificate.name)
	frappe.db.commit()
	assert frappe.db.exists(certificate.doctype, certificate.name)
	post(
		"departing",
		"lms.lms.privacy.rate_help",
		{"article": "privacidade", "useful": 1, "request_key": str(__import__("uuid").uuid4())},
	)
	feedback = frappe.get_last_doc("LMS Help Feedback", filters={"member": actors["departing"]})
	remember(feedback.doctype, feedback.name)
	frappe.db.commit()
	# The confirmation is exercised through its real signed HTTP entry point.
	post(
		"guest",
		"frappe.website.doctype.web_form.web_form.accept",
		{
			"web_form": "request-to-delete-data",
			"data": json.dumps({"doctype": "Personal Data Deletion Request", "email": actors["departing"]}),
		},
	)
	request = frappe.get_last_doc("Personal Data Deletion Request", filters={"email": actors["departing"]})
	remember(request.doctype, request.name)
	assert request.status == "Pending Verification"
	url = urlsplit(request.generate_url_for_confirmation())
	response = clients["guest"].get(base + url.path + "?" + url.query, allow_redirects=False, timeout=30)
	assert response.status_code == 200
	frappe.db.rollback()
	request.reload()
	assert (
		request.status == "Pending Approval"
		and frappe.db.get_value("User", actors["departing"], "enabled") == 1
	)
	assert not preview(request.name)["ready"]
	denied("outsider", "lms.lms.privacy.get_deletion_preview", {"request": request.name}, "PermissionError")
	configure_synthetic_policy()
	impact = preview(request.name)
	# Only this owned QA job injects a real SQL syntax error at the native request lock.
	# It tests the worker rollback path without another HTTP confirmation or a rate reset.
	from lms.lms.privacy import privacy_job_failure
	from frappe.utils.background_jobs import get_job
	from uuid import uuid4

	sql_job_id = "lms-privacy-" + uuid4().hex
	frappe.set_user(actors["manager"])
	frappe.enqueue_doc(
		request.doctype,
		request.name,
		"icarus_anonymize",
		queue="long",
		digest=impact["digest"],
		actor=actors["manager"],
		retention_note="QC08 synthetic SQL fault test.",
		job_id=sql_job_id,
		on_failure=privacy_job_failure,
		enqueue_after_commit=True,
	)
	frappe.db.commit()
	frappe.set_user("Administrator")
	sql_failure = finish(
		selected(get_job(sql_job_id).id, request.name, "icarus_anonymize", inject_sql_error=True)
	)
	assert not sql_failure["success"] and sql_failure["exception"] == "ProgrammingError1064"
	frappe.db.rollback()
	request.reload()
	assert (
		request.status == "Pending Approval"
		and frappe.db.get_value("User", actors["departing"], "enabled") == 1
	)
	assert frappe.db.count("Personal Data Deletion Step", {"parent": request.name}) == 0
	sql_status = post(
		"manager", "lms.lms.privacy.get_anonymization_status", {"request": request.name, "job_id": sql_job_id}
	)
	assert (
		sql_status["status"] == "failed"
		and set(sql_status) == {"status", "message"}
		and "SQL" not in sql_status["message"]
	)
	cases.append(
		{
			"case": "unrelated real SQL1064 remains failed with native rollback and safe authorized status, no retry",
			"passed": True,
		}
	)
	impact = preview(request.name)
	assert not impact["ready"] and any(d["blocking"] for d in impact["dependencies"])
	payload = {
		"doctype": "LMS Course",
		"name": course.name,
		"departing": actors["departing"],
		"successor": actors["successor"],
		"confirmation": course.name,
	}
	denied("outsider", "lms.lms.privacy.transfer_authoring", payload, "PermissionError")
	denied(
		"manager",
		"lms.lms.privacy.transfer_authoring",
		{**payload, "successor": actors["outsider"]},
		"ValidationError",
	)
	assert post("manager", "lms.lms.privacy.transfer_authoring", payload) == {"transferred": True}
	course.reload()
	assert course.owner == actors["departing"] and [i.instructor for i in course.instructors] == [
		actors["successor"]
	]
	impact = preview(request.name)
	assert impact["ready"]
	denied(
		"manager",
		"lms.lms.privacy.confirm_data_deletion",
		confirmation(request.name, impact, reviewed_retention=False),
		"ValidationError",
	)
	denied(
		"manager",
		"lms.lms.privacy.confirm_data_deletion",
		confirmation(request.name, impact, digest="qc08-stale-digest"),
		"ValidationError",
	)
	cases.append(
		{
			"case": "verified email only Pending Approval; draft/dependencies block; transfer is manager-only with active eligible successor and provenance preserved",
			"passed": True,
		}
	)
	# A legitimate unique User collision fails after native disable/redaction has begun.
	collision = BaseTestUtils._create_user(request.name, "QC08 Collision", suffix, ["LMS Student"])
	remember("User", collision.name)
	frappe.db.commit()
	before_user = frappe.get_doc("User", actors["departing"]).as_dict()
	before_profile_export = json.loads(safe_export(actors["departing"]))
	before_steps = frappe.db.count("Personal Data Deletion Step", {"parent": request.name})
	before_queue = set(frappe.get_all("Email Queue", pluck="name"))
	collision_job = post(
		"manager", "lms.lms.privacy.confirm_data_deletion", confirmation(request.name, impact)
	)
	assert collision_job["queued"] and collision_job["job_id"].startswith("lms-privacy-")
	queued = enqueue_ids("long", request.name, "icarus_anonymize")
	assert len(queued) == 1
	failed = finish(selected(queued[0], request.name, "icarus_anonymize", expected_collision=True))
	assert not failed["success"] and failed["exception"] == "NativeRenameTargetExists"
	state = post(
		"manager",
		"lms.lms.privacy.get_anonymization_status",
		{"request": request.name, "job_id": collision_job["job_id"]},
	)
	assert state["status"] == "failed" and set(state) == {"status", "message"}
	frappe.db.rollback()
	request.reload()
	restored = frappe.get_doc("User", actors["departing"]).as_dict()
	assert request.status == "Pending Approval" and all(
		restored[field] == before_user[field]
		for field in ("enabled", "email", "first_name", "last_name", "username", "modified")
	)
	assert frappe.db.count("Personal Data Deletion Step", {"parent": request.name}) == before_steps
	assert set(frappe.get_all("Email Queue", pluck="name")) == before_queue
	assert json.loads(safe_export(actors["departing"])) == before_profile_export
	assert all(
		frappe.db.get_value(dt, "[REDACTED]", "*", as_dict=True) == row for dt, row in marker_before.items()
	)
	receipt["late_native_failure_rolls_back_marker_creation_or_preserves_preexisting_marker"] = True
	assert (
		clients["departing"].get(base + "/api/method/frappe.auth.get_logged_user", timeout=20).status_code
		== 200
	)
	frappe.delete_doc("User", collision.name, ignore_permissions=True)
	frappe.db.commit()
	owned.remove(["User", collision.name])
	cases.append(
		{
			"case": "real selected native RQ failure on unique collision rolls back disable, profile, request steps and queued mail; credentials still authorize",
			"native_exception": failed["exception"],
			"passed": True,
		}
	)
	impact = preview(request.name)
	confirmed = []
	for _ in range(2):
		result = post("manager", "lms.lms.privacy.confirm_data_deletion", confirmation(request.name, impact))
		assert result["queued"] and result["job_id"].startswith("lms-privacy-")
		confirmed.append(result["job_id"])
	before_limit = enqueue_ids("long", request.name, "icarus_anonymize")
	response = api(
		"manager", "/api/method/lms.lms.privacy.confirm_data_deletion", confirmation(request.name, impact)
	)
	assert (
		response.status_code == 429 and enqueue_ids("long", request.name, "icarus_anonymize") == before_limit
	)
	cases.append(
		{"case": "native sixth confirmation is 429 without counter reset or queued write", "passed": True}
	)
	queued = enqueue_ids("long", request.name, "icarus_anonymize")
	assert len(queued) == 2
	# Hold the real row while both native RQ workers reach STARTED.
	frappe.db.get_value(request.doctype, request.name, "name", for_update=True)
	barrier = folder / "start-native-workers"
	pair = [
		selected(job, request.name, "icarus_anonymize", barrier=barrier, index=i)
		for i, job in enumerate(queued)
	]
	deadline = time.monotonic() + 15
	while not all((folder / ("ready-" + str(i))).exists() for i in range(2)):
		assert time.monotonic() < deadline
		time.sleep(0.05)
	pids = [int((folder / ("ready-" + str(i))).read_text()) for i in range(2)]
	assert len(set(pids)) == 2
	barrier.touch()
	from rq.job import Job

	queue = get_queue("long")
	while not all(
		getattr(Job.fetch(job, connection=queue.connection).get_status(), "value", None) == "started"
		for job in queued
	):
		assert time.monotonic() < deadline
		time.sleep(0.05)
	while True:
		waiting = frappe.db.sql(
			"SELECT count(*) FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND DB=%s AND COMMAND=%s AND INFO LIKE %s AND lower(INFO) LIKE %s",
			(frappe.conf.db_name, "Query", "%tabPersonal Data Deletion Request%", "%for update%"),
		)[0][0]
		if waiting == 2:
			break
		assert time.monotonic() < deadline, "Two actual database connections did not reach the row barrier"
		time.sleep(0.05)
	receipt["two_native_db_connections_waiting"] = waiting
	before_concurrent_mail = set(frappe.get_all("Email Queue", pluck="name"))
	frappe.db.commit()
	outcomes = [finish(child) for child in pair]
	assert sum(o["success"] for o in outcomes) == 1 and [
		o["exception"] for o in outcomes if not o["success"]
	] == ["PrivacyImpactConflictError"]
	frappe.db.rollback()
	request.reload()
	assert request.status == "Deleted"
	assert_profile_redacted(request.name, profile_fixture)
	receipt["profile_redaction_and_image_bytes_preserved"] = True
	for dt, field in (("User Skill", "skill"), ("Industry", "industry")):
		assert frappe.db.count(dt, {field: "[REDACTED]"}) == 1
		if marker_before[dt]:
			assert frappe.db.get_value(dt, "[REDACTED]", "*", as_dict=True) == marker_before[dt]
	receipt["required_profile_marker_references_unique_and_native_valid"] = True
	assert (
		not frappe.db.exists("User", actors["departing"])
		and frappe.db.get_value("User", request.name, "enabled") == 0
	)
	assert frappe.db.get_value("LMS Enrollment", enrollment.name, "member") == request.name
	assert frappe.db.get_value("LMS Enrollment", other_enrollment.name, "member") == actors["outsider"]
	assert frappe.db.get_value("LMS Course Progress", progress.name, "member") == request.name
	course.reload()
	assert course.owner == request.name and [i.instructor for i in course.instructors] == [
		actors["successor"]
	]
	assert frappe.db.get_value("File", private_file.name, "owner") == request.name and frappe.get_doc(
		"File", private_file.name
	).get_content() == ("QC08 SYNTHETIC PRIVATE CONTENT " + suffix)
	assert frappe.db.get_value("LMS Certificate", certificate.name, "member") == request.name
	assert frappe.db.get_value("LMS Help Feedback", feedback.name, "member") == request.name
	assert frappe.db.count("LMS Enrollment", {"course": course.name, "member": request.name}) == 1
	assert frappe.db.count("LMS Course Progress", {"lesson": lesson.name, "member": request.name}) == 1
	from frappe.utils.background_jobs import get_job

	assert sorted(get_job(job_id).meta.get("lms_privacy_state", "") for job_id in confirmed) == [
		"",
		"conflict",
	]
	for job_id in confirmed:
		state = post(
			"manager", "lms.lms.privacy.get_anonymization_status", {"request": request.name, "job_id": job_id}
		)
		assert state == {"status": "completed", "message": "Profile anonymization completed"}
		denied(
			"outsider",
			"lms.lms.privacy.get_anonymization_status",
			{"request": request.name, "job_id": job_id},
			"PermissionError",
		)
	assert (
		post(
			"manager",
			"lms.lms.privacy.get_anonymization_status",
			{"request": request.name, "job_id": collision_job["job_id"]},
		)["status"]
		== "completed"
	)
	after_concurrent_mail = set(frappe.get_all("Email Queue", pluck="name"))
	assert len(after_concurrent_mail - before_concurrent_mail) == 1, (
		"Completion notification must be enqueued exactly once"
	)
	receipt["single_completion_notification"] = True
	owned.remove(["User", actors["departing"]])
	remember("User", request.name)
	cases.append(
		{
			"case": "two real RQ workers with row barrier: one commits, other returns typed CHECKREAD conflict for native rollback; learning links/files/provenance retained and only identity redacted",
			"worker_pids": pids,
			"outcomes": outcomes,
			"passed": True,
		}
	)
	receipt["completed_request"] = request.name
	receipt["retained_fixture_for_visual_review"] = True
	receipt["exit_code"] = 0
finally:
	for process, log, path in children:
		if process.poll() is None:
			process.terminate()
			process.wait(timeout=10)
		if not log.closed:
			log.close()
	frappe.db.rollback()
	frappe.set_user("Administrator")
	for (dt, field), rows in singles.items():
		frappe.db.delete("Singles", {"doctype": dt, **({"field": field} if field else {})})
		if rows:
			frappe.db.bulk_insert("Singles", ["doctype", "field", "value"], rows)
	frappe.db.commit()
	frappe.clear_cache()
	receipt["policy_singles_restored_exact"] = all(
		frappe.db.sql(
			"select doctype,field,value from tabSingles where doctype=%s"
			+ (" and field=%s" if field else "")
			+ " order by field",
			(dt, field) if field else (dt,),
		)
		== rows
		for (dt, field), rows in singles.items()
	)
	receipt["policy_ready_after"] = policy_state()["ready"]
	receipt.setdefault("exit_code", 1)
	(folder / "owned.json").write_text(json.dumps(owned))
	(folder / "receipt.json").write_text(
		json.dumps(receipt, ensure_ascii=False, indent=2, default=str) + "\n"
	)
	assert receipt["policy_singles_restored_exact"] and not receipt["policy_ready_after"]
	frappe.destroy()
print(
	json.dumps(
		{
			"private_fixture": folder.name,
			"exit_code": receipt["exit_code"],
			"cases": len(cases),
			"policy_restored": True,
			"credentials_or_links_printed": False,
		}
	)
)
