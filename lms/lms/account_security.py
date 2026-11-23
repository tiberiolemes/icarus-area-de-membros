"""Product policy around native password, session and OTP mechanisms.

Never log credentials, reset links, OTP secrets, recovery codes or device tokens.
"""

import hashlib
import json
import re
import secrets
import time

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit

PASSWORD_MINIMUM = 8
PASSWORD_MAXIMUM = 128
STUDENT_IDLE = 7200
ADMIN_IDLE = 1800
TRUST_SECONDS = 7 * 24 * 60 * 60
DEVICE_COOKIE = "lms_trusted_device"
ADMIN_ROLES = {"System Manager", "Moderator", "LMS Moderator", "Course Creator", "Batch Evaluator"}


def private_record_permission(doc=None, ptype=None, user=None, debug=False):
	"""Only the explicit self-service helpers access this internal credential state."""
	return False


def private_record_query(user=None, doctype=None):
	return "1=0"


def temporary_password():
	"""An internal, never displayed password for the native welcome-link flow."""
	return "Aa9!" + secrets.token_urlsafe(24)


def password_criteria(password):
	return {
		"length": PASSWORD_MINIMUM <= len(password) <= PASSWORD_MAXIMUM,
		"upper": bool(re.search(r"[A-Z]", password)),
		"lower": bool(re.search(r"[a-z]", password)),
		"number": bool(re.search(r"[0-9]", password)),
		"symbol": bool(re.search(r"[^A-Za-z0-9\s]", password)),
	}


def _range(prefix):
	import requests

	try:
		response = requests.get(
			"https://api.pwnedpasswords.com/range/" + prefix,
			headers={"Add-Padding": "true", "User-Agent": "LMS-password-check"},
			timeout=(2, 3),
			allow_redirects=False,
			stream=True,
		)
		with response:
			if response.status_code != 200:
				return None
			data = bytearray()
			for chunk in response.iter_content(16384):
				data.extend(chunk)
				if len(data) > 256 * 1024:
					return None
			return data.decode("ascii")
	except (requests.RequestException, UnicodeError):
		return None


def breach_status(password):
	# SHA-1 is solely the public range lookup protocol, never credential storage.
	digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
	data = _range(digest[:5])
	if data is None:
		return "unavailable"
	rows = [line.split(":") for line in data.splitlines()]
	if not rows or any(
		len(row) != 2 or not re.fullmatch(r"[A-F0-9]{35}", row[0]) or not row[1].isdigit() for row in rows
	):
		return "unavailable"
	return (
		"compromised" if any(suffix == digest[5:] and int(count) > 0 for suffix, count in rows) else "clear"
	)


def validate_password(password):
	if not isinstance(password, str) or not all(password_criteria(password).values()):
		frappe.throw(_("Use 8 to 128 characters with uppercase, lowercase, number and symbol."))
	from frappe.core.doctype.user.user import test_password_strength

	result = test_password_strength(password)
	feedback = (result or {}).get("feedback", {})
	if feedback and not feedback.get("password_policy_validation_passed"):
		frappe.throw(_("Choose a stronger password. Avoid names and common phrases."))
	status = breach_status(password)
	if status == "compromised":
		frappe.throw(_("This password appeared in a public breach. Choose another password."))
	return status


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=60)
def password_policy() -> dict:
	return {
		"minimum": PASSWORD_MINIMUM,
		"maximum": PASSWORD_MAXIMUM,
		"criteria": ["length", "upper", "lower", "number", "symbol"],
		"minimum_score": int(frappe.get_system_settings("minimum_password_score") or 0),
		"score_enabled": bool(frappe.get_system_settings("enable_password_policy")),
	}


def idle_limit(user):
	from frappe.permissions import get_roles

	# Session resumption checks this before local.session.user is populated.
	if user == "Administrator" or ADMIN_ROLES.intersection(get_roles(user)):
		return ADMIN_IDLE
	if frappe.get_cached_value("User", user, "user_type") == "System User":
		return ADMIN_IDLE
	if frappe.db.exists("Course Instructor", {"instructor": user}):
		return ADMIN_IDLE
	return STUDENT_IDLE


