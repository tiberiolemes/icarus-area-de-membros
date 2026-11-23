"""Real two-connection regression, opt-in ONLY on integration08's segregated site.

QC11_CONCURRENCY_SITE=<exact-test-site> bench --site <exact-test-site> run-tests \
  --app lms --module lms.tests.security.test_child_content_concurrency
Synthetic QC11 fixtures must commit so the second connection can see them. They are
removed through real01 purge authorization, never a client/test permission bypass.
"""

import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import frappe
from frappe.utils import get_datetime

from lms.lms.api import archive_lesson
from lms.lms.child_content import curriculum_rows
from lms.lms.test_helpers import BaseTestUtils
from lms.tests.course_lifecycle_helpers import purge_course_fixture


@unittest.skipUnless(os.getenv("QC11_CONCURRENCY_SITE"), "Explicit segregated08 site required")
class TestChildContentConcurrency(unittest.TestCase):
	def test_enrollment_waiting_behind_archive_is_stamped_after_the_lock(self):
		site = frappe.local.site
		self.assertTrue(frappe.in_test)
		self.assertEqual(os.environ["QC11_CONCURRENCY_SITE"], site)
		sites_path = frappe.local.sites_path
		frappe.set_user("Administrator")
		suffix = frappe.generate_hash(length=16)
		member = BaseTestUtils._create_user(
			f"qc11-race-{suffix}@example.com", "QC11", "Race", ["LMS Student"]
		)
		course = BaseTestUtils._create_course(f"QC11 Race {suffix}", "Administrator")
		chapter = BaseTestUtils._create_chapter(f"QC11 Race Chapter {suffix}", course.name)
		BaseTestUtils._create_chapter_reference(course.name, chapter.name)
		lesson = BaseTestUtils._create_lesson(f"QC11 Race Lesson {suffix}", chapter.name, course.name)
		BaseTestUtils._create_lesson_reference(chapter.name, lesson.name)
		frappe.db.commit()
		before_lock = Event()

		def enroll():
			frappe.init(site=site, sites_path=sites_path)
			frappe.connect()
			try:
				frappe.flags.in_test = True
				frappe.set_user("Administrator")
				frappe.db.sql("SET SESSION innodb_lock_wait_timeout = 5")
				doc = frappe.new_doc("LMS Enrollment")
				doc.update({"course": course.name, "member": member.name})
				original = doc.check_if_latest

				def mark_before_wait(*args, **kwargs):
					# Native insert already captured its provisional creation before this point.
					before_lock.set()
					return original(*args, **kwargs)

				doc.check_if_latest = mark_before_wait
				doc.insert()
				frappe.db.commit()
				return get_datetime(doc.creation)
			finally:
				frappe.db.rollback()
				frappe.destroy()

		try:
			# Hold the real course lock while the second insert gets as far as its lock.
			frappe.db.get_value("LMS Course", course.name, "name", for_update=True)
			with ThreadPoolExecutor(max_workers=1) as pool:
				future = pool.submit(enroll)
				try:
					self.assertTrue(before_lock.wait(5))
					self.assertFalse(future.done())
					cutoff = get_datetime(archive_lesson(lesson.name)["archived_on"])
					frappe.db.commit()
					creation = future.result(timeout=10)
					self.assertGreater(creation, cutoff)
				finally:
					frappe.db.rollback()
			self.assertEqual(curriculum_rows(course.name, member.name), [])
		finally:
			frappe.db.rollback()
			frappe.set_user("Administrator")
			purge_course_fixture(course.name)
			frappe.delete_doc(
				"User", member.name, force=True, ignore_permissions=True, delete_permanently=True
			)
			frappe.db.commit()
