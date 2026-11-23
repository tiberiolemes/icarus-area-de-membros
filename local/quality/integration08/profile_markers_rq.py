"""Native RQ marker creation/races/rollback on a new, segregated synthetic site."""

import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from uuid import uuid4

import frappe
import requests
from frappe.core.doctype.user.user import generate_keys
from frappe.utils.background_jobs import get_job
from lms.lms.privacy import REQUIRED, deletion_preview, policy_state, privacy_job_failure, safe_export
from lms.lms.test_helpers import BaseTestUtils
from profile_privacy_fixture import assert_profile_export, assert_profile_redacted, fill_profile

os.umask(0o077)
site = "test_quality08_profile.localhost"
frappe.init(site=site)
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.allow_tests and frappe.conf.mute_emails and frappe.conf.pause_scheduler
suffix = secrets.token_hex(6)
folder = Path(site) / "private" / ("qc08-profile-markers-" + suffix)
folder.mkdir(mode=0o700)
proof = {
	"source_overlay": bool(os.environ.get("QC08_SOURCE_OVERLAY")),
	"synthetic_verified_state_fixture_not_http_verification": True,
	"cases": [],
	"original_touched": False,
}
owned, processes = [], []
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
marker_types = ("User Skill", "Industry")
assert not any(frappe.db.exists(dt, "[REDACTED]") for dt in marker_types), (
	"First-creation test requires a new site"
)
original_catalogues = {dt: frappe.get_all(dt, fields=["*"], order_by="name") for dt in marker_types}


def remember(dt, name):
	owned.append([dt, name])
	(folder / "owned.json").write_text(json.dumps(owned))


def markers():
	return {dt: frappe.db.get_value(dt, "[REDACTED]", "*", as_dict=True) for dt in marker_types}


def subject(tag):
	frappe.set_user("Administrator")
	user = BaseTestUtils._create_user(
		"qc08-privacy-departing-" + tag + "-" + suffix + "@example.test", "QC08", tag, ["LMS Student"]
	)
	remember("User", user.name)
	fixture = fill_profile(user.name, tag + suffix, remember)
	request = frappe.get_doc({"doctype": "Personal Data Deletion Request", "email": user.name}).insert(
		ignore_permissions=True
	)
	remember(request.doctype, request.name)
	frappe.db.set_value(request.doctype, request.name, "status", "Pending Approval")
	frappe.db.commit()
	assert_profile_export(json.loads(safe_export(user.name)), fixture)
	return request, fixture


def enqueue(request):
	frappe.set_user(manager.name)
	preview = deletion_preview(request.name)
	assert preview["ready"]
	job = "lms-privacy-" + uuid4().hex
	frappe.enqueue_doc(
		request.doctype,
		request.name,
		"icarus_anonymize",
		queue="long",
		digest=preview["digest"],
		actor=manager.name,
		retention_note="QC08 synthetic professional profile and technical reference review.",
		job_id=job,
		on_failure=privacy_job_failure,
		enqueue_after_commit=True,
	)
	frappe.db.commit()
	return get_job(job).id


def execute(request, job, **options):
	path = folder / ("worker-" + str(len(processes)) + "-private.log")
	log = path.open("xb")
	process = subprocess.Popen(
		[sys.executable, "/tmp/qc08-privacy-selected-worker.py"],
		stdin=subprocess.PIPE,
		stdout=log,
		stderr=subprocess.STDOUT,
	)
	process.stdin.write(
		json.dumps(
			{
				"id": job,
				"site": site,
				"request": request.name,
				"method": "icarus_anonymize",
				"queue": "long",
				**options,
			}
		).encode()
	)
	process.stdin.close()
	processes.append((process, log, path))
	return processes[-1]


def finish(child):
	process, log, path = child
	assert process.wait(timeout=45) == 0
	log.close()
	result = json.loads(path.read_text().splitlines()[-1])
	assert result["context_cleared"]
	frappe.db.rollback()
	frappe.set_user("Administrator")
	return result


def failed_rename(request, fixture):
	frappe.set_user("Administrator")
	collision = BaseTestUtils._create_user(request.name, "QC08", "Collision", ["LMS Student"])
	remember("User", collision.name)
	frappe.db.commit()
	before = json.loads(safe_export(request.email))
	before_markers = markers()
	before_mail = set(frappe.get_all("Email Queue", pluck="name"))
	result = finish(execute(request, enqueue(request), expected_collision=True))
	assert not result["success"] and result["exception"] == "NativeRenameTargetExists"
	request.reload()
	assert request.status == "Pending Approval" and frappe.db.get_value("User", request.email, "enabled") == 1
	assert json.loads(safe_export(request.email)) == before and markers() == before_markers
	assert set(frappe.get_all("Email Queue", pluck="name")) == before_mail
	frappe.delete_doc("User", collision.name, ignore_permissions=True)
	frappe.db.commit()
	return result


