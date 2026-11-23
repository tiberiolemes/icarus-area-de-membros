"""Explicit purge of synthetic native test fixtures, with real privileged reauthentication."""

from contextlib import contextmanager

import frappe
from frappe.utils.password import update_password

from lms.lms.course_lifecycle import prepare_course_purge, purge_course, set_course_archived
from lms.lms.test_helpers import BaseTestUtils


@contextmanager
def fixture_purge_authorizer():
	if not frappe.in_test:
		raise RuntimeError("Fixture purge is available only in native tests")
	actor, sid = frappe.session.user, frappe.session.get("sid")
	frappe.set_user("Administrator")
	approver = BaseTestUtils._create_user(
		f"qc01-purge-{frappe.generate_hash(length=12)}@example.com",
		"QC01",
		"Approver",
		["System Manager"],
		user_type="System User",
	)
	password = "Aa9!" + frappe.generate_hash(length=48)
	update_password(approver.name, password)
	frappe.set_user(actor)
	frappe.session.sid = "qc01-" + frappe.generate_hash(length=24)
	try:
		yield approver.name, password
	finally:
		frappe.set_user("Administrator")
		try:
			frappe.delete_doc(
				"User", approver.name, force=True, ignore_permissions=True, delete_permanently=True
			)
		finally:
			frappe.set_user(actor)
			frappe.session.sid = sid


def purge_course_fixture(course: str):
	with fixture_purge_authorizer() as (authorizer, password):
		set_course_archived(course, True)
		approval = prepare_course_purge(course, authorizer, password)
		return purge_course(course, course, approval["token"])
