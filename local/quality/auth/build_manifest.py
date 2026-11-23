"""Build the reviewed overlay against the already localized pinned framework.

No target files are changed. Output must be reviewed before integration.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path


def build(root):
	patches = []

	def patch(path, replacements):
		original = (root / path).read_text()
		content = original
		for old, new in replacements:
			if content.count(old) != 1:
				raise ValueError(f"Expected unique anchor in {path}: {old[:80]!r}")
			content = content.replace(old, new, 1)
		patches.append(
			{
				"path": path,
				"before_sha256": hashlib.sha256(original.encode()).hexdigest(),
				"after_sha256": hashlib.sha256(content.encode()).hexdigest(),
				"replacements": replacements,
			}
		)

	patch(
		"utils/password.py",
		[
			(
				"""		"pbkdf2_sha256",
		"argon2",
	],
""",
				"""		"argon2",
		"pbkdf2_sha256",
	],
	deprecated=["pbkdf2_sha256"],
	argon2__type="ID",
	argon2__memory_cost=65536,
	argon2__time_cost=3,
	argon2__parallelism=1,
""",
			),
			(
				"update_password(user, pwd, doctype, fieldname)\n",
				"update_password(user, pwd, doctype, fieldname, validate_policy=False)\n",
			),
			(
				'def update_password(user, pwd, doctype="User", fieldname="password", logout_all_sessions=False):',
				'def update_password(user, pwd, doctype="User", fieldname="password", logout_all_sessions=False, validate_policy=True):',
			),
			(
				"\thashPwd = passlibctx.hash(pwd)\n",
				'\tif validate_policy and doctype == "User" and fieldname == "password":\n\t\tfrom lms.lms.account_security import validate_new_credential\n\n\t\tvalidate_new_credential(user, pwd)\n\thashPwd = passlibctx.hash(pwd)\n',
			),
		],
	)
	patch(
		"utils/logger.py",
		[
			(
				'\t\t"pwd",\n\t]',
				'\t\t"pwd",\n\t\t"otp",\n\t\t"tmp_id",\n\t\t"recovery",\n\t\t"trusted_device",\n\t\t"authorization",\n\t\t"cookie",\n\t\t"csrf",\n\t\t"sid",\n\t]',
			),
			("if secret_kw in k:", "if isinstance(k, str) and secret_kw in k.lower():"),
		],
	)
	patch(
		"utils/__init__.py",
		[
			(
				'\t\t"authorization",\n\t\t"cookie",\n',
				'\t\t"authorization",\n\t\t"cookie",\n\t\t"otp",\n\t\t"tmp_id",\n\t\t"recovery",\n\t\t"codes",\n\t\t"digest",\n',
			),
		],
	)
	patch(
		"sessions.py",
		[
			(
				'\tfrappe.cache.hdel("session", sid_hash)\n',
				'\tfrappe.cache.hdel("session", sid_hash)\n\tfrappe.cache.delete_value("lms:human-activity:" + sid_hash)\n',
			),
			(
				'\t\tr = self.get_session_data()\n\n\t\tif not (r and r.get("user")):',
				'\t\tr = self.get_session_data()\n\t\tfrom lms.lms.account_security import session_expired\n\n\t\tif self.sid != "Guest" and session_expired(r, self.sid):\n\t\t\tself._delete_session()\n\t\t\tr = None\n\n\t\tif not (r and r.get("user")):',
			),
		],
	)
	patch(
		"auth.py",
		[
			(
				"\t\tuser, pwd = get_cached_user_pass()\n\t\tself.authenticate(user=user, pwd=pwd)\n",
				'\t\tuser, pwd = get_cached_user_pass()\n\t\tfrom lms.lms.account_security import resume_native_challenge\n\n\t\tif resume_native_challenge(user, frappe.form_dict.get("tmp_id")):\n\t\t\tself.user = user\n\t\telse:\n\t\t\tself.authenticate(user=user, pwd=pwd)\n',
			),
			(
				"\t\t\tif not confirm_otp_token(self):\n\t\t\t\treturn False\n",
				'\t\t\tif not confirm_otp_token(self):\n\t\t\t\treturn False\n\t\t\tfrom lms.lms.account_security import clear_native_challenge\n\n\t\t\tclear_native_challenge(frappe.form_dict.get("tmp_id"))\n',
			),
			(
				'self.fail("User disabled or missing", user=user.name)',
				'self.fail("Invalid login credentials", user=user.name)',
			),
			(
				'\t\tfrappe.local.response["message"] = _(message)\n',
				'\t\tfrappe.local.response["message"] = _(message)\n\t\tfrom lms.lms.account_security import login_failure_hint\n\n\t\tfrappe.local.response.update(login_failure_hint())\n',
			),
		],
	)
	patch(
		"core/doctype/user/user.py",
		[
			(
				"def sign_up(email: str, full_name: str, redirect_to: str) -> tuple[int, str]:\n",
				"def sign_up(email: str, full_name: str, redirect_to: str) -> tuple[int, str]:\n\tfrom lms.lms.account_security import temporary_password\n\n",
			),
			('"new_password": random_string(10),', '"new_password": temporary_password(),'),
			(
				"If this email is registered with us, we have sent password reset instructions to it. Please check your inbox.",
				"If this account can receive a reset link, check your inbox for the next step. If no email arrives, contact the site administrator.",
			),
			(
				"> last_reset_password_key_generated_on + timedelta(seconds=reset_password_link_expiry)",
				">= last_reset_password_key_generated_on + timedelta(seconds=reset_password_link_expiry)",
			),
			(
				'@frappe.whitelist(allow_guest=True, methods=["POST"])\ndef update_password(',
				'@frappe.whitelist(allow_guest=True, methods=["POST"])\n@rate_limit(limit=10, seconds=60)\ndef update_password(',
			),
			(
				"""	if key and should_run_2fa(user):
		return "/login"

	# get redirect url from cache
	redirect_to = frappe.cache.hget("redirect_after_login", user)
	if redirect_to:
		redirect_url = redirect_to
		frappe.cache.hdel("redirect_after_login", user)

	frappe.local.login_manager.login_as(user)

	if user_doc.user_type == "System User":
		return get_default_path() or "/desk"
	else:
		return redirect_url or get_default_path() or get_home_page()
