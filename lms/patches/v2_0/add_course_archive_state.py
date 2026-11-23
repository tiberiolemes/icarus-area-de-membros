"""Expand the native course schema without changing publication or learner history."""

import frappe


def execute():
	frappe.reload_doc("lms", "doctype", "lms_course")
	course = frappe.qb.DocType("LMS Course")
	frappe.qb.update(course).set(course.is_archived, 0).where(course.is_archived.isnull()).run()