def _activity_key(sid):
	from frappe.sessions import hash_sid

	return "lms:human-activity:" + hash_sid(sid)


def _creation_epoch(created):
	from zoneinfo import ZoneInfo

	from frappe.utils import get_datetime, get_system_timezone

	return get_datetime(created).replace(tzinfo=ZoneInfo(get_system_timezone())).timestamp()


def session_expired(data, sid, now=None):
	if not data or data.get("user") in (None, "Guest"):
		return False
	if not frappe.get_cached_value("User", data["user"], "enabled"):
		return True
	now = time.time() if now is None else now
	last = frappe.cache.get_value(_activity_key(sid), use_local_cache=False)
	if last is None:
		last = data.get("human_last_active")
	if last is None:
		# Existing sessions inherit creation, never polling's last_updated.
		created = data.get("creation")
		if not created:
			return True
		last = _creation_epoch(created)
	return now - float(last) >= idle_limit(data["user"])


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=120, seconds=60, user_based=True)
def session_status(active: bool = False) -> dict:
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Your session expired. Sign in again to continue."), frappe.AuthenticationError)
	obj = frappe.local.session_obj
	data = obj.data.data
	now = time.time()
	if session_expired(data, obj.sid, now):
		frappe.local.login_manager.logout()
		frappe.throw(_("Your session expired. Sign in again to continue."), frappe.AuthenticationError)
	if active:
		frappe.cache.set_value(_activity_key(obj.sid), now, expires_in_sec=STUDENT_IDLE + 60)
		data.human_last_active = now
		obj.update(force=True)
	last = frappe.cache.get_value(_activity_key(obj.sid), use_local_cache=False)
	if last is None:
		last = data.get("human_last_active") or _creation_epoch(data.creation)
	return {
		"user": user,
		"remaining": max(0, idle_limit(user) - (now - float(last))),
		"idle_seconds": idle_limit(user),
		"warning_seconds": 60,
	}


def _security(user, lock=False):
	# Installation can import auth before DocType synchronization has run.
	if not frappe.db.table_exists("LMS Account Security"):
		return None
	if frappe.db.exists("LMS Account Security", user):
		# Native FOR UPDATE loads current values even after an earlier snapshot read.
		return frappe.get_doc("LMS Account Security", user, for_update=lock)
	return None


def _require_actor():
	if frappe.session.user == "Guest":
		frappe.throw(_("Sign in to manage account security."), frappe.AuthenticationError)
	return frappe.session.user


def _password_proof(password):
	from frappe.auth import MAX_PASSWORD_SIZE, get_login_attempt_tracker
	from frappe.utils.password import check_password

	user = _require_actor()
	if not isinstance(password, str) or not password or len(password) > MAX_PASSWORD_SIZE:
		frappe.throw(_("Enter your current password."), frappe.AuthenticationError)
	tracker = get_login_attempt_tracker(user)
	try:
		check_password(user, password, delete_tracker_cache=False)
	except frappe.AuthenticationError:
		tracker.add_failure_attempt()
		raise
	tracker.add_success_attempt()
	return user


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=10, seconds=60, user_based=True)
def two_factor_status() -> dict:
	user = _require_actor()
	doc = _security(user)
	from frappe.twofactor import two_factor_is_enabled

	return {
		"enabled": bool(doc and doc.enabled),
		"required_by_site": bool(two_factor_is_enabled(user)),
		"trust_days": 7,
		"recovery_remaining": len(json.loads(doc.recovery_codes or "[]")) if doc else 0,
	}


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=5, seconds=60, user_based=True)
def begin_two_factor(password: str) -> dict:
	import pyotp

	user = _password_proof(password)
	frappe.local.response_headers["Cache-Control"] = "no-store"
	if (doc := _security(user)) and doc.enabled:
		frappe.throw(_("Two-step verification is already enabled."))
	secret = pyotp.random_base32()
	frappe.cache.set_value("lms:otp-setup:" + user, secret, expires_in_sec=600)
	from frappe.email.email_body import get_brand_name

	return {
		"secret": secret,
		"uri": pyotp.TOTP(secret).provisioning_uri(user, issuer_name=get_brand_name()),
		"expires_in": 600,
	}


