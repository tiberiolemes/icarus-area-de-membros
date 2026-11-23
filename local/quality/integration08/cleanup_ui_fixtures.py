"""Remove only the explicitly recorded UI fixtures through native purge authority."""

import json
from pathlib import Path

import frappe

from lms.lms.course_lifecycle import prepare_course_purge, purge_course, set_course_archived
from lms.tests.test_coupon_redemption import _delete_committed_user

frappe.init(site="tiberio.localhost", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.mute_emails and frappe.conf.pause_scheduler
path = Path("tiberio.localhost/private/qc08-ui-fixtures.json")
fixture = json.loads(path.read_text())
assert fixture["course"].startswith("qc08-ui-curso-")
assert all(
	row["user"].startswith("qc08-ui-") and row["user"].endswith("@example.test")
	for row in fixture["actors"].values()
)
try:
	course = fixture["course"]
	if frappe.db.exists("LMS Course", course):
		set_course_archived(course, True)
		admin = fixture["actors"]["admin"]
		approval = prepare_course_purge(course, admin["user"], admin["password"])
		purge_course(course, course, approval["token"])
	for actor in fixture["actors"].values():
		user = actor["user"]
		if frappe.db.exists("User", user):
			_delete_committed_user(user)
	frappe.db.commit()
	path.unlink()
	print(json.dumps({"owned_ui_fixtures_removed": True, "original_site_touched": False}))
finally:
	frappe.db.rollback()
	frappe.destroy()
