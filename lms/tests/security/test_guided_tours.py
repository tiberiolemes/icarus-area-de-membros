"""Native site/schema/role checks prepared for integrator08; synthetic users only."""

from unittest.mock import patch

import frappe

from lms.lms.test_helpers import BaseTestUtils
from lms.lms.tours import catalogue, get_state, record_event, record_name, report


class TestGuidedTours(BaseTestUtils):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		mail = patch("frappe.sendmail")
		mail.start()
		self.addCleanup(mail.stop)
		self.alice = self._create_user(
			f"qc07-tour-a-{frappe.generate_hash(length=10)}@example.com", "QC07", "Alice", ["LMS Student"]
		)
		self.bob = self._create_user(
			f"qc07-tour-b-{frappe.generate_hash(length=10)}@example.com", "QC07", "Bob", ["LMS Student"]
		)
		self.revision = catalogue()["revision"]
		frappe.set_user(self.alice.name)

	def event(self, action, **args):
		return record_event("Courses", self.revision, action, **args)

	def test_native_record_is_private_and_frontier_skip_rating_are_distinct(self):
		self.event("start")
		self.event("start")
		with self.assertRaises(frappe.ValidationError):
			self.event("complete")
		self.event("progress", step=1)
		completed = self.event("complete")
		self.assertEqual(completed["completed_count"], 1)
		self.assertEqual(completed["helpful"], "")
		self.assertEqual(self.event("rate", helpful=0)["helpful"], "No")
		self.assertFalse(
			frappe.has_permission("LMS Tour Progress", "read", doc=record_name("Courses", self.revision))
		)

	def test_other_member_sees_only_their_own_state_and_cannot_read_the_report(self):
		self.event("start")
		self.event("progress", step=1)
		alice_record = record_name("Courses", self.revision)
		frappe.set_user(self.bob.name)
		self.assertEqual(get_state("Courses", self.revision)["status"], "Not Started")
		with self.assertRaises(frappe.PermissionError):
			report()
		self.event("start")
		self.assertNotEqual(alice_record, record_name("Courses", self.revision))
		self.assertEqual(frappe.db.get_value("LMS Tour Progress", alice_record, "step"), 1)

	def test_native_pause_resume_and_report_keep_real_denominators(self):
		self.event("start")
		self.event("pause")
		self.assertEqual(self.event("start")["started_count"], 1)
		self.event("skip")
		frappe.set_user("Administrator")
		data = report(page="Courses")
		self.assertEqual(data["site"], frappe.local.site)
		self.assertGreaterEqual(data["summary"]["participations"], 1)
		self.assertGreaterEqual(data["summary"]["skipped"], 1)
		self.assertTrue(any(row.member == self.alice.name for row in data["rows"]))

	def test_guest_and_unprivileged_privacy_page_tracking_are_denied(self):
		with self.assertRaises(frappe.PermissionError):
			get_state("DeskPrivacySettings", self.revision)
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			get_state("Courses", self.revision)
