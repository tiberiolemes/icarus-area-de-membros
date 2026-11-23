"""Native regression tests; run only on the integrated source and an isolated test site."""

from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import frappe
from frappe import _
from frappe.client import delete as client_delete

from lms.lms.api import archive_course, delete_course, restore_course
from lms.lms.course_lifecycle import (
	_approval_key,
	get_course_deletion_impact,
	prepare_course_purge,
	purge_course,
	validate_new_enrollment,
)
from lms.lms.permissions import can_access_course
from lms.lms.test_helpers import BaseTestUtils
from lms.lms.utils import get_course_count, get_course_details, get_courses
from lms.tests.course_lifecycle_helpers import fixture_purge_authorizer


class TestCourseLifecycle(BaseTestUtils):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		suffix = frappe.generate_hash(length=10)
		self.author = self._create_user(
			f"qc01-author-{suffix}@example.com", "QC01", "Author", ["Course Creator"]
		)
		self.other = self._create_user(
			f"qc01-other-{suffix}@example.com", "QC01", "Other", ["Course Creator"]
		)
		self.student = self._create_user(
			f"qc01-student-{suffix}@example.com", "QC01", "Student", ["LMS Student"]
		)
		self.course = self._create_course(f"QC01 Lifecycle {suffix}", self.author.name)
		chapter = self._create_chapter(f"QC01 chapter {suffix}", self.course.name)
		self._create_chapter_reference(self.course.name, chapter.name)
		self.lesson = self._create_lesson(f"QC01 lesson {suffix}", chapter.name, self.course.name)
		self._create_lesson_reference(chapter.name, self.lesson.name)
		self.enrollment = self._create_enrollment(self.student.name, self.course.name)
		self.progress = self._create_progress(self.student.name, self.course.name, self.lesson.name)
		self.certificate = self._create_certificate(self.course.name, self.student.name)
		self.history = self._history()

	def _history(self):
		return {
			doctype: frappe.get_all(
				doctype, filters={"course": self.course.name}, fields=["*"], order_by="name"
			)
			for doctype in ("LMS Enrollment", "LMS Course Progress", "LMS Certificate")
		}

	def test_ordinary_delete_archives_and_restore_preserves_exact_history(self):
		frappe.set_user(self.author.name)
		self.assertEqual(
			delete_course(self.course.name), {"course": self.course.name, "is_archived": 1, "published": 0}
		)
		self.assertEqual(
			restore_course(self.course.name), {"course": self.course.name, "is_archived": 0, "published": 0}
		)
		self.assertEqual(self._history(), self.history)
		self.assertTrue(frappe.db.exists("Course Lesson", self.lesson.name))

	def test_student_outsider_and_guest_cannot_change_lifecycle_or_inspect_impact(self):
		for user in (self.student.name, self.other.name, "Guest"):
			frappe.set_user(user)
			for operation in (delete_course, archive_course, restore_course, get_course_deletion_impact):
				with (
					self.subTest(user=user, operation=operation.__name__),
					self.assertRaises(frappe.PermissionError),
				):
					operation(self.course.name)
		self.assertEqual(self._history(), self.history)

	def test_generic_delete_and_force_ignore_permissions_do_not_bypass_controller(self):
		# Administrator bypasses the framework permission hook, so on_trash must also refuse.
		for operation in (
			lambda: client_delete("LMS Course", self.course.name),
			lambda: frappe.delete_doc("LMS Course", self.course.name, force=True, ignore_permissions=True),
		):
			with self.assertRaises(frappe.PermissionError):
				operation()
		self.assertEqual(self._history(), self.history)

	def test_generic_save_cannot_set_archive_state_even_as_administrator(self):
		self.course.reload()
		self.course.is_archived = 1
		with self.assertRaises(frappe.PermissionError):
			self.course.save()

	def test_archived_course_stays_readable_for_member_but_public_catalog_excludes_it(self):
		archive_course(self.course.name)
		frappe.set_user(self.student.name)
		self.assertTrue(can_access_course(self.course.name))
		self.assertEqual(get_course_details(self.course.name).is_archived, 1)
		frappe.set_user(self.author.name)
		filters = {"created": 1, "is_archived": 1, "title": self.course.title}
		self.assertEqual([row.name for row in get_courses(filters.copy())], [self.course.name])
		self.assertEqual(get_course_count(filters.copy()), 1)
		frappe.set_user(self.other.name)
		self.assertFalse(can_access_course(self.course.name))
		self.assertEqual(get_courses({"is_archived": 1, "title": self.course.title}), [])

	def test_archive_does_not_launch_an_upcoming_course_or_send_interest_email(self):
		frappe.db.set_value("LMS Course", self.course.name, "upcoming", 1)
		with patch("lms.lms.doctype.lms_course.lms_course.LMSCourse.send_email_to_interested_users") as send:
			archive_course(self.course.name)
			send.assert_not_called()

	def test_new_enrollment_is_denied_even_for_administrator_and_batch_flag(self):
		archive_course(self.course.name)
		doc = frappe.new_doc("LMS Enrollment")
		doc.course = self.course.name
		doc.member = self.other.name
		doc.flags.via_batch_enrollment = True
		with self.assertRaises(frappe.PermissionError):
			validate_new_enrollment(doc)
		# This specifically verifies the integrator's before_insert hook is installed.
		doc.flags.via_batch_enrollment = False
		with self.assertRaises(frappe.PermissionError):
			doc.insert(ignore_permissions=True)

	def test_purge_rejects_client_flags_and_nonprivileged_authorizer(self):
		archive_course(self.course.name)
		frappe.set_user(self.author.name)
		with self.assertRaises(frappe.PermissionError):
			purge_course(self.course.name, self.course.name, "client-approval")
		with self.assertRaises(frappe.PermissionError):
			prepare_course_purge(self.course.name, self.other.name, "not-a-real-password")
		self.assertEqual(self._history(), self.history)

	def test_wrong_password_does_not_issue_approval(self):
		archive_course(self.course.name)
		with fixture_purge_authorizer() as (authorizer, _password):
			with self.assertRaises(frappe.PermissionError):
				prepare_course_purge(self.course.name, authorizer, "incorrect-synthetic-password")
		self.assertEqual(self._history(), self.history)

	def test_approval_changes_with_course_impact_and_is_not_reusable(self):
		archive_course(self.course.name)
		with fixture_purge_authorizer() as (authorizer, password):
			approval = prepare_course_purge(self.course.name, authorizer, password)
			self.assertEqual(approval["impact"]["counts"]["LMS Enrollment"], 1)
			frappe.db.set_value("LMS Course Progress", self.progress.name, "status", "Incomplete")
			with self.assertRaises(frappe.ValidationError):
				purge_course(self.course.name, self.course.name, approval["token"])
			with self.assertRaises(frappe.PermissionError):
				purge_course(self.course.name, self.course.name, approval["token"])
			log = frappe.get_all(
				"Activity Log",
				filters={"subject": _("Course purge authorized: {0}").format(self.course.name)},
				pluck="content",
			)
			self.assertTrue(log)
			self.assertNotIn(password, str(log))
			self.assertNotIn(approval["token"], str(log))
			self.assertIn(authorizer, str(log))

	def test_concurrent_approval_consumption_has_exactly_one_winner(self):
		archive_course(self.course.name)
		with fixture_purge_authorizer() as (authorizer, password):
			approval = prepare_course_purge(self.course.name, authorizer, password)
			cache, key = frappe.cache(), _approval_key(approval["token"])
			with ThreadPoolExecutor(max_workers=2) as pool:
				results = list(pool.map(lambda _: cache.getdel(key), range(2)))
			self.assertEqual(sum(bool(result) for result in results), 1)
		self.assertEqual(self._history(), self.history)

	def test_explicit_purge_records_both_actors_without_secrets(self):
		frappe.set_user(self.author.name)
		archive_course(self.course.name)
		with fixture_purge_authorizer() as (authorizer, password):
			approval = prepare_course_purge(self.course.name, authorizer, password)
			self.assertTrue(purge_course(self.course.name, self.course.name, approval["token"])["purged"])
			log = frappe.get_all(
				"Activity Log",
				filters={"subject": _("Course purged: {0}").format(self.course.name)},
				pluck="content",
			)
			self.assertTrue(log)
			self.assertIn(authorizer, str(log))
			self.assertIn(self.author.name, str(log))
			self.assertNotIn(password, str(log))
			self.assertNotIn(approval["token"], str(log))
		self.assertFalse(frappe.db.exists("LMS Course", self.course.name))
