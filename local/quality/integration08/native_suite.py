"""Native Frappe runner over the affected suites; never the original site."""

import json
import os
import sys
from pathlib import Path

import frappe

site = "test_quality08.localhost"
frappe.init(site=site)
assert frappe.conf.mute_emails and frappe.conf.allow_tests and site.startswith("test_")
from frappe.commands.testing import main

modules = [
	"lms." + str(path.relative_to(Path("../apps/lms/lms"))).removesuffix(".py").replace("/", ".")
	for path in sorted(Path("../apps/lms/lms/tests/security").glob("test_*.py"))
]
modules += [
	"lms.tests.api.test_delete",
	"lms.tests.api.test_discussion_read_permission",
	"lms.tests.api.test_course_dashboard_api",
	"lms.tests.api.test_batch_dashboard_api",
	"lms.tests.api.test_create_lesson",
	"lms.tests.api.test_certification_api",
	"lms.tests.api.test_bulk_enrollment_api",
	"lms.tests.api.test_members",
	"lms.tests.api.test_api",
	"lms.tests.test_lesson_locking",
	"lms.tests.test_demo_data",
	"lms.tests.test_coupon_redemption",
	"lms.tests.test_signup_form",
	"lms.lms.doctype.course_lesson.test_course_lesson",
]
if sys.argv[1:]:
	modules = sys.argv[1:]
assert modules and all(module.startswith("lms.") for module in modules)
os.environ["QC11_CONCURRENCY_SITE"] = site
print(json.dumps({"native_modules": modules, "site": site, "smtp_muted": True}), flush=True)
main(site=site, app="lms", module=modules, junit_xml_output=str(Path(site) / "native08.xml"))
