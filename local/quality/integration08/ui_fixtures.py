"""Native, explicitly owned UI fixtures in the segregated existing-copy sandbox."""

import json
import secrets
from pathlib import Path

import frappe
from frappe.utils.password import update_password

from lms.lms.test_helpers import BaseTestUtils

site = "tiberio.localhost"
frappe.init(site=site, sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.mute_emails and frappe.conf.pause_scheduler
path = Path(site) / "private/qc08-ui-fixtures.json"
assert not path.exists(), "Never overwrite fixture credentials or state"
try:
	fixture = {"actors": {}, "owned_documents": []}
	suffix = secrets.token_hex(6)
	for role, roles, user_type in (
		("admin", ["System Manager", "Moderator", "Course Creator"], "System User"),
		("creator", ["Course Creator"], "Website User"),
		("instructor", ["Batch Evaluator"], "Website User"),
		("student", ["LMS Student"], "Website User"),
		("outsider", ["LMS Student"], "Website User"),
	):
		name = f"qc08-ui-{role}-{suffix}@example.test"
		user = BaseTestUtils._create_user(name, "QC08", role.title(), roles, user_type)
		password = "Aa9!" + secrets.token_urlsafe(24)
		update_password(name, password)
		fixture["actors"][role] = {"user": name, "password": password}
		fixture["owned_documents"].append(["User", name])
	course = BaseTestUtils._create_course("QC08 UI Curso " + suffix, fixture["actors"]["creator"]["user"])
	course.append("instructors", {"instructor": fixture["actors"]["instructor"]["user"]})
	course.save()
	chapter = BaseTestUtils._create_chapter("QC08 UI Capítulo " + suffix, course.name)
	first = BaseTestUtils._create_outline_lesson("QC08 UI Aula de mídia " + suffix, chapter.name, course.name)
	second = BaseTestUtils._create_outline_lesson(
		"QC08 UI Aula seguinte " + suffix, chapter.name, course.name
	)
	BaseTestUtils._create_enrollment(fixture["actors"]["student"]["user"], course.name)
	frappe.db.set_value("LMS Course", course.name, "enforce_lesson_completion", 1)
	fixture.update(
		course=course.name,
		chapter=chapter.name,
		first_lesson=first.name,
		second_lesson=second.name,
		suffix=suffix,
	)
	fixture["owned_documents"] += [
		["LMS Course", course.name],
		["Course Chapter", chapter.name],
		["Course Lesson", first.name],
		["Course Lesson", second.name],
	]
	frappe.db.commit()
	path.write_text(json.dumps(fixture))
	path.chmod(0o600)
	print(
		json.dumps(
			{
				"synthetic_actors": len(fixture["actors"]),
				"course": course.name,
				"secrets_printed": False,
				"original_site_touched": False,
			}
		)
	)
finally:
	frappe.db.rollback()
	frappe.destroy()
