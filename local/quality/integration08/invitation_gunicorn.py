"""Exercise real native HTTP invitation concurrency without changing application source."""

import hashlib
import json
import re
import secrets
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import frappe
import requests
from frappe.utils.synchronization import filelock

SITE = "test_quality08.localhost"
frappe.init(site=SITE)
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.allow_tests and frappe.conf.mute_emails
from lms.lms import privacy

assert not privacy.policy_state()["ready"]
suffix = secrets.token_hex(8)
private = Path(SITE) / "private" / ("qc08-invitation-gunicorn-" + suffix + ".json")
receipt_path = Path(SITE) / "private" / ("qc08-invitation-gunicorn-" + suffix + "-receipt.json")
rows = []
results = []
log_path = Path("../logs/qc08-http-managed.log")
log_offset = log_path.stat().st_size


def issue():
	email = f"qc08-gp-invite-{len(rows)}-{suffix}@example.test"
	doc = frappe.get_doc(
		{
			"doctype": "User Invitation",
			"email": email,
			"roles": [{"role": "LMS Student"}],
			"app_name": "lms",
			"redirect_to_path": "/lms",
		}
	).insert()
	key = doc.send_invitation_mail()
	frappe.db.commit()
	row = {"email": email, "name": doc.name, "key": key}
	rows.append(row)
	private.write_text(json.dumps(rows))
	private.chmod(0o600)
	return row


def request(row, label, barrier=None, forged=False):
	if barrier:
		barrier.wait(timeout=10)
	start = time.monotonic()
	params = {"key": row["key"]}
	if forged:
		params.update(
			email="qc08-forged-" + suffix + "@example.test", roles='["System Manager"]', is_invited="1"
		)
	response = requests.get(
		"http://127.0.0.1:8000/api/method/frappe.core.api.user_invitation.accept_invitation",
		params=params,
		headers={"Host": SITE, "X-Frappe-Site-Name": SITE, "X-Request-ID": "qc08gp-" + suffix + "-" + label},
		allow_redirects=False,
		timeout=25,
	)
	location = urlparse(response.headers.get("Location", ""))
	query = parse_qs(location.query)
	if location.path == "/update-password":
		outcome = "password_required"
	elif query.get("invitation-busy") == ["1"]:
		outcome = "busy"
	elif query.get("invitation-expired") == ["1"]:
		outcome = "rejected"
	else:
		outcome = "unexpected"
	result = {
		"label": label,
		"status": response.status_code,
		"outcome": outcome,
		"elapsed_seconds": time.monotonic() - start,
		"no_authenticated_cookie": all(
			cookie.name != "sid" or cookie.value == "Guest" for cookie in response.cookies
		),
	}
	assert result["status"] == 302 and result["no_authenticated_cookie"], label
	return result


def state(row, accepted):
	frappe.db.rollback()
	doc = frappe.get_doc("User Invitation", row["name"])
	assert doc.status == ("Accepted" if accepted else "Pending")
	assert frappe.db.count("User", {"name": row["email"]}) == int(accepted)
	if accepted:
		assert not doc.key and doc.user == row["email"]
		roles = frappe.get_all(
			"Has Role", filters={"parenttype": "User", "parent": row["email"]}, pluck="role"
		)
		assert Counter(roles) == {"LMS Student": 1}, roles
		assert not frappe.db.count("Sessions", {"user": row["email"]})
		assert not frappe.db.get_value("User", row["email"], "last_login")
	else:
		assert doc.key == frappe.utils.sha256_hash(row["key"])
		assert not frappe.db.count("Has Role", {"parenttype": "User", "parent": row["email"]})


def race(targets, prefix):
	barrier = threading.Barrier(len(targets) + 1)
	with ThreadPoolExecutor(max_workers=len(targets)) as pool:
		with filelock("lms-accept-invitation", timeout=2):
			futures = [
				pool.submit(request, row, prefix + str(i), barrier, True) for i, row in enumerate(targets)
			]
			barrier.wait(timeout=10)
			# A separate OS process holds the exact native lock while concurrent HTTP workers wait.
			time.sleep(0.6)
		return [future.result(timeout=25) for future in futures]


try:
	different = [issue() for _ in range(8)]
	result = race(different, "different-")
	assert Counter(r["outcome"] for r in result) == {"password_required": 8}
	results.extend(result)
	for row in different:
		state(row, True)
	one = issue()
	result = race([one, one], "one-use-")
	assert Counter(r["outcome"] for r in result) == {"password_required": 1, "rejected": 1}
	results.extend(result)
	state(one, True)
	waiting = issue()
	with filelock("lms-accept-invitation", timeout=2):
		result = request(waiting, "timeout")
	assert result["outcome"] == "busy" and 9.5 <= result["elapsed_seconds"] < 20
	results.append(result)
	state(waiting, False)
	result = request(waiting, "explicit-after-timeout")
	assert result["outcome"] == "password_required"
	results.append(result)
	state(waiting, True)
	result = request({"key": "qc08-invalid-noncredential-" + suffix}, "invalid")
	assert result["outcome"] == "rejected"
	results.append(result)
	after = issue()
	result = request(after, "valid-after-error")
	assert result["outcome"] == "password_required"
	results.append(result)
	state(after, True)
	assert not frappe.db.exists("User", "qc08-forged-" + suffix + "@example.test")
	assert privacy._invited_registration.get() is None and not privacy.policy_state()["ready"]
	with log_path.open() as stream:
		stream.seek(log_offset)
		log = stream.read()
	assert all(row["key"] not in log for row in rows), "Credential appeared in persistent native log"
	lines = [line for line in log.splitlines() if "request_id=qc08gp-" + suffix in line]
	pids = {
		re.search(r"pid=<([0-9]+)>", line).group(1) for line in lines if re.search(r"pid=<([0-9]+)>", line)
	}
	assert len(lines) == len(results) and len(pids) == 2, {
		"logged_requests": len(lines),
		"worker_count": len(pids),
	}
	different_pids = {re.search(r"pid=<([0-9]+)>", line).group(1) for line in lines if "-different-" in line}
	assert len(different_pids) == 2
	proof = {
		"exit_code": 0,
		"native_http_requests": len(results),
		"distinct_gunicorn_workers": sorted(pids),
		"concurrent_recipients": 8,
		"outcomes": results,
		"one_user_per_token_exact_roles": True,
		"draft_public_signup_gate_preserved": True,
		"timeout_no_partial_user_or_token_consumption": True,
		"explicit_retry_after_timeout": True,
		"valid_after_error": True,
		"native_commit_boundary_no_retry_or_source_overlay": True,
		"keys_absent_from_managed_log": True,
		"log_slice_sha256": hashlib.sha256(log.encode()).hexdigest(),
		"harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
		"scope": "single site, shared native filesystem lock; no cross-server or public capacity claim",
		"smtp_muted_not_delivery_proof": True,
		"owned_fixture_manifest": str(private),
	}
	receipt_path.write_text(json.dumps(proof, indent=2) + "\n")
	receipt_path.chmod(0o600)
	print(json.dumps(proof))
finally:
	frappe.db.rollback()
	frappe.destroy()
