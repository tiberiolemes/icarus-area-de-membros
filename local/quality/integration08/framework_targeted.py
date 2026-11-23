"""Keep native assertions; isolate only the synthetic test fixture from approved security policy."""

import json
import secrets
import sys
from unittest.mock import patch

import frappe

SITE = "test_quality08.localhost"
frappe.init(site=SITE)
frappe.connect()
assert frappe.conf.allow_tests and frappe.conf.mute_emails and frappe.conf.pause_scheduler
frappe.set_user("Administrator")
from frappe.commands.testing import main

mode = sys.argv[1]
if mode == "auth":
	import frappe.tests.test_auth as native

	original = native.add_user
	credential = "Qc08!" + secrets.token_urlsafe(24) + "Aa7"

	def strong_fixture(email, password, **kwargs):
		assert email == "test_auth@test.com" and password == "pwd_012"
		native.TestAuth.test_user_password = credential
		return original(email=email, password=credential, **kwargs)

	print(
		json.dumps(
			{
				"fixture_delta": "Only TestAuth password factory: unique policy-valid synthetic credential",
				"native_assertions_unchanged": True,
			}
		)
	)
	with patch.object(native, "add_user", strong_fixture):
		main(site=SITE, app="frappe", module=["frappe.tests.test_auth"], case="TestAuth", verbose=True)
elif mode in ("strength", "rate"):
	from frappe.core.doctype.user.test_user import TestUser

	original = TestUser.setUp

	def isolated_fixture(self):
		original(self)
		if mode == "strength":
			from frappe.utils.password import update_password

			update_password("test@example.com", "Qc08!" + secrets.token_urlsafe(24) + "Aa7")
		else:
			key = (
				frappe.cache.make_key("rl:frappe.core.doctype.user.user.reset_password:127.0.0.1") + b":3600"
			)
			frappe.cache.delete(key)

	name = "test_password_strength" if mode == "strength" else "test_rate_limiting_for_reset_password"
	print(
		json.dumps(
			{
				"fixture_delta": "Only synthetic test account starts with a different strong credential"
				if mode == "strength"
				else "Only exact testsite/loopback reset rate key cleared",
				"native_assertions_unchanged": True,
			}
		)
	)
	with patch.object(TestUser, "setUp", isolated_fixture):
		main(
			site=SITE,
			app="frappe",
			module=["frappe.core.doctype.user.test_user"],
			case="TestUser",
			tests=(name,),
			verbose=True,
		)
else:
	raise AssertionError("Unknown isolated fixture reduction")