""",
				"""	if key:
		from frappe.sessions import clear_sessions

		clear_sessions(user=user, force=True)
		if frappe.session.user != "Guest":
			frappe.local.login_manager.logout()
	return "/login?password-updated=1"
""",
			),
			(
				"@frappe.whitelist(allow_guest=True)\ndef test_password_strength(",
				'@frappe.whitelist(allow_guest=True, methods=["POST"])\n@rate_limit(limit=60, seconds=60)\ndef test_password_strength(',
			),
			(
				"\t\tif not users:\n\t\t\treturn\n",
				"\t\tif not users:\n\t\t\tif validate_password:\n\t\t\t\tfrom frappe.utils.password import passlibctx\n\n\t\t\t\tpasslibctx.dummy_verify()\n\t\t\treturn\n",
			),
			(
				"""		user = frappe.db.get_value(
			"User", {"reset_password_key": hashed_key}, ["name", "last_reset_password_key_generated_on"]
		)
""",
				"""		# The locking read itself must return the proof, not a repeatable-read snapshot.
		rows = frappe.db.sql("select name, last_reset_password_key_generated_on from `tabUser` where reset_password_key=%s for update", hashed_key)
		user = rows[0] if rows else None
""",
			),
			(
				"\t\tresult.user = user\n\treturn result\n",
				'\t\tresult.user = user\n\telse:\n\t\tfrappe.throw(_("A current password or valid reset link is required."), frappe.AuthenticationError)\n\treturn result\n',
			),
			(
				"\tdef password_reset_mail(self, link):\n",
				"\tdef password_reset_mail(self, link):\n\t\tfrom frappe.email.email_body import get_brand_name\n",
			),
			(
				'\t\t\t_("Password Reset"),\n\t\t\t"password_reset",',
				'\t\t\t_("Reset your password - {0}").format(get_brand_name()),\n\t\t\t"password_reset",',
			),
		],
	)
	patch(
		"twofactor.py",
		[
			(
				'tmp_id = frappe.form_dict.get("tmp_id")\n\tif tmp_id:',
				'tmp_id = frappe.form_dict.get("tmp_id")\n\tif isinstance(tmp_id, str) and 0 < len(tmp_id) <= 64:',
			),
			(
				'def should_run_2fa(user):\n\t"""Check if 2fa should run."""\n',
				'def should_run_2fa(user):\n\t"""Check if 2fa should run."""\n\tfrom lms.lms.account_security import _security, should_require_factor\n\n\tif (security := _security(user)) and security.enabled:\n\t\treturn should_require_factor(user)\n',
			),
			("tmp_id = frappe.generate_hash(length=8)", "tmp_id = frappe.generate_hash(length=32)"),
			(
				'\tpwd = frappe.form_dict.get("pwd")\n\tverification_method = get_verification_method()',
				"\tverification_method = get_verification_method()",
			),
			(
				'for k, v in {"_usr": user, "_pwd": pwd, "_otp_secret": otp_secret}.items():',
				'for k, v in {"_usr": user, "_otp_secret": otp_secret, "_auth_version": str(frappe.db.get_value("User", user, "modified"))}.items():',
			),
			(
				"\tfrom frappe.auth import get_login_attempt_tracker\n\n\tif not otp:",
				"\tfrom frappe.auth import get_login_attempt_tracker\n\tfrom lms.lms.account_security import confirm_native_factor\n\n\tresult = confirm_native_factor(login_manager, otp, tmp_id)\n\tif result is not None:\n\t\treturn result\n\tif not otp:",
			),
			(
				"def get_verification_obj(user, token, otp_secret):\n",
				'def get_verification_obj(user, token, otp_secret):\n\tfrom lms.lms.account_security import _security\n\n\tif (security := _security(user)) and security.enabled:\n\t\treturn {"method": "OTP App", "setup": True}\n',
			),
			(
				'\tsettings = frappe.get_cached_doc("System Settings")\n\n\tif not settings.enable_two_factor_auth:',
				'\tfrom lms.lms.account_security import _security\n\n\tif (security := _security(user)) and security.enabled:\n\t\tfrappe.throw(_("Manage your authenticator from account security using your password and a verification or recovery code."))\n\tsettings = frappe.get_cached_doc("System Settings")\n\n\tif not settings.enable_two_factor_auth:',
			),
		],
	)
	patch(
		"core/api/user_invitation.py",
		[
			(
				"\t_accept_invitation(key, False)\n",
				'\ttry:\n\t\t_accept_invitation(key, False)\n\texcept (frappe.ValidationError, frappe.DoesNotExistError):\n\t\tfrappe.db.rollback()\n\t\tfrappe.clear_messages()\n\t\tfrappe.local.response["type"] = "redirect"\n\t\tfrappe.local.response["location"] = "/login?invitation-expired=1#forgot"\n',
			),
			(
				'\tinvitation = frappe.get_doc("User Invitation", invitation_name)\n\n\t# accept invitation',
				'\tproof = frappe.db.sql("select name from `tabUser Invitation` where name=%s and `key`=%s for update", (invitation_name, hashed_key))\n\tif not proof:\n\t\tfrappe.throw(_("Invalid or expired key"))\n\tinvitation = frappe.get_doc("User Invitation", invitation_name)\n\n\t# accept invitation',
			),
			(
				"\tif not in_test and not should_update_password:\n\t\tfrappe.local.login_manager.login_as(invitation.email)\n",
				'\tif not should_update_password:\n\t\tfrom urllib.parse import quote\n\n\t\tredirect_to = "/login?invitation-accepted=1&redirect-to=" + quote("/" + invitation.get_redirect_to_path(), safe="")\n',
			),
		],
	)
	patch(
		"core/doctype/user_invitation/user_invitation.py",
		[
			(
				"\tdef _accept(self):\n",
				'\tdef _accept(self):\n\t\tfrom datetime import timedelta\n\n\t\tif self.email_sent_at and frappe.utils.get_datetime(self.email_sent_at) + timedelta(days=INVITATION_EXPIRY_DAYS) <= frappe.utils.now_datetime():\n\t\t\tfrappe.throw(title=_("Error"), msg=_("Invitation is expired"))\n',
			)
		],
	)

	for path in ("www/login.html", "www/update-password.html"):
		text = (root / path).read_text()
		replacements = []
		for svg in re.findall(r'<svg toggle="#[^"]+"[^>]*>.*?</svg>', text, re.S):
			target = re.search(r'toggle="(#.*?)"', svg)[1]
			icon = (
				re.sub(r' toggle="[^"]+"', "", svg)
				.replace(" toggle-password", "")
				.replace("<svg ", '<svg aria-hidden="true" ')
			)
			button = (
				'<button type="button" toggle="'
				+ target
				+ '" class="toggle-password" aria-controls="'
				+ target[1:]
				+ '" aria-pressed="false" aria-label="{{ _(\'Show password\') }}" style="min-width:44px;min-height:44px;background:transparent;border:0;display:flex;align-items:center;justify-content:center;">'
				+ icon
				+ "</button>"
			)
			replacements.append((svg, button))
		if path == "www/update-password.html":
			replacements.append(
				(
					"{{ include_style('login.bundle.css') }}",
					'{{ include_style(\'login.bundle.css\') }}\n<meta name="referrer" content="no-referrer">',
				)
			)
			replacements.append(
				(
					text[text.index("{% block script %}") :],
					'{% block script %}\n<script type="module" src="/assets/lms/js/account_password.js"></script>\n{% endblock %}\n',
				)
			)
		else:
			replacements.append(
				(
					'{{ alert_banner("error") }}\n\t<div class="form-group',
					'{{ alert_banner("error") }}\n\t{{ alert_banner("success") }}\n\t<div class="form-group',
				)
			)
			replacements.append(
				(
					"{{ include_style('login.bundle.css') }}",
					'{{ include_style(\'login.bundle.css\') }}\n<link rel="stylesheet" href="/assets/lms/css/account_login.css">\n<script type="module" src="/assets/lms/js/account_login.js"></script>',
				)
			)
			replacements.append(
				(
					"<section class='for-login'>\n\t\t<div class=\"login-content",
					'<section class=\'for-login\'>\n\t\t<div class="auth-layout">\n\t\t<div class="login-content',
				)
			)
			replacements.append(
				(
					"\t\t</div>\n\t</section>\n\n\t{%- if social_login -%}",
					"""		</div>
		<aside class="auth-welcome" aria-label="{{ _('Learning tips') }}">
			<h2>{{ _('Learn at your own pace.') }}</h2>
			<p data-auth-tip>{{ _('Resume your course where you left off.') }}</p>
			<p data-auth-tip hidden>{{ _('Review the lesson materials as you study.') }}</p>
			<p data-auth-tip hidden>{{ _('Keep your questions with the lesson discussion.') }}</p>
		</aside>
		</div>
	</section>

	{%- if social_login -%}""",
				)
			)
		patch(path, replacements)
	patch(
		"templates/includes/login/login.js",
		[
			(
				"login.set_status({{ _(\"Sent\") | tojson }}, 'green');",
				"login.set_status({{ _(\"Request accepted\") | tojson }}, 'green');",
			),
			(
				'login.call = function (args, callback, url="/", error_msg=null) {\n\tlogin.show_loading();',
				'login.call = function (args, callback, url="/", error_msg=null) {\n\tif (login.request_pending) return;\n\tlogin.request_pending = true;\n\tlogin.show_loading();',
			),
			(
				"\t\tstatusCode: login.login_handlers\n\t});",
				"\t\tstatusCode: login.login_handlers\n\t}).always(function() { login.request_pending = false; login.hide_loading(); });",
			),
			(
				"\t\t\tvar message = default_message;\n",
				'\t\t\tvar message = $(".form-verify").is(":visible") ? {{ _("Incorrect verification or recovery code.") | tojson }} : default_message;\n\t\t\tif (Number.isInteger(data.remaining_attempts)) {\n\t\t\t\tmessage += " " + (data.remaining_attempts > 0 ? {{ _("Attempts remaining for this connection: {0}") | tojson }}.replace("{0}", data.remaining_attempts) : {{ _("Too many attempts. Wait {0} seconds before trying again.") | tojson }}.replace("{0}", data.retry_after));\n\t\t\t}\n',
			),
			(
				"""		$(this).find("use").attr("href", isPassword ? "#icon-eye-off" : "#icon-eye");""",
				"""		$(this).attr("aria-pressed", String(isPassword)).attr("aria-label", isPassword ? {{ _("Hide password") | tojson }} : {{ _("Show password") | tojson }});
		$(this).find("use").attr("href", isPassword ? "#icon-eye-off" : "#icon-eye");""",
			),
			(
				"""		args.tmp_id = frappe.get_cookie('tmp_id');""",
				"""		args.tmp_id = frappe.get_cookie('tmp_id');
		args.trust_device = $("#trust_device").prop("checked") ? 1 : 0;""",
			),
			(
				"""				<input type="text" id="login_token" autocomplete="one-time-code" inputmode="numeric" class="form-control" placeholder="{{ _("Verification Code") | e }}" required="">""",
				"""				<label for="login_token">{{ _("Verification or recovery code") | e }}</label>
				<input type="text" id="login_token" autocomplete="one-time-code" class="form-control" placeholder="{{ _("Verification Code") | e }}" required="">
				<label class="flex items-center gap-2"><input type="checkbox" id="trust_device">{{ _("Trust this device for seven days") | e }}</label>""",
			),
			(
				"""	$(document).trigger('login_rendered');""",
				"""	const state = new URLSearchParams(window.location.search);
	if (state.has('password-updated')) login.show_success_banner({{ _("Your password was updated. Sign in with your new password.") | tojson }});
	if (state.has('invitation-accepted')) login.show_success_banner({{ _("Invitation accepted. Sign in to continue.") | tojson }});
	if (state.has('session-expired')) login.show_error_banner({{ _("Your session expired. Sign in again to continue.") | tojson }});
	if (state.has('logged-out')) login.show_success_banner({{ _("You signed out safely.") | tojson }});
	if (state.has('invitation-expired')) login.show_error_banner({{ _("This invitation is invalid, expired or already used. Ask for a new invitation, or request a password link if you already have an account.") | tojson }});
	$(document).trigger('login_rendered');""",
			),
		],
	)
	return {
		"framework_version": "16.60.2",
		"lms_version": "16.4.0",
		"order": "after local/i18n/apply_overlay.py and apply_frontend_context.py, before build; do not reapply prior manifests after this overlay",
		"patches": patches,
	}


if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("--framework", type=Path, required=True)
	parser.add_argument("--output", type=Path, required=True)
	args = parser.parse_args()
	args.output.write_text(json.dumps(build(args.framework), ensure_ascii=False, indent=2) + "\n")
