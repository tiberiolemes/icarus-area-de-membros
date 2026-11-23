"""Administrative invitation capabilities stay separate from public signup consent."""

import json
import secrets
import select
import subprocess
import sys
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import frappe
from frappe.core.doctype.user_invitation.user_invitation import UserInvitation
from frappe.sessions import clear_sessions
from frappe.tests.test_api import FrappeAPITestCase, make_request
from frappe.utils import add_days, get_test_client, now_datetime
from frappe.utils.password import update_password

from lms.lms import privacy
from lms.lms.test_helpers import BaseTestUtils
from lms.tests.test_coupon_redemption import _delete_committed, _delete_committed_user

ACCEPT = "frappe.core.api.user_invitation.accept_invitation"
INVITE = "frappe.core.api.user_invitation.invite_by_email"


class TestNativeInvitationHTTP(FrappeAPITestCase):
	def setUp(self):
		super().setUp()
		assert frappe.local.site.startswith("test_") and frappe.conf.allow_tests and frappe.conf.mute_emails
		frappe.set_user("Administrator")
		self.suffix = secrets.token_hex(8)
		self.actor = f"invite08-admin-{self.suffix}@example.test"
		self.password = "Aa9!" + secrets.token_urlsafe(24)
		self.targets = []
		self.request_ip = "127." + ".".join(str(value) for value in secrets.token_bytes(3))
		BaseTestUtils._create_user(self.actor, "Invite08", "Admin", ["System Manager"], "System User")
		update_password(self.actor, self.password)
		frappe.db.commit()
		self.mail = patch.object(frappe, "sendmail")
		self.capture = self.mail.start()
		self.TEST_CLIENT = get_test_client()
		self.assertFalse(privacy.policy_state()["ready"])
		self.assertEqual(self.api("login", usr=self.actor, pwd=self.password).status_code, 200)

	def tearDown(self):
		frappe.db.rollback()
		frappe.set_user("Administrator")
		for email in self.targets:
			for name in frappe.get_all("User Invitation", filters={"email": email}, pluck="name"):
				_delete_committed("User Invitation", name)
		for email in [*self.targets, self.actor]:
			clear_sessions(user=email, force=True)
			if frappe.db.exists("LMS Account Security", email):
				_delete_committed("LMS Account Security", email)
			if frappe.db.exists("User", email):
				_delete_committed_user(email)
		frappe.db.commit()
		self.mail.stop()
		super().tearDown()

	def api(self, method, **data):
		return self.post(self.method(method), data, environ_overrides={"REMOTE_ADDR": self.request_ip})

	def target(self):
		email = f"invite08-target-{len(self.targets)}-{self.suffix}@example.test"
		self.targets.append(email)
		return email

	def invite(self):
		email = self.target()
		response = self.api(
			INVITE, emails=email, roles=["LMS Student"], app_name="lms", redirect_to_path="/lms"
		)
		self.assertEqual(response.status_code, 200)
		key = parse_qs(urlparse(self.capture.call_args.kwargs["args"]["invite_link"]).query)["key"][0]
		frappe.db.rollback()
		name = frappe.db.get_value("User Invitation", {"email": email}, "name")
		stored = frappe.db.get_value("User Invitation", name, "key")
		self.assertTrue(stored != key and stored == frappe.utils.sha256_hash(key))
		return email, name, key

	def guest(self):
		self.assertEqual(self.api("logout").status_code, 200)

	def accept(self, key, **extra):
		return self.get(
			self.method(ACCEPT),
			query_string={"key": key, **extra},
			base_url=self.site_url,
			environ_overrides={"REMOTE_ADDR": self.request_ip},
		)

	def outcome(self, response):
		if response.status_code != 302:
			return "error:" + str(response.status_code) + ":" + str((response.json or {}).get("exc_type"))
		location = urlparse(response.headers.get("Location", ""))
		if location.path == "/update-password":
			return "password_required"
		if parse_qs(location.query).get("invitation-expired") == ["1"]:
			return "rejected"
		return "unexpected_redirect"

	def assert_created_once(self, email, name):
		frappe.db.rollback()
		self.assertEqual(frappe.db.count("User", {"name": email}), 1)
		self.assertEqual(frappe.db.get_value("User Invitation", name, "status"), "Accepted")
		self.assertFalse(frappe.db.get_value("User Invitation", name, "key"))
		self.assertEqual(
			frappe.db.count("Has Role", {"parent": email, "parenttype": "User", "role": "LMS Student"}), 1
		)
		self.assertFalse(
			{"System Manager", "Moderator", "Course Creator", "Batch Evaluator"}
			& set(frappe.get_roles(email))
		)
		self.assertEqual(frappe.db.count("Sessions", {"user": email}), 0)
		self.assertFalse(frappe.db.get_value("User", email, "last_login"))
		self.assertFalse(privacy.policy_state()["ready"])

	def test_valid_administrative_invitation_with_draft_policy_and_replay(self):
		email, name, key = self.invite()
		other = self.target()
		self.guest()
		response = self.accept(key, email=other, roles=json.dumps(["System Manager"]), is_invited="1")
		self.assertEqual(self.outcome(response), "password_required")
		self.assert_created_once(email, name)
		self.assertFalse(frappe.db.exists("User", other))
		cookie = self.TEST_CLIENT.get_cookie("sid", domain=urlparse(self.site_url).hostname)
		self.assertTrue(cookie is None or cookie.value == "Guest")
		self.assertEqual(self.outcome(self.accept(key)), "rejected")
		self.assert_created_once(email, name)

	def test_invalid_expired_and_cancelled_tokens_never_create_users(self):
		rows = [self.invite(), self.invite()]
		frappe.set_user("Administrator")
		frappe.db.set_value("User Invitation", rows[0][1], "email_sent_at", add_days(now_datetime(), -4))
		frappe.db.set_value("User Invitation", rows[1][1], "status", "Cancelled")
		frappe.db.commit()
		self.guest()
		for key in ["invalid-synthetic-capability", rows[0][2], rows[1][2]]:
			self.assertEqual(self.outcome(self.accept(key)), "rejected")
		frappe.db.rollback()
		for email, _, _ in rows:
			self.assertFalse(frappe.db.exists("User", email))
			self.assertEqual(frappe.db.count("Has Role", {"parent": email}), 0)
		self.assertIsNone(privacy._invited_registration.get())

	def test_guest_flags_and_pending_invitation_do_not_authorize_public_signup_or_rest(self):
		email, _, key = self.invite()
		self.guest()
		response = self.post(
			self.resource("User"),
			{
				"email": email,
				"first_name": "Forged",
				"flags": {"ignore_permissions": True, "icarus_invited_registration": email},
				"is_invited": 1,
				"key": key,
			},
		)
		self.assertEqual(response.status_code, 403)
		response = self.api(
			"lms.lms.user.sign_up",
			email=email,
			full_name="Forged",
			verify_terms=True,
			user_category="",
			policy_revision="forged",
			is_invited=1,
		)
		self.assertEqual(response.status_code, 417)
		self.assertEqual(response.json.get("exc_type"), "ValidationError")
		frappe.db.rollback()
		self.assertFalse(frappe.db.exists("User", email))

	def test_failed_acceptance_rolls_back_user_and_does_not_authorize_other_recipient(self):
		email, name, key = self.invite()
		other = self.target()
		self.guest()
		seen = []

		def attempt_other_user(user, inserted):
			seen.append(privacy._invited_registration.get() == email)
			frappe.get_doc(
				{"doctype": "User", "email": other, "first_name": "Forbidden", "send_welcome_email": 0}
			).insert(ignore_permissions=True)

		with patch.object(UserInvitation, "_run_after_accept_hooks", side_effect=attempt_other_user):
			self.assertEqual(self.outcome(self.accept(key)), "rejected")
		self.assertEqual(seen, [True])
		frappe.db.rollback()
		for target in (email, other):
			self.assertFalse(frappe.db.exists("User", target))
			self.assertEqual(frappe.db.count("Has Role", {"parent": target}), 0)
		self.assertEqual(frappe.db.get_value("User Invitation", name, "status"), "Pending")
		self.assertIsNone(privacy._invited_registration.get())

	def race(self, keys):
		site, url, path = frappe.local.site, self.site_url, self.method(ACCEPT)
		barrier = threading.Barrier(2)
		from frappe.utils.synchronization import filelock

		@contextmanager
		def synchronized_lock(name, **kwargs):
			self.assertEqual(name, "lms-accept-invitation")
			barrier.wait(timeout=10)
			with filelock(name, **kwargs):
				yield

		def request(key):
			client = get_test_client(use_cookies=False)
			return make_request(
				client.get,
				args=(path,),
				kwargs={
					"query_string": {"key": key},
					"base_url": url,
					"environ_overrides": {"REMOTE_ADDR": self.request_ip},
				},
				site=site,
			)

		with (
			patch("frappe.utils.synchronization.filelock", synchronized_lock),
			ThreadPoolExecutor(max_workers=2) as pool,
		):
			return list(pool.map(request, keys, timeout=30))

	def test_two_acceptances_of_one_token_create_exactly_one_user(self):
		email, name, key = self.invite()
		self.guest()
		responses = self.race([key, key])
		self.assertEqual(
			Counter(self.outcome(row) for row in responses), {"password_required": 1, "rejected": 1}
		)
		self.assert_created_once(email, name)

	def test_two_recipients_concurrently_keep_separate_capabilities(self):
		rows = [self.invite(), self.invite()]
		self.guest()
		seen = []
		original = privacy.validate_public_user

		def observe(doc, method=None):
			if frappe.session.user == "Guest":
				seen.append((doc.email, privacy._invited_registration.get()))
			return original(doc, method)

		with patch.object(privacy, "validate_public_user", side_effect=observe):
			responses = self.race([row[2] for row in rows])
		self.assertEqual([self.outcome(row) for row in responses], ["password_required", "password_required"])
		self.assertEqual({email for email, _ in seen}, {row[0] for row in rows})
		self.assertTrue(all(email == context for email, context in seen))
		for email, name, _ in rows:
			self.assert_created_once(email, name)

	def test_native_lock_wait_timeout_has_no_partial_user_and_explicit_retry_succeeds(self):
		email, name, key = self.invite()
		self.guest()
		code = """import sys,frappe
from frappe.utils.synchronization import filelock
frappe.init(site=sys.argv[1])
with filelock('lms-accept-invitation',timeout=2):
 print('locked',flush=True)
 sys.stdin.readline()
"""
		child = subprocess.Popen(
			[sys.executable, "-c", code, frappe.local.site],
			stdin=subprocess.PIPE,
			stdout=subprocess.PIPE,
			stderr=subprocess.PIPE,
			text=True,
		)
		try:
			self.assertTrue(
				select.select([child.stdout], [], [], 10)[0], "Separate native lock worker must become ready"
			)
			self.assertEqual(child.stdout.readline().strip(), "locked")
			response = self.accept(key)
			location = urlparse(response.headers.get("Location", ""))
			self.assertEqual(response.status_code, 302)
			self.assertEqual(parse_qs(location.query), {"invitation-busy": ["1"]})
			self.assertNotIn("invitation-expired", location.query)
			frappe.db.rollback()
			self.assertFalse(frappe.db.exists("User", email))
			self.assertEqual(frappe.db.count("Has Role", {"parent": email}), 0)
			self.assertEqual(frappe.db.get_value("User Invitation", name, "status"), "Pending")
			self.assertIsNone(privacy._invited_registration.get())
		finally:
			child.communicate("release\n", timeout=5)
		self.assertEqual(child.returncode, 0)
		self.assertEqual(self.outcome(self.accept(key)), "password_required")
		self.assert_created_once(email, name)

	def test_callback_error_rolls_back_and_releases_for_another_valid_recipient(self):
		email, name, key = self.invite()
		other = self.invite()
		self.guest()
		with patch.object(
			UserInvitation,
			"_run_after_accept_hooks",
			side_effect=RuntimeError("Synthetic invitation callback failed"),
		):
			response = self.accept(key)
		self.assertEqual(response.status_code, 500)
		self.assertEqual(response.json.get("exc_type"), "RuntimeError")
		frappe.db.rollback()
		self.assertFalse(frappe.db.exists("User", email))
		self.assertEqual(frappe.db.count("Has Role", {"parent": email}), 0)
		self.assertEqual(frappe.db.get_value("User Invitation", name, "status"), "Pending")
		self.assertIsNone(privacy._invited_registration.get())
		self.assertEqual(self.outcome(self.accept(other[2])), "password_required")
		self.assert_created_once(other[0], other[1])
