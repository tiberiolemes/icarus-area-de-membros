"""Boundary-isolated tests with real native Passlib/pyotp and no external traffic."""

import ast
import hashlib
import json
import secrets
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import frappe
import pyotp
from frappe.utils.password import passlibctx

from lms.lms import account_security as security


class Values(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__


class Denied(Exception):
	pass


def deny(message=None, *args, **kwargs):
	raise Denied(message or kwargs.get("msg"))


class Cache:
	def __init__(self):
		self.values = {}

	def get_value(self, key, **kwargs):
		return self.values.get(key)

	def set_value(self, key, value, **kwargs):
		self.values[key] = value

	def delete_value(self, key):
		self.values.pop(key, None)


class AuthPolicyTests(unittest.TestCase):
	@staticmethod
	def unwrapped(fn):
		while hasattr(fn, "__wrapped__"):
			fn = fn.__wrapped__
		return fn

	def setUp(self):
		self.cache = Cache()
		self.frappe = SimpleNamespace(
			cache=self.cache,
			get_roles=lambda user: ["LMS Student"],
			get_cached_value=lambda *args: "Website User",
			throw=deny,
			session=Values(user="auth04@example.test"),
			AuthenticationError=Denied,
			request=SimpleNamespace(cookies={}, scheme="http"),
			form_dict=Values(),
			db=SimpleNamespace(
				sql=Mock(return_value=[]), exists=Mock(return_value=False), table_exists=lambda name: True
			),
			msgprint=Mock(),
			get_system_settings=lambda key: 2 if key == "minimum_password_score" else True,
			local=SimpleNamespace(
				response_headers={}, cookie_manager=SimpleNamespace(set_cookie=Mock(), delete_cookie=Mock())
			),
		)
		self.patch = patch.object(security, "frappe", self.frappe)
		self.patch.start()
		self.addCleanup(self.patch.stop)
		translation = patch.object(security, "_", lambda value: value)
		translation.start()
		self.addCleanup(translation.stop)
		roles = patch("frappe.permissions.get_roles", side_effect=lambda user: self.frappe.get_roles(user))
		roles.start()
		self.addCleanup(roles.stop)

	def test_backend_rejects_each_missing_criterion_before_network(self):
		with patch.object(security, "_range") as fetch:
			for value in ("aA1!", "lowercase9!", "UPPERCASE9!", "NoDigitsHere!", "NoSymbols123", "Aa1!" * 40):
				with self.assertRaises(Denied):
					security.validate_password(value)
			fetch.assert_not_called()

	def test_native_welcome_password_generation_remains_compatible_without_exempting_validation(self):
		first = security.temporary_password()
		second = security.temporary_password()
		self.assertTrue(all(security.password_criteria(first).values()))
		self.assertTrue(first != second)

	def test_server_breach_lookup_uses_prefix_only_and_fails_honestly(self):
		value = "Public-fixture-A9!"
		digest = hashlib.sha1(value.encode()).hexdigest().upper()
		with patch.object(security, "_range", return_value=digest[5:] + ":15") as fetch:
			self.assertEqual(security.breach_status(value), "compromised")
			fetch.assert_called_once_with(digest[:5])
		for data, expected in ((None, "unavailable"), ("oops", "unavailable"), ("0" * 35 + ":0", "clear")):
			with patch.object(security, "_range", return_value=data):
				self.assertEqual(security.breach_status(value), expected)

	def test_backend_enforces_breach_strength_and_same_password_on_direct_write(self):
		from frappe.core.doctype.user import user

		with patch.object(
			user,
			"test_password_strength",
			return_value={"feedback": {"password_policy_validation_passed": True}},
		):
			with patch.object(security, "breach_status", return_value="compromised"):
				with self.assertRaises(Denied):
					security.validate_password("Public-fixture-A9!")
			with patch.object(security, "breach_status", return_value="unavailable"):
				self.assertEqual(security.validate_password("Public-fixture-A9!"), "unavailable")
		with patch.object(
			user,
			"test_password_strength",
			return_value={"feedback": {"password_policy_validation_passed": False}},
		):
			with self.assertRaises(Denied):
				security.validate_password("Public-fixture-A9!")
		self.frappe.db.sql.return_value = [(passlibctx.hash("Public-fixture-A9!"),)]
		with patch.object(security, "validate_password", return_value="clear"):
			with self.assertRaises(Denied):
				security.validate_new_credential("auth04@example.test", "Public-fixture-A9!")

	def test_native_password_writer_cannot_bypass_product_policy(self):
		from frappe.utils import password

		with patch.object(security, "_range") as remote:
			with self.assertRaises(Denied):
				password.update_password("auth04@example.test", "weak")
			remote.assert_not_called()

	def test_student_admin_polling_exact_boundary_and_actor_promoted_mid_session(self):
		data = Values(user="auth04@example.test", human_last_active=1000, last_updated="2099-01-01")
		self.assertFalse(security.session_expired(data, "synthetic-sid", now=8199))
		self.assertTrue(security.session_expired(data, "synthetic-sid", now=8200))
		self.frappe.get_roles = lambda user: ["Course Creator"]
		self.assertFalse(security.session_expired(data, "synthetic-sid", now=2799))
		self.assertTrue(security.session_expired(data, "synthetic-sid", now=2800))
		self.assertEqual(security.idle_limit("Administrator"), 1800)
		self.assertFalse(security.session_expired(Values(user="Guest"), "Guest", now=999999))

	def test_disabled_account_and_website_course_instructor_use_server_policy(self):
		self.frappe.db.exists.return_value = True
		self.assertEqual(security.idle_limit("instructor@example.test"), 1800)
		self.frappe.get_cached_value = lambda doctype, user, field: (
			False if field == "enabled" else "Website User"
		)
		self.assertTrue(
			security.session_expired(
				Values(user="disabled@example.test", human_last_active=time.time()), "synthetic-sid"
			)
		)

	def test_creation_fallback_uses_site_timezone_and_never_polling(self):
		with patch("frappe.utils.get_system_timezone", return_value="America/Sao_Paulo"):
			self.assertEqual(
				security._creation_epoch("2026-11-21 12:00:00"),
				datetime.fromisoformat("2026-11-21T15:00:00+00:00").timestamp(),
			)
			data = Values(
				user="auth04@example.test", creation="2026-11-21 12:00:00", last_updated="2099-01-01"
			)
			start = security._creation_epoch(data.creation)
			self.assertTrue(security.session_expired(data, "synthetic-sid", now=start + 7200))

	def test_expired_activity_cannot_reactivate_and_active_read_is_not_a_renewal(self):
		data = Values(user="auth04@example.test", human_last_active=time.time() - 7201)
		self.frappe.local.session_obj = SimpleNamespace(
			data=Values(data=data), sid="synthetic-sid", update=Mock()
		)
		self.frappe.local.login_manager = SimpleNamespace(logout=Mock())
		# Bypass only decorators, as the real dispatcher owns their rate counters.
		fn = security.session_status
		while hasattr(fn, "__wrapped__"):
			fn = fn.__wrapped__
		with self.assertRaises(Denied):
			fn(active=True)
		self.frappe.local.login_manager.logout.assert_called_once()
		self.assertFalse(self.cache.values)
		data.human_last_active = time.time()
		self.assertGreater(fn(active=False)["remaining"], 7190)
		self.frappe.local.session_obj.update.assert_not_called()

	def doc(self):
		return SimpleNamespace(
			user="auth04@example.test",
			enabled=1,
			recovery_codes="[]",
			trusted_devices="[]",
			last_totp_step=0,
			save=Mock(),
		)

	def test_recovery_codes_hashed_single_use_and_revoke_all_trusted_devices(self):
		doc = self.doc()
		codes = security._recovery_codes(doc)
		self.assertEqual(len(set(codes)), 10)
		self.assertTrue(all(code not in doc.recovery_codes for code in codes))
		doc.trusted_devices = json.dumps([{"hash": "old", "expires": time.time() + 60}])
		with patch("frappe.twofactor.get_otpsecret_for_", return_value=pyotp.random_base32()):
			self.assertTrue(security._verify_factor(doc, codes[0]))
			self.assertFalse(security._verify_factor(doc, codes[0]))
		self.assertEqual(len(json.loads(doc.recovery_codes)), 9)
		self.assertEqual(doc.trusted_devices, "[]")

	def test_totp_uses_native_secret_and_rejects_replay_and_bad_code(self):
		doc = self.doc()
		secret = pyotp.random_base32()
		with patch("frappe.twofactor.get_otpsecret_for_", return_value=secret):
			self.assertFalse(security._verify_factor(doc, "incorrect"))
			self.assertTrue(security._verify_factor(doc, pyotp.TOTP(secret).now()))
			self.assertFalse(security._verify_factor(doc, pyotp.TOTP(secret).now()))

	def test_trust_bound_to_account_expiry_and_no_plaintext_storage(self):
		doc = self.doc()
		token = secrets.token_urlsafe(32)
		self.frappe.request.cookies[security.DEVICE_COOKIE] = token
		doc.trusted_devices = json.dumps(
			[{"hash": security._hash(token), "expires": time.time() + security.TRUST_SECONDS}]
		)
		self.assertTrue(security._trusted(doc))
		self.assertNotIn(token, doc.trusted_devices)
		with patch.object(security.time, "time", return_value=time.time() + security.TRUST_SECONDS + 1):
			self.assertFalse(security._trusted(doc))
		self.assertFalse(security._trusted(self.doc()))

	def test_native_factor_requires_bound_challenge_consumes_it_and_sets_7day_cookie(self):
		doc = self.doc()
		codes = security._recovery_codes(doc)
		manager = SimpleNamespace(user=doc.user, fail=deny)
		tracker = SimpleNamespace(add_failure_attempt=Mock(), add_success_attempt=Mock())
		self.frappe.form_dict.trust_device = 1
		with (
			patch.object(security, "_security", return_value=doc),
			patch("frappe.auth.get_login_attempt_tracker", return_value=tracker),
			patch("frappe.twofactor.get_otpsecret_for_", return_value=pyotp.random_base32()),
		):
			self.assertFalse(security.confirm_native_factor(manager))
			with self.assertRaises(Denied):
				security.confirm_native_factor(manager, codes[0], "wrong")
			self.cache.set_value("challenge_usr", doc.user)
			self.cache.set_value("challenge_pwd", "synthetic password")
			self.assertTrue(security.confirm_native_factor(manager, codes[0], "challenge"))
			self.assertNotIn("challenge_pwd", self.cache.values)
			cookie = self.frappe.local.cookie_manager.set_cookie.call_args
			self.assertTrue(cookie.kwargs["httponly"])
			self.assertAlmostEqual((cookie.kwargs["expires"].timestamp() - time.time()) / 86400, 7, places=3)

	def test_enable_requires_password_then_valid_otp_and_disable_requires_a_fresh_factor(self):
		user = self.frappe.session.user
		doc = self.doc()
		doc.enabled = 0
		with (
			patch.object(security, "_password_proof", return_value=user),
			patch.object(security, "_security", return_value=doc),
			patch("frappe.email.email_body.get_brand_name", return_value="Sandbox brand"),
			patch("frappe.twofactor.set_default") as native_default,
			patch("frappe.utils.password.encrypt", return_value="native encrypted secret"),
			patch("frappe.twofactor.two_factor_is_enabled", return_value=False),
		):
			setup = self.unwrapped(security.begin_two_factor)("synthetic proof")
			with self.assertRaises(Denied):
				self.unwrapped(security.enable_two_factor)("wrong")
			self.assertEqual(doc.enabled, 0)
			result = self.unwrapped(security.enable_two_factor)(pyotp.TOTP(setup["secret"]).now())
			self.assertTrue(doc.enabled)
			self.assertEqual(len(result["recovery_codes"]), 10)
			self.assertNotIn("lms:otp-setup:" + user, self.cache.values)
			native_default.assert_any_call(user + "_otplogin", 1)
			with patch("frappe.twofactor.get_otpsecret_for_", return_value=setup["secret"]):
				with self.assertRaises(Denied):
					self.unwrapped(security.disable_two_factor)("synthetic proof", "wrong")
				self.unwrapped(security.disable_two_factor)("synthetic proof", result["recovery_codes"][0])
			self.assertFalse(doc.enabled)
			self.assertEqual(doc.recovery_codes, "[]")
			self.assertEqual(doc.trusted_devices, "[]")

	def test_enabling_really_changes_native_login_gate_and_trust_is_finite(self):
		from frappe.twofactor import should_run_2fa

		doc = self.doc()
		with patch.object(security, "_security", return_value=doc):
			self.assertTrue(should_run_2fa(doc.user))
			token = secrets.token_urlsafe(32)
			doc.trusted_devices = json.dumps([{"hash": security._hash(token), "expires": time.time() + 60}])
			self.frappe.request.cookies[security.DEVICE_COOKIE] = token
			self.assertFalse(should_run_2fa(doc.user))
			with patch.object(security.time, "time", return_value=time.time() + 61):
				self.assertTrue(should_run_2fa(doc.user))

	def test_native_rate_limit_counts_authenticated_actor_not_whole_shared_ip(self):
		import frappe.rate_limiter as limiter

		counts = {}
		redis = SimpleNamespace(
			make_key=lambda value: value.encode(),
			get=lambda key: counts.get(key),
			setex=lambda key, seconds, value: counts.update({key: value}),
			incrby=lambda key, value: counts.setdefault(key, 0) + value,
		)

		def increment(key, value):
			counts[key] = counts.get(key, 0) + value
			return counts[key]

		redis.incrby = increment
		rate_boundary = SimpleNamespace(
			cache=redis,
			request=SimpleNamespace(method="POST"),
			session=self.frappe.session,
			form_dict={},
			local=SimpleNamespace(request_ip="192.0.2.1"),
			throw=deny,
			RateLimitExceededError=Denied,
		)
		with (
			patch.object(limiter, "frappe", rate_boundary),
			patch.object(limiter, "_", lambda value: value),
			patch.object(security, "_security", return_value=None),
			patch("frappe.twofactor.two_factor_is_enabled", return_value=False),
		):
			for _ in range(10):
				security.two_factor_status()
			with self.assertRaises(Denied):
				security.two_factor_status()
			self.frappe.session.user = "different@example.test"
			self.assertFalse(security.two_factor_status()["enabled"])

	def test_pending_native_challenge_has_no_password_and_changed_disabled_used_proof_is_denied(self):
		import frappe.twofactor as native

		self.frappe.flags = Values()
		version = datetime(2026, 11, 21, 12)
		self.frappe.db.get_value = Mock(return_value=version)
		with (
			patch.object(native, "frappe", self.frappe),
			patch.object(native, "get_verification_method", return_value="OTP App"),
		):
			native.cache_2fa_data(self.frappe.session.user, 1, "synthetic native OTP secret", "challenge")
		self.assertNotIn("challenge_pwd", self.cache.values)
		self.assertEqual(self.cache.values["challenge_auth_version"], str(version))
		self.frappe.db.get_value.return_value = Values(enabled=1, modified=version)
		with patch("frappe.auth.get_login_attempt_tracker"):
			self.assertTrue(security.resume_native_challenge(self.frappe.session.user, "challenge"))
			self.frappe.db.get_value.return_value.enabled = False
			self.assertFalse(security.resume_native_challenge(self.frappe.session.user, "challenge"))
			self.frappe.db.get_value.return_value = Values(enabled=1, modified=version + timedelta(seconds=1))
			self.assertFalse(security.resume_native_challenge(self.frappe.session.user, "challenge"))
			security.clear_native_challenge("challenge")
			self.assertFalse(security.resume_native_challenge(self.frappe.session.user, "challenge"))

	def test_recovery_mutation_uses_the_current_locking_read_not_a_stale_snapshot(self):
		current = {
			"name": "auth04@example.test",
			"user": "auth04@example.test",
			"enabled": 1,
			"recovery_codes": "[]",
		}
		self.frappe.db.exists = Mock(return_value=True)
		self.frappe.get_doc = Mock(return_value=Values(current))
		self.assertEqual(security._security(current["user"], lock=True).recovery_codes, "[]")
		self.frappe.get_doc.assert_called_once_with("LMS Account Security", current["user"], for_update=True)


class NativeHashTests(unittest.TestCase):
	def test_native_logs_redact_password_otp_recovery_and_challenge(self):
		from frappe.utils.logger import sanitized_dict

		values = {
			"password": "synthetic-password",
			"otp": "synthetic-recovery",
			"tmp_id": "synthetic-challenge",
			"OTP": "synthetic-code",
			"cookie": "synthetic-cookie",
			"user": "sandbox",
		}
		clean = sanitized_dict(values)
		self.assertTrue(all(clean[key] == "********" for key in values if key != "user"))
		self.assertEqual(clean["user"], "sandbox")
		self.assertEqual(values["otp"], "synthetic-recovery")

	def test_real_argon2id_legacy_pbkdf2_and_gradual_rehash(self):
		self.assertEqual(passlibctx.default_scheme(), "argon2")
		legacy = passlibctx.handler("pbkdf2_sha256").hash("legacy-synthetic-only")
		self.assertTrue(passlibctx.verify("legacy-synthetic-only", legacy))
		self.assertTrue(passlibctx.needs_update(legacy))
		new = passlibctx.hash("new-synthetic-only")
		self.assertTrue(new.startswith("$argon2id$"))
		self.assertTrue(passlibctx.verify("new-synthetic-only", new))
		self.assertFalse(passlibctx.verify("wrong", new))
		self.assertFalse(passlibctx.needs_update(new))

	def test_native_legacy_login_uses_rehash_exception_without_applying_new_password_rules(self):
		from frappe.utils import password

		legacy = passlibctx.handler("pbkdf2_sha256").hash("short-legacy")
		query = Mock()
		query.select.return_value = query.where.return_value = query.limit.return_value = query
		query.run.return_value = [Values(name="legacy@example.test", password=legacy)]
		fake = SimpleNamespace(qb=SimpleNamespace(from_=lambda table: query), AuthenticationError=Denied)
		with patch.object(password, "frappe", fake), patch.object(password, "update_password") as rehash:
			self.assertEqual(
				password.check_password("legacy@example.test", "short-legacy", delete_tracker_cache=False),
				"legacy@example.test",
			)
			rehash.assert_called_once_with(
				"legacy@example.test", "short-legacy", "User", "password", validate_policy=False
			)


class NativeRecoveryTests(unittest.TestCase):
	def setUp(self):
		import frappe.core.doctype.user.user as native

		self.now = datetime(2026, 11, 21, 15)
		self.token = secrets.token_urlsafe(32)
		self.key_hash = hashlib.sha256(self.token.encode()).hexdigest()
		self.current_key = self.key_hash
		self.generated = self.now
		self.reply = Mock()
		self.doc = SimpleNamespace(
			name="auth04@example.test", enabled=True, validate_reset_password=Mock(), _reset_password=Mock()
		)

		def sql(query, value):
			self.assertIn("for update", query.lower())
			self.assertNotEqual(value, self.token)
			return [(self.doc.name, self.generated)] if self.current_key == value else []

		def set_value(doctype, user, field, value):
			if field == "reset_password_key":
				self.current_key = value

		def get_doc(doctype, user):
			if user != self.doc.name:
				raise Denied()
			return self.doc

		self.fake = SimpleNamespace(
			_dict=Values,
			db=SimpleNamespace(sql=sql, set_value=set_value, get_system_setting=lambda *args: None),
			get_system_settings=lambda key: 3600 if key == "reset_password_link_expiry_duration" else 1,
			throw=deny,
			AuthenticationError=Denied,
			DoesNotExistError=Denied,
			OutgoingEmailError=OSError,
			clear_messages=Mock(),
			msgprint=self.reply,
			get_doc=get_doc,
			log_error=Mock(),
			get_traceback=lambda: "sandbox trace",
			session=Values(user=self.doc.name),
			local=SimpleNamespace(
				response=Values(),
				login_manager=SimpleNamespace(check_password=Mock(), login_as=Mock(), logout=Mock()),
			),
		)
		self.env = {
			"frappe": self.fake,
			"_": lambda value: value,
			"cint": int,
			"sha256_hash": lambda value: hashlib.sha256(value.encode()).hexdigest(),
			"now_datetime": lambda: self.now,
			"timedelta": timedelta,
			"today": lambda: "2026-11-21",
			"MAX_PASSWORD_SIZE": 128,
			"test_password_strength": lambda *args: {"feedback": {"password_policy_validation_passed": True}},
			"_update_password": Mock(),
			"reset_user_data": lambda user: (self.doc, "/lms"),
		}
		tree = ast.parse(Path(native.__file__).read_text())
		for name in ("_get_user_for_update_password", "update_password", "reset_password"):
			node = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == name)
			node.decorator_list = []
			exec(compile(ast.Module(body=[node], type_ignores=[]), native.__file__, "exec"), self.env)

	def test_native_reset_hash_expiry_used_invalid_and_missing_proof(self):
		fn = self.env["_get_user_for_update_password"]
		self.assertEqual(fn(self.token, None).user, self.doc.name)
		self.generated = self.now - timedelta(seconds=3600)
		self.assertIn("expired", fn(self.token, None).message)
		self.current_key = None
		self.assertIn("used", fn(self.token, None).message)
		self.assertIn("invalid", fn("wrong", None).message)
		with self.assertRaises(Denied):
			fn(None, None)

	def test_reset_consumes_proof_revokes_sessions_and_returns_login_without_authentication(self):
		with patch("frappe.sessions.clear_sessions") as clear:
			self.assertEqual(
				self.env["update_password"]("Public-fixture-A9!", key=self.token), "/login?password-updated=1"
			)
			clear.assert_called_once_with(user=self.doc.name, force=True)
		self.fake.local.login_manager.login_as.assert_not_called()
		self.fake.local.login_manager.logout.assert_called_once()
		self.assertFalse(self.current_key)
		self.assertNotEqual(
			self.env["update_password"]("Another-fixture-A9!", key=self.token), "/login?password-updated=1"
		)
		self.assertEqual(self.fake.local.response.http_status_code, 410)

	def test_recovery_response_does_not_reveal_existing_missing_disabled_accounts(self):
		fn = self.env["reset_password"]
		fn(self.doc.name)
		first = self.reply.call_args
		fn("missing@example.test")
		self.assertEqual(self.reply.call_args, first)
		self.doc.enabled = False
		fn(self.doc.name)
		self.assertEqual(self.reply.call_args, first)
		self.doc._reset_password.assert_called_once_with(send_email=True)

	def test_native_email_can_be_captured_and_rendered_without_delivery(self):
		import frappe.core.doctype.user.user as native
		from jinja2 import Environment

		self.doc.send_login_mail = Mock()
		link = "https://example.test/update-password?key=synthetic-only"
		with (
			patch.object(native, "frappe", self.fake),
			patch.object(native, "_", lambda value: value),
			patch("frappe.email.email_body.get_brand_name", return_value="Sandbox brand"),
		):
			native.User.password_reset_mail(self.doc, link)
		args = self.doc.send_login_mail.call_args
		self.assertIn("Sandbox brand", args.args[0])
		self.assertEqual(args.kwargs["wrapper"], "templates/emails/auth_email.html")
		body = (
			Environment(autoescape=True)
			.from_string(
				(Path(native.__file__).parents[3] / "templates/emails/password_reset.html").read_text()
			)
			.render(_=lambda value: value, **args.args[2])
		)
		self.assertIn("example.test", body)
		self.assertIn("60 minutes", body)


class NativeInvitationTests(unittest.TestCase):
	def test_pending_invitation_expires_without_waiting_for_scheduler_and_cannot_be_reused(self):
		import frappe.core.doctype.user_invitation.user_invitation as native

		now = datetime(2026, 11, 21, 15)
		boundary = SimpleNamespace(
			throw=deny,
			utils=SimpleNamespace(
				get_datetime=lambda value: value, now_datetime=lambda: now, now=lambda: str(now)
			),
		)
		doc = SimpleNamespace(
			email="auth04@example.test", status="Pending", email_sent_at=now - timedelta(days=4)
		)
		with patch.object(native, "frappe", boundary), patch.object(native, "_", lambda value: value):
			with self.assertRaises(Denied):
				native.UserInvitation._accept(doc)
			doc.email_sent_at = now
			self.assertTrue(native.UserInvitation._accept(doc))
			self.assertEqual(doc.status, "Accepted")
			self.assertIsNone(doc.key)
			with self.assertRaises(Denied):
				native.UserInvitation._accept(doc)


if __name__ == "__main__":
	unittest.main(verbosity=2)
