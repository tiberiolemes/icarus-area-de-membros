import time

import frappe
from frappe import _
from frappe.model.naming import append_number_if_name_exists
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, escape_html
from frappe.website.utils import cleanup_page_name, is_signup_disabled

from lms.lms.utils import get_lms_route


def validate_username_duplicates(doc, method):
	while not doc.username or doc.username_exists():
		doc.username = append_number_if_name_exists(
			doc.doctype, cleanup_page_name(doc.full_name), fieldname="username"
		)
	if " " in doc.username:
		doc.username = doc.username.replace(" ", "")

	if len(doc.username) < 4:
		doc.username = doc.email.replace("@", "").replace(".", "")


def add_lms_student_role(doc, method):
	doc.append_roles("LMS Student")


def get_signup_limit() -> int:
	"""Website Settings' sign-ups per minute, the field frappe develop limits its
	own sign-up by; version-16 has no such field, so its sites get develop's default."""
	if not frappe.get_meta("Website Settings").has_field("max_signups_per_minute"):
		return 500
	return cint(frappe.db.get_single_value("Website Settings", "max_signups_per_minute")) or 500


# nosemgrep: frappe-semgrep-rules.rules.security.guest-whitelisted-method
@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=lambda: get_signup_limit(), seconds=60)
def sign_up(email: str, full_name: str, verify_terms: bool, user_category: str, policy_revision: str = ""):
	"""Answers the same for every address: an account's existence, and whether it
	is disabled, are not for a guest to learn. No mail goes to an existing
	address either: the sign-up limit is far looser than the reset limit."""
	from lms.lms.account_security import temporary_password
	from lms.lms.privacy import public_registration, require_public_registration

	if is_signup_disabled():
		frappe.throw(_("Sign Up is disabled"), title=_("Not Allowed"))
	revision = require_public_registration(verify_terms, policy_revision or "")

	# Before the lookup, so the cap reads the same whatever the address. A 429
	# with a JSON body is what the sign-up page knows how to show.
	max_signups_allowed_per_hour = cint(frappe.get_system_settings("max_signups_allowed_per_hour") or 300)
	users_created_past_hour = frappe.db.get_creation_count("User", 60)
	if users_created_past_hour >= max_signups_allowed_per_hour:
		frappe.throw(
			_(
				"Too many users signed up recently, so the registration is disabled. Please try back in an hour"
			),
			frappe.RateLimitExceededError,
			title=_("Temporarily Disabled"),
		)

	reply = signed_up_reply()
	if frappe.db.get("User", {"email": email}):
		return reply

	default_role = frappe.db.get_single_value("Portal Settings", "default_role")

	# Concurrent signups deadlock on User insert (Frappe doesn't retry 1213); retry, and append roles pre-insert to keep it to one transaction.
	for attempt in range(3):
		try:
			user = frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": escape_html(full_name),
					"verify_terms": verify_terms,
					"user_category": user_category,
					"country": "",
					"enabled": 1,
					"new_password": temporary_password(),
					"user_type": "Website User",
				}
			)
			user.flags.ignore_permissions = True
			user.flags.ignore_password_policy = True
			if default_role:
				user.append_roles(default_role)
			with public_registration(revision):
				user.insert()
			break
		except frappe.DuplicateEntryError:
			# A concurrent signup for the same email won the race.
			frappe.db.rollback()
			return reply
		except frappe.QueryDeadlockError:
			frappe.db.rollback()
			if attempt == 2:
				raise
			time.sleep(0.1 * (attempt + 1))

	return reply


def signed_up_reply() -> tuple[int, str]:
	"""One reply for every address, from one question: can the site send mail.
	The welcome mail asks the same, so a new user's inbox matches the answer.
	The page shows code 1 as success and code 2 as "ask your administrator"."""
	from frappe.email.doctype.email_account.email_account import EmailAccount

	if EmailAccount.find_default_outgoing():
		return 1, _("If this email can be used, you will get an email with the next step.")
	return 2, _("Signup successful. Please ask your administrator to verify your sign-up.")


def on_login(login_manager):
	default_app = frappe.db.get_single_value("System Settings", "default_app")
	if default_app == "lms":
		frappe.local.response["home_page"] = get_lms_route()
