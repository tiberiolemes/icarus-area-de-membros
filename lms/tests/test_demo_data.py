# Copyright (c) 2026, Frappe and Contributors
# See license.txt

import frappe

from lms.demo.demo_data import create_demo_data
from lms.lms.api import clear_demo_data
from lms.lms.test_helpers import BaseTestUtils

DEMO_INSTRUCTOR = "jannat@example.com"


class TestDemoData(BaseTestUtils):
	def setUp(self):
		super().setUp()
		# Preserve any pre-existing seed inside the savepoint instead of deleting it.
		for course in frappe.get_all("LMS Course", {"title": "A guide to Frappe Learning"}, pluck="name"):
			frappe.db.set_value(
				"LMS Course", course, "title", "QC01 preserved " + frappe.generate_hash(length=8)
			)
		frappe.db.set_single_value("LMS Settings", "demo_data_present", False)
		self.real_user = self._create_user("real.user@example.com", "Real", "User", ["LMS Student"])
		self.real_user.db_set("user_image", "/files/real.png")

	def test_demo_data_leaves_existing_users_alone(self):
		"""create_instructor reused an arbitrary real user, set their photo and made them
		Moderator; clear_demo_data undid neither. Guards that a real user is untouched."""
		create_demo_data()

		self.assertEqual(frappe.db.get_value("User", self.real_user.name, "user_image"), "/files/real.png")
		self.assertNotIn("Moderator", frappe.get_roles(self.real_user.name))
		course = frappe.db.get_value("LMS Course", {"title": "A guide to Frappe Learning"})
		instructors = frappe.get_all("Course Instructor", {"parent": course}, pluck="instructor")
		self.assertEqual(instructors, [DEMO_INSTRUCTOR])

	def test_clear_demo_data_archives_and_preserves_accounts_and_history(self):
		create_demo_data()
		self.assertTrue(frappe.db.exists("User", DEMO_INSTRUCTOR))
		course = frappe.db.get_value("LMS Course", {"title": "A guide to Frappe Learning"})
		before = {
			doctype: frappe.get_all(doctype, filters={"course": course}, fields=["*"], order_by="name")
			for doctype in ("LMS Enrollment", "LMS Course Progress", "LMS Course Review")
		}
		clear_demo_data()

		self.assertTrue(frappe.db.exists("User", DEMO_INSTRUCTOR))
		self.assertTrue(frappe.db.exists("User", self.real_user.name))
		self.assertEqual(frappe.db.get_value("LMS Course", course, "is_archived"), 1)
		for doctype, rows in before.items():
			self.assertEqual(frappe.get_all(doctype, filters={"course": course}, fields=["*"], order_by="name"), rows)
		self.assertFalse(frappe.db.get_single_value("LMS Settings", "demo_data_present"))

	def test_demo_cleanup_refuses_an_unverified_title_collision(self):
		course = self._create_course("A guide to Frappe Learning", "Administrator")
		frappe.db.set_single_value("LMS Settings", "demo_data_present", True)
		with self.assertRaises(frappe.ValidationError):
			clear_demo_data()
		self.assertFalse(frappe.db.get_value("LMS Course", course.name, "is_archived"))
