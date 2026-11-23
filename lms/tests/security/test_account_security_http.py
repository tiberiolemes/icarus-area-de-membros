"""Native WSGI/DB acceptance tests, restricted to a muted, isolated test_* site.

Run only after the auth overlay, schema patch and hook fragments are integrated.
No browser, SMTP, real credential or external breach query is used.
"""

import json
import secrets
import time
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import frappe
import pyotp
from frappe.sessions import clear_sessions
from frappe.tests.test_api import FrappeAPITestCase
from frappe.utils import get_test_client
from frappe.utils.password import passlibctx, update_password

from lms.lms import account_security as security


class TestAccountSecurityHTTP(FrappeAPITestCase):
	def setUp(self):
		super().setUp()
		if not frappe.local.site.startswith("test_") or not frappe.conf.mute_emails:
			raise unittest.SkipTest("Requires an isolated test_* site with mute_emails enabled")
		self.previous_actor = frappe.session.user
		frappe.set_user("Administrator")
		self.email = "auth04-" + secrets.token_hex(8) + "@example.test"
		self.password = "Aa9!" + secrets.token_urlsafe(24)
		self.request_ip = "127." + ".".join(str(value) for value in secrets.token_bytes(3))
		self.remote = patch.object(security, "_range", return_value=None)
		self.remote.start()
		self.mail = patch.object(frappe, "sendmail")
		self.captured = self.mail.start()
		self.TEST_CLIENT = get_test_client()
		frappe.get_doc(
			{
				"doctype": "User",
				"email": self.email,
				"first_name": "Auth04",
				"last_name": "Sandbox",
				"user_type": "Website User",
				"send_welcome_email": 0,
			}
		).insert(ignore_permissions=True)
		update_password(self.email, self.password)
		frappe.db.commit()

	def tearDown(self):
		if hasattr(self, "email"):
			frappe.db.rollback()
			frappe.set_user("Administrator")
			clear_sessions(user=self.email, force=True)
			if frappe.db.exists("LMS Account Security", self.email):
				frappe.delete_doc("LMS Account Security", self.email, force=True)
			if frappe.db.exists("User", self.email):
				frappe.delete_doc("User", self.email, force=True)
			frappe.db.delete(
				"DefaultValue",
				{"parent": "__2fa", "defkey": ["in", [self.email + "_otpsecret", self.email + "_otplogin"]]},
			)
			frappe.db.commit()
			self.mail.stop()
			self.remote.stop()
			frappe.set_user(self.previous_actor)
		super().tearDown()

	def api(self, method, **data):
		return self.post(self.method(method), data, environ_overrides={"REMOTE_ADDR": self.request_ip})

	def login(self, password=None):
		return self.api("login", usr=self.email, pwd=password or self.password)

	def test_http_legacy_login_rehash_and_password_policy_bypass(self):
		legacy = passlibctx.handler("pbkdf2_sha256").hash("short-legacy")
		frappe.db.sql(
			"update `__Auth` set password=%s where doctype='User' and name=%s and encrypted=0",
			(legacy, self.email),
		)
		frappe.db.commit()
		self.assertEqual(self.login("short-legacy").status_code, 200)
		frappe.db.commit()
		stored = frappe.db.sql(
			"select password from `__Auth` where doctype='User' and name=%s and encrypted=0", self.email
		)[0][0]
		self.assertTrue(stored.startswith("$argon2id$"))
		response = self.api(
			"frappe.core.doctype.user.user.update_password",
			old_password="short-legacy",
			new_password="battery-expansive-hills-unrelated-nine",
		)
		self.assertGreaterEqual(response.status_code, 400)

	def test_http_reset_generic_hashed_single_use_and_login_destination(self):
		existing = self.api("frappe.core.doctype.user.user.reset_password", user=self.email)
		self.assertEqual(existing.status_code, 200)
		missing = self.api("frappe.core.doctype.user.user.reset_password", user="auth04-missing@example.test")
		self.assertEqual(existing.status_code, missing.status_code)

		def messages(response):
			rows = [json.loads(row) for row in json.loads(response.json.get("_server_messages") or "[]")]
			for row in rows:
				row.pop("__frappe_exc_id", None)  # Native correlation IDs are random per response.
			return rows

		self.assertEqual(messages(existing), messages(missing))
		self.assertEqual(self.captured.call_count, 1)
		key = parse_qs(urlparse(self.captured.call_args.kwargs["args"]["link"]).query)["key"][0]
		frappe.db.commit()
		stored = frappe.db.get_value("User", self.email, "reset_password_key")
		self.assertTrue(stored == security._hash(key) and stored != key)
		changed = "Aa9!" + secrets.token_urlsafe(24)
		response = self.api("frappe.core.doctype.user.user.update_password", key=key, new_password=changed)
		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.json.get("message") == "/login?password-updated=1")
		self.assertFalse(
			self.TEST_CLIENT.get_cookie("sid") and self.TEST_CLIENT.get_cookie("sid").value != "Guest"
		)
		self.assertEqual(
			self.api(
				"frappe.core.doctype.user.user.update_password",
				key=key,
				new_password="Aa9!" + secrets.token_urlsafe(24),
			).status_code,
			410,
		)
		self.assertEqual(self.login(changed).status_code, 200)
		frappe.db.rollback()  # Read the HTTP thread's committed credential in a new snapshot.
		before = frappe.db.sql(
			"select password from `__Auth` where doctype='User' and name=%s and encrypted=0", self.email
		)[0][0]
		self.assertGreaterEqual(
			self.api(
				"frappe.core.doctype.user.user.update_password", old_password=changed, new_password=changed
			).status_code,
			400,
		)
		frappe.db.rollback()
		self.assertEqual(
			frappe.db.sql(
				"select password from `__Auth` where doctype='User' and name=%s and encrypted=0", self.email
			)[0][0],
			before,
		)
		self.assertEqual(self.login(changed).status_code, 200)

	def test_http_idle_polling_cannot_extend_or_reactivate_and_logout_sid_is_revoked(self):
		self.assertEqual(self.login().status_code, 200)
		sid = self.TEST_CLIENT.get_cookie("sid").value
		self.assertEqual(
			self.api("lms.lms.account_security.session_status").json["message"]["idle_seconds"], 7200
		)
		frappe.cache.set_value(security._activity_key(sid), time.time() - 7201, expires_in_sec=7200)
		self.assertIn(
			self.api("lms.lms.account_security.session_status", active=True).status_code, (401, 403)
		)
		self.assertEqual(self.login().status_code, 200)
		old_sid = self.TEST_CLIENT.get_cookie("sid").value
		self.assertEqual(self.api("logout").status_code, 200)
		self.TEST_CLIENT.set_cookie("sid", old_sid, domain=urlparse(self.site_url).hostname)
		self.assertIn(self.api("lms.lms.account_security.session_status").status_code, (401, 403))

	def test_http_factor_enforcement_recovery_trust_expiry_and_disable(self):
		self.assertEqual(self.login().status_code, 200)
		setup = self.api("lms.lms.account_security.begin_two_factor", password=self.password)
		self.assertEqual(setup.status_code, 200)
		enabled = self.api(
			"lms.lms.account_security.enable_two_factor",
			otp=pyotp.TOTP(setup.json["message"]["secret"]).now(),
		)
		self.assertEqual(enabled.status_code, 200)
		codes = enabled.json["message"]["recovery_codes"]
		self.api("logout")
		challenge = self.login()
		self.assertTrue("verification" in challenge.json and "tmp_id" in challenge.json)
		self.assertIsNone(frappe.cache.get_value(challenge.json["tmp_id"] + "_pwd", use_local_cache=False))
		verified = self.api("login", tmp_id=challenge.json["tmp_id"], otp=codes[0], trust_device=1)
		self.assertEqual(verified.status_code, 200)
		self.assertTrue(self.TEST_CLIENT.get_cookie(security.DEVICE_COOKIE).http_only)
		self.api("logout")
		self.assertFalse("verification" in self.login().json)
		frappe.db.commit()
		doc = frappe.get_doc("LMS Account Security", self.email)
		devices = json.loads(doc.trusted_devices)
		for device in devices:
			device["expires"] = time.time() - 1
		doc.trusted_devices = json.dumps(devices)
		doc.save(ignore_permissions=True)
		frappe.db.commit()
		self.api("logout")
		challenge = self.login()
		self.assertTrue("verification" in challenge.json)
		self.assertGreaterEqual(
			self.api("login", tmp_id=challenge.json["tmp_id"], otp=codes[0]).status_code, 400
		)
		self.assertEqual(self.api("login", tmp_id=challenge.json["tmp_id"], otp=codes[1]).status_code, 200)
		self.assertEqual(
			self.api(
				"lms.lms.account_security.disable_two_factor", password=self.password, otp=codes[2]
			).status_code,
			200,
		)
		self.assertFalse(self.api("lms.lms.account_security.two_factor_status").json["message"]["enabled"])

	def test_website_creator_expires_at_admin_boundary_before_session_identity_is_loaded(self):
		from frappe.realtime import get_socketio_secret

		frappe.set_user("Administrator")
		frappe.get_doc("User", self.email).add_roles("Course Creator")
		frappe.db.commit()
		with patch.object(frappe.local, "session", frappe._dict(user=None)):
			self.assertEqual(frappe.get_roles(self.email), ["Guest"])
			self.assertEqual(security.idle_limit(self.email), 1800)
		self.assertEqual(self.login().status_code, 200)
		sid = self.TEST_CLIENT.get_cookie("sid").value
		frappe.cache.set_value(security._activity_key(sid), time.time() - 1801, expires_in_sec=7260)
		response = self.get(
			self.method("frappe.realtime.get_user_info"),
			headers={"X-Frappe-Socket-Secret": get_socketio_secret()},
			environ_overrides={"REMOTE_ADDR": self.request_ip},
		)
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json["message"]["user"], "Guest")

	def test_system_manager_uses_self_service_api_without_generic_security_record_access(self):
		other = "auth04-private-" + secrets.token_hex(8) + "@example.test"
		frappe.set_user("Administrator")
		manager = frappe.get_doc("User", self.email)
		manager.user_type = "System User"
		manager.add_roles("System Manager")
		frappe.get_doc(
			{"doctype": "User", "email": other, "first_name": "Private", "send_welcome_email": 0}
		).insert(ignore_permissions=True)
		for user in (self.email, other):
			frappe.get_doc(
				{
					"doctype": "LMS Account Security",
					"user": user,
					"recovery_codes": json.dumps(["e" * 64]) if user == other else "[]",
				}
			).insert(ignore_permissions=True)
		frappe.db.commit()
		try:
			self.assertEqual(frappe.db.count("DocPerm", {"parent": "LMS Account Security"}), 0)
			self.assertEqual(self.login().status_code, 200)
			status = self.api("lms.lms.account_security.two_factor_status")
			self.assertEqual(status.status_code, 200)
			for name in (self.email, other):
				response = self.get(self.resource("LMS Account Security", name))
				self.assertEqual(response.status_code, 403)
				self.assertNotIn("e" * 64, response.get_data(as_text=True))
				self.assertEqual(
					self.put(self.resource("LMS Account Security", name), {"enabled": 1}).status_code,
					403,
				)
				self.assertEqual(self.delete(self.resource("LMS Account Security", name)).status_code, 403)
			response = self.get(self.resource("LMS Account Security"))
			self.assertEqual(response.status_code, 403)
			self.assertEqual(
				self.api("frappe.client.get_count", doctype="LMS Account Security").status_code, 403
			)
			response = self.post(
				self.resource("LMS Account Security"),
				{"user": self.email, "enabled": 1, "flags": {"ignore_permissions": True}},
			)
			self.assertEqual(response.status_code, 403)
			self.assertEqual(self.api("lms.lms.account_security.two_factor_status").status_code, 200)
			frappe.db.rollback()
			self.assertEqual(
				frappe.db.get_value("LMS Account Security", other, "recovery_codes"), json.dumps(["e" * 64])
			)
		finally:
			frappe.db.rollback()
			frappe.set_user("Administrator")
			frappe.delete_doc("LMS Account Security", other, force=True)
			frappe.delete_doc("User", other, force=True)
			frappe.db.commit()