def _hash(value):
	return hashlib.sha256(value.encode()).hexdigest()


def _recovery_codes(doc):
	codes = [secrets.token_hex(10) for _ in range(10)]
	doc.recovery_codes = json.dumps([_hash(code) for code in codes])
	return codes


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=5, seconds=60, user_based=True)
def enable_two_factor(otp: str) -> dict:
	import pyotp
	from frappe.twofactor import set_default
	from frappe.utils.password import encrypt

	user = _require_actor()
	frappe.local.response_headers["Cache-Control"] = "no-store"
	secret = frappe.cache.get_value("lms:otp-setup:" + user, use_local_cache=False)
	if (
		not secret
		or not isinstance(otp, str)
		or not re.fullmatch(r"[0-9]{6}", otp)
		or not pyotp.TOTP(secret).verify(otp)
	):
		frappe.throw(_("The verification code is invalid or setup expired. Start again."))
	doc = _security(user, lock=True)
	if doc and doc.enabled:
		frappe.throw(_("Two-step verification is already enabled."))
	if not doc:
		doc = frappe.new_doc("LMS Account Security")
		doc.user = doc.name = user
	doc.enabled = 1
	doc.trusted_devices = "[]"
	doc.last_totp_step = int(time.time()) // 30
	codes = _recovery_codes(doc)
	doc.save(ignore_permissions=True)
	set_default(user + "_otpsecret", encrypt(secret))
	set_default(user + "_otplogin", 1)
	frappe.cache.delete_value("lms:otp-setup:" + user)
	return {"enabled": True, "recovery_codes": codes}


def _verify_factor(doc, otp):
	import pyotp
	from frappe.twofactor import get_otpsecret_for_

	if not isinstance(otp, str) or len(otp) > 64:
		return False
	otp = otp.strip().lower()
	if not re.fullmatch(r"(?:[0-9]{6}|[a-f0-9]{20})", otp):
		return False
	digest = _hash(otp)
	codes = json.loads(doc.recovery_codes or "[]")
	for index, code in enumerate(codes):
		if secrets.compare_digest(code, digest):
			codes.pop(index)
			doc.recovery_codes = json.dumps(codes)
			doc.trusted_devices = "[]"
			doc.save(ignore_permissions=True)
			return True
	step = int(time.time()) // 30
	if step > int(doc.last_totp_step or 0) and pyotp.TOTP(get_otpsecret_for_(doc.user)).verify(otp):
		doc.last_totp_step = step
		doc.save(ignore_permissions=True)
		return True
	return False


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=5, seconds=60, user_based=True)
def disable_two_factor(password: str, otp: str) -> dict:
	user = _password_proof(password)
	from frappe.twofactor import two_factor_is_enabled

	if two_factor_is_enabled(user):
		frappe.throw(_("Your site requires two-step verification. Contact your administrator."))
	doc = _security(user, lock=True)
	if not doc or not doc.enabled or not _verify_factor(doc, otp):
		frappe.throw(_("Incorrect verification or recovery code."), frappe.AuthenticationError)
	doc.enabled = 0
	doc.recovery_codes = doc.trusted_devices = "[]"
	doc.save(ignore_permissions=True)
	frappe.cache.delete_value("lms:otp-setup:" + user)
	frappe.local.cookie_manager.delete_cookie(DEVICE_COOKIE)
	return {"enabled": False}


def _trusted(doc):
	token = frappe.request.cookies.get(DEVICE_COOKIE)
	if not token or len(token) > 128:
		return False
	digest = _hash(token)
	return any(
		secrets.compare_digest(item["hash"], digest) and item["expires"] > time.time()
		for item in json.loads(doc.trusted_devices or "[]")
	)


def should_require_factor(user):
	doc = _security(user)
	return bool(doc and doc.enabled and not _trusted(doc))


