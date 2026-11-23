"""Execute exactly one owned native RQ job; never dequeue unrelated work."""

import json
import os
from pathlib import Path
import sys
import time
import traceback
from unittest.mock import patch

import frappe
from rq import Worker
from rq.job import Job
from frappe.utils.background_jobs import get_queue
from lms.lms.privacy import PrivacyImpactConflictError, _deletion

payload = json.load(sys.stdin)
assert set(payload) <= {
	"id",
	"request",
	"method",
	"queue",
	"barrier",
	"marker",
	"expected_collision",
	"inject_sql_error",
	"expected_rejection",
	"site",
	"profile_reference_barrier",
}
site = payload.get("site", "test_quality08.localhost")
assert site in {"test_quality08.localhost", "test_quality08_profile.localhost", "test_quality08_profile_second.localhost", "tiberio.localhost"}
frappe.init(site=site)
frappe.connect()
assert frappe.conf.pause_scheduler and frappe.conf.mute_emails
if site == "tiberio.localhost":
	assert payload["method"] == "generate_file_and_send_mail" and payload["queue"] == "short"
	assert not any(
		payload.get(key)
		for key in (
			"barrier",
			"profile_reference_barrier",
			"inject_sql_error",
			"expected_collision",
			"expected_rejection",
		)
	)
	assert frappe.conf.lang == "pt-BR"
else:
	assert frappe.conf.allow_tests
queue = get_queue(payload["queue"])
job = Job.fetch(payload["id"], connection=queue.connection)
assert job.kwargs["site"] == site
assert job.kwargs["method"] == "frappe.utils.background_jobs.run_doc_method"
assert job.kwargs["kwargs"]["name"] == payload["request"]
assert job.kwargs["kwargs"]["doc_method"] == payload["method"]
assert job.kwargs["kwargs"]["doctype"] in ("Personal Data Deletion Request", "Personal Data Download Request")
if payload["method"] == "icarus_anonymize":
	assert job.kwargs["user"].startswith("qc08-privacy-manager-") and job.kwargs["user"].endswith(
		"@example.test"
	)
	if payload.get("expected_collision"):
		assert frappe.db.exists("User", payload["request"])
		subject = frappe.db.get_value("Personal Data Deletion Request", payload["request"], "email")
		assert subject.startswith("qc08-privacy-departing-") and subject.endswith("@example.test")
else:
	assert payload["method"] == "generate_file_and_send_mail" and job.kwargs["user"] == "Guest"
	member = frappe.db.get_value("Personal Data Download Request", payload["request"], "user")
	assert member.startswith("qc08-privacy-departing-") and member.endswith("@example.test")
assert queue.remove(job.id) == 1
programming_error = frappe.db.ProgrammingError
failure = {}


def capture_failure(job, error_type, error, native_traceback):
	failure["type"] = error_type.__module__ + "." + error_type.__name__
	if isinstance(error, PrivacyImpactConflictError):
		failure["classification"] = "PrivacyImpactConflictError"
	elif (
		payload.get("expected_collision")
		and isinstance(error, frappe.ValidationError)
		and str(error) == "Another User with name " + payload["request"] + " exists, select another name"
		and any(
			frame.f_code.co_name == "validate_rename"
			and frame.f_code.co_filename.endswith("/frappe/model/rename_doc.py")
			for frame, _ in traceback.walk_tb(native_traceback)
		)
	):
		failure["classification"] = "NativeRenameTargetExists"
	elif payload.get("inject_sql_error") and isinstance(error, programming_error) and error.args[0] == 1064:
		failure["classification"] = "ProgrammingError1064"
	elif (
		payload.get("expected_rejection") == "actor"
		and isinstance(error, frappe.PermissionError)
		and str(error) == "The requesting administrator must execute this job."
	):
		failure["classification"] = "ActorDenied"
	elif (
		payload.get("expected_rejection") == "impact"
		and isinstance(error, frappe.ValidationError)
		and not isinstance(error, PrivacyImpactConflictError)
		and str(error) == "The privacy impact changed. Review and confirm again."
	):
		failure["classification"] = "ImpactChanged"
	elif (
		payload.get("expected_rejection") == "profile_reference"
		and isinstance(error, frappe.ValidationError)
		and str(error)
		== "The technical profile redaction reference is inconsistent. Contact the site administrator."
	):
		failure["classification"] = "InconsistentProfileReference"
	else:
		failure["classification"] = "UNCLASSIFIED_FAILURE"
	return True


