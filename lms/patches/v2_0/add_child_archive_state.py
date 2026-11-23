"""Add reversible child archive state; existing enrollments/history keep their timestamps."""

import frappe


def execute():
	for name in ("course_chapter", "course_lesson"):
		frappe.reload_doc("lms", "doctype", name)
	for name in ("Course Chapter", "Course Lesson"):
		row = frappe.qb.DocType(name)
		frappe.qb.update(row).set(row.is_archived, 0).where(row.is_archived.isnull()).run()