def confirm_native_factor(login_manager, otp=None, tmp_id=None):
	"""Called by the versioned native overlay only for enrolled accounts."""
	from frappe.auth import get_login_attempt_tracker

	doc = _security(login_manager.user, lock=True)
	if not doc or not doc.enabled:
		return None  # Keep the site's native role-based OTP flow.
	if _trusted(doc):
		return True
	otp = otp or frappe.form_dict.get("otp")
	tmp_id = tmp_id or frappe.form_dict.get("tmp_id")
	if not otp:
		return False
	if not tmp_id or frappe.cache.get_value(tmp_id + "_usr", use_local_cache=False) != login_manager.user:
		frappe.throw(_("Login session expired. Sign in again."), frappe.AuthenticationError)
	tracker = get_login_attempt_tracker(login_manager.user)
	if not _verify_factor(doc, otp):
		tracker.add_failure_attempt()
		login_manager.fail(_("Incorrect verification or recovery code."), login_manager.user)
	clear_native_challenge(tmp_id)
	if frappe.form_dict.get("trust_device") in (True, 1, "1"):
		token = secrets.token_urlsafe(32)
		devices = [item for item in json.loads(doc.trusted_devices or "[]") if item["expires"] > time.time()][
			-9:
		]
		devices.append({"hash": _hash(token), "expires": time.time() + TRUST_SECONDS})
		doc.trusted_devices = json.dumps(devices)
		doc.save(ignore_permissions=True)
		from datetime import datetime, timedelta, timezone

		frappe.local.cookie_manager.set_cookie(
			DEVICE_COOKIE,
			token,
			expires=datetime.now(timezone.utc) + timedelta(days=7),
			httponly=True,
			samesite="Lax",
			secure=frappe.request.scheme == "https",
		)
	tracker.add_success_attempt()
	return True


def revoke_trusted_devices(user):
	doc = _security(user, lock=True)
	if doc:
		doc.trusted_devices = "[]"
		doc.save(ignore_permissions=True)


def validate_new_credential(user, password):
	status = validate_password(password)
	from frappe.utils.password import passlibctx

	rows = frappe.db.sql(
		"select password from `__Auth` where doctype='User' and name=%s and fieldname='password' and encrypted=0",
		user,
	)
	if rows and passlibctx.verify(password, rows[0][0]):
		frappe.throw(_("New password cannot be same as old password"))
	if status == "unavailable":
		frappe.msgprint(
			_("Breach checking is unavailable. Your password still meets the local policy."), alert=True
		)
	revoke_trusted_devices(user)


def session_created(login_manager=None):
	if frappe.session.user == "Guest":
		return
	obj = frappe.local.session_obj
	now = time.time()
	frappe.cache.set_value(_activity_key(obj.sid), now, expires_in_sec=STUDENT_IDLE + 60)
	obj.data.data.human_last_active = now
	obj.update(force=True)


def user_security_changed(doc, method=None):
	if not doc.enabled and doc.has_value_changed("enabled"):
		revoke_trusted_devices(doc.name)


def login_failure_hint():
	from frappe.auth import get_login_attempt_tracker

	if frappe.form_dict.get("otp"):
		return {}
	limit = int(frappe.get_system_settings("allow_consecutive_login_attempts") or 0)
	if not limit:
		return {}
	tracker = get_login_attempt_tracker(frappe.local.request_ip, raise_locked_exception=False)
	return {
		"remaining_attempts": max(0, limit - int(tracker.login_failed_count or 0)),
		"retry_after": int(frappe.get_system_settings("allow_login_after_fail") or 60),
	}


def resume_native_challenge(user, tmp_id):
	"""The random pending challenge proves the already verified first factor for 180s.

	It never stores or replays the user's plaintext password. A changed/disabled
	account must restart primary authentication.
	"""
	from frappe.auth import get_login_attempt_tracker

	if not tmp_id or not user:
		return False
	version = frappe.cache.get_value(tmp_id + "_auth_version", use_local_cache=False)
	current = frappe.db.get_value("User", user, ["enabled", "modified"], as_dict=True)
	if not current or not current.enabled or not version or version != str(current.modified):
		return False
	if frappe.cache.get_value(tmp_id + "_usr", use_local_cache=False) != user:
		return False
	get_login_attempt_tracker(user)
	return True


def clear_native_challenge(tmp_id):
	if tmp_id:
		for suffix in ("_usr", "_pwd", "_otp_secret", "_token", "_auth_version"):
			frappe.cache.delete_value(tmp_id + suffix)