worker = Worker(
	[queue],
	connection=queue.connection,
	name="qc08-selected-" + str(os.getpid()),
	exception_handlers=[capture_failure],
)
if payload.get("barrier"):
	barrier = Path(payload["barrier"])
	marker = Path(payload["marker"])
	assert barrier.is_relative_to(Path(site) / "private") and marker.parent == barrier.parent
	marker.write_text(str(os.getpid()))
	deadline = time.monotonic() + 20
	while not barrier.exists():
		assert time.monotonic() < deadline
		time.sleep(0.05)
frappe.destroy()
if payload.get("inject_sql_error"):
	assert payload["method"] == "icarus_anonymize"
	from frappe.database.database import Database

	original_get_value = Database.get_value

	def inject_sql_error(db, doctype, filters=None, *args, **kwargs):
		if (
			doctype == "Personal Data Deletion Request"
			and filters == payload["request"]
			and kwargs.get("for_update")
		):
			return db.sql("SELECT QC08_UNRELATED_SYNTAX_ERROR(")
		return original_get_value(db, doctype, filters, *args, **kwargs)

	with patch.object(Database, "get_value", inject_sql_error):
		success = worker.perform_job(job, queue)
elif payload.get("profile_reference_barrier"):
	from frappe.database.database import Database

	barrier = Path(payload["profile_reference_barrier"])
	assert barrier.is_relative_to(Path(site) / "private")
	original_get_value = Database.get_value

	def synchronized_profile_request(db, doctype, filters=None, *args, **kwargs):
		result = original_get_value(db, doctype, filters, *args, **kwargs)
		if (
			doctype == "Personal Data Deletion Request"
			and filters == payload["request"]
			and kwargs.get("for_update")
		):
			connection = db.sql("SELECT CONNECTION_ID()")[0][0]
			barrier.with_name(barrier.name + "-" + str(os.getpid())).write_text(
				json.dumps({"pid": os.getpid(), "connection": connection})
			)
			deadline = time.monotonic() + 20
			while not barrier.exists():
				assert time.monotonic() < deadline
				time.sleep(0.05)
		return result

	with patch.object(Database, "get_value", synchronized_profile_request):
		success = worker.perform_job(job, queue)
else:
	if site == "tiberio.localhost":
		worker_languages = []
		native_init = frappe.init

		def observe_job_init(*args, **kwargs):
			result = native_init(*args, **kwargs)
			if kwargs.get("is_job"):
				worker_languages.append(frappe.local.lang)
			return result

		with patch.object(frappe, "init", observe_job_init):
			success = worker.perform_job(job, queue)
		assert worker_languages == ["pt-BR"]
	else:
		success = worker.perform_job(job, queue)
job.refresh()

assert _deletion.get() is None
exception = ""
if not success:
	raw = job.exc_info or ""
	exception = failure.get("classification", "UNCLASSIFIED_FAILURE")
	if exception == "PrivacyImpactConflictError":
		assert (
			"QueryDeadlockError" not in raw
			and "pymysql.err.OperationalError" not in raw
			and "MySQLdb.OperationalError" not in raw
		)
print(
	json.dumps(
		{
			"selected_native_rq_job": True,
			"success": success,
			"status": str(job.get_status()),
			"exception": exception,
			"native_exception_type": failure.get("type", ""),
			"safe_native_conflict_code": job.meta.get("lms_privacy_conflict_code"),
			"context_cleared": True,
			"worker_pid": os.getpid(),
			"bootstrap_job_language": worker_languages[0] if site == "tiberio.localhost" else None,
		}
	)
)