try:
	manager = BaseTestUtils._create_user(
		"qc08-privacy-manager-" + suffix + "@example.test",
		"QC08",
		"Manager",
		["System Manager"],
		"System User",
	)
	remember("User", manager.name)
	for dt, field, parentfield, childfield in (
		("User Skill", "skill", "skill", "skill_name"),
		("Industry", "industry", "preferred_industries", "industry"),
	):
		lookup = frappe.get_doc({"doctype": dt, field: "QC08 untouched catalogue " + suffix}).insert(
			ignore_permissions=True
		)
		remember(dt, lookup.name)
		manager.append(parentfield, {childfield: lookup.name})
	manager.save(ignore_permissions=True)
	frappe.db.commit()
	original_catalogues = {dt: frappe.get_all(dt, fields=["*"], order_by="name") for dt in marker_types}
	frappe.db.set_single_value("LMS Settings", "custom_signup_content", "QC08 SYNTHETIC TERMS ONLY")
	settings = frappe.get_single("LMS Privacy Settings")
	for field in REQUIRED:
		settings.set(field, "QC08 SYNTHETIC TEST ONLY " + field)
	settings.publication_approved = 1
	settings.save()
	frappe.db.commit()
	frappe.clear_cache()
	first_failed, first_fixture = subject("firstrollback")
	manager_secret = generate_keys(manager.name)["api_secret"]
	manager_key = frappe.db.get_value("User", manager.name, "api_key")
	outsider_secret = generate_keys(first_failed.email)["api_secret"]
	outsider_key = frappe.db.get_value("User", first_failed.email, "api_key")
	frappe.db.commit()
	# Native generate_keys saves User and its children; baseline after fixture setup.
	foreign_references = {
		dt: frappe.get_all(
			dt,
			filters={"parent": manager.name, "parenttype": "User", "parentfield": field},
			fields=["*"],
			order_by="name",
		)
		for dt, field in (("Skills", "skill"), ("Preferred Industry", "preferred_industries"))
	}
	failed_rename(first_failed, first_fixture)
	assert not any(markers().values())
	proof["cases"].append(
		"Late native rename failure rolls back both new technical references, complete profile and notification"
	)
	first, first_data = subject("concurrenta")
	second, second_data = subject("concurrentb")
	barrier = folder / "reference-release"
	jobs = [enqueue(first), enqueue(second)]
	before_completion = set(frappe.get_all("Email Queue", pluck="name"))
	children = [
		execute(request, job, profile_reference_barrier=str(barrier))
		for request, job in zip((first, second), jobs)
	]
	deadline = time.monotonic() + 20
	while len(list(folder.glob("reference-release-*"))) != 2:
		assert time.monotonic() < deadline, "Two real workers did not lock their distinct native requests"
		time.sleep(0.05)
	connections = [json.loads(path.read_text()) for path in folder.glob("reference-release-*")]
	assert len({row["pid"] for row in connections}) == len({row["connection"] for row in connections}) == 2
	proof["two_workers_and_db_connections_after_distinct_request_row_locks"] = connections
	barrier.write_text("release")
	results = [finish(child) for child in children]
	assert len({result["worker_pid"] for result in results}) == 2 and any(
		result["success"] for result in results
	)
	assert all(result["success"] or result["exception"] == "PrivacyImpactConflictError" for result in results)
	assert sum(not result["success"] for result in results) == 1, (
		"This recovery scenario requires one actual rejected transaction"
	)
	proof["two_worker_outcomes"] = results
	for request, fixture, result in zip((first, second), (first_data, second_data), results):
		request.reload()
		if not result["success"]:
			assert result["safe_native_conflict_code"] in (1020, 1213)
			assert (
				request.status == "Pending Approval"
				and frappe.db.get_value("User", request.email, "enabled") == 1
			)
			assert_profile_export(json.loads(safe_export(request.email)), fixture)
			endpoint = "http://127.0.0.1:8000/api/method/lms.lms.privacy.get_anonymization_status"
			job_id = jobs[(first, second).index(request)].split("||")[-1]
			for key, secret, expected in (
				(manager_key, manager_secret, 200),
				(outsider_key, outsider_secret, 403),
			):
				response = requests.post(
					endpoint,
					json={"request": request.name, "job_id": job_id},
					headers={
						"Host": site,
						"X-Frappe-Site-Name": site,
						"Authorization": "token " + key + ":" + secret,
					},
					timeout=20,
				)
				assert response.status_code == expected
				if expected == 200:
					state = response.json()["message"]
					assert state["status"] == "conflict" and set(state) == {"status", "message"}
					assert all(term not in state["message"] for term in ("SQL", "Traceback", "1213", "1020"))
				else:
					assert response.json().get("exc_type") == "PermissionError"
			frappe.db.rollback()
			proof["safe_conflict_http_status_authorized_and_outsider_denied"] = True
			# This is a new explicit action after a fresh preview, never an automatic retry.
			result = finish(execute(request, enqueue(request)))
			assert result["success"]
			proof["explicit_new_action_after_conflict"] = True
		request.reload()
		assert request.status == "Deleted"
		assert_profile_redacted(request.name, fixture)
	for dt, field in (("User Skill", "skill"), ("Industry", "industry")):
		assert frappe.db.count(dt, {field: "[REDACTED]"}) == 1
	assert len(set(frappe.get_all("Email Queue", pluck="name")) - before_completion) == 2
	proof["cases"].append(
		"Two real worker transactions lock distinct requests before profile writes; absent references converge to one canonical row per target, typed rollback or committed native success, explicit recovery and valid linked records"
	)
	stable_markers = markers()
	result = finish(execute(first_failed, enqueue(first_failed)))
	assert result["success"]
	first_failed.reload()
	assert first_failed.status == "Deleted"
	assert_profile_redacted(first_failed.name, first_fixture)
	assert markers() == stable_markers
	proof["cases"].append(
		"Successful explicit action reuses both preexisting references without writes or duplicates"
	)
	second_failed, second_fixture = subject("existingrollback")
	failed_rename(second_failed, second_fixture)
	assert markers() == stable_markers
	proof["cases"].append("Late native failure leaves both preexisting technical references byte-identical")
	before = json.loads(safe_export(second_failed.email))
	try:
		frappe.db.set_value(
			"User Skill", "[REDACTED]", "skill", "QC08 incompatible technical fixture", update_modified=False
		)
		frappe.db.commit()
		incompatible = markers()
		result = finish(
			execute(second_failed, enqueue(second_failed), expected_rejection="profile_reference")
		)
		assert not result["success"] and result["exception"] == "InconsistentProfileReference"
		assert markers() == incompatible and json.loads(safe_export(second_failed.email)) == before
	finally:
		frappe.db.rollback()
		frappe.set_user("Administrator")
		frappe.db.set_value("User Skill", "[REDACTED]", "skill", "[REDACTED]", update_modified=False)
		frappe.db.commit()
	assert markers() == stable_markers
	proof["cases"].append(
		"Incompatible existing marker is rejected without overwrite, partial profile changes or new notification; owned fault fixture restored"
	)
	for dt, rows in original_catalogues.items():
		for row in rows:
			assert frappe.db.get_value(dt, row.name, "*", as_dict=True) == row
	assert {
		dt: frappe.get_all(
			dt,
			filters={"parent": manager.name, "parenttype": "User", "parentfield": field},
			fields=["*"],
			order_by="name",
		)
		for dt, field in (("Skills", "skill"), ("Preferred Industry", "preferred_industries"))
	} == foreign_references
	proof["original_catalogues_and_foreign_references_unchanged"] = True
	proof["profile40_child7_ids_idx_parents_files_and_three_negative_scopes"] = True
	proof["exit_code"] = 0
finally:
	for process, log, path in processes:
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
	proof["policy_singles_restored_exact"] = all(
		frappe.db.sql(
			"select doctype,field,value from tabSingles where doctype=%s"
			+ (" and field=%s" if field else "")
			+ " order by field",
			(dt, field) if field else (dt,),
		)
		== rows
		for (dt, field), rows in singles.items()
	)
	assert proof["policy_singles_restored_exact"] and not policy_state()["ready"]
	proof.setdefault("exit_code", 1)
	proof["harness_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
	(folder / "receipt.json").write_text(json.dumps(proof, indent=2, default=str))
	frappe.destroy()
print(json.dumps(proof))
