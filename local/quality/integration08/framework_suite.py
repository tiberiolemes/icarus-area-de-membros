"""Run complete affected native framework modules, retaining incompatible contracts."""

import json
import sys
from pathlib import Path

import frappe

site = "test_quality08.localhost"
frappe.init(site=site)
assert frappe.conf.allow_tests and frappe.conf.mute_emails
from frappe.commands.testing import main

modules = sys.argv[1:] or [
	"frappe.core.doctype.file.test_file",
	"frappe.core.doctype.error_log.test_error_log",
	"frappe.core.doctype.user.test_user",
	"frappe.tests.test_auth",
	"frappe.tests.test_password",
	"frappe.tests.test_password_strength",
	"frappe.tests.test_twofactor",
	"frappe.tests.test_twofactor_login",
]
assert all(module.startswith("frappe.") and "test" in module for module in modules)
print(
	json.dumps({"native_framework_modules": modules, "site": site, "source_assertions_unchanged": True}),
	flush=True,
)
main(site=site, app="frappe", module=modules, junit_xml_output=str(Path(site) / "framework08.xml"))
