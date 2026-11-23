import json
import os
from unittest.mock import patch

import frappe

from lms.lms.doctype.course_chapter.course_chapter import _scorm_playback_payload, resolve_scorm_access
from lms.lms.doctype.course_lesson.course_lesson import serve_resource
from lms.lms.lesson_files import LessonFileAccess
from lms.lms.permissions import can_access_lesson, file_has_permission
from lms.lms.test_helpers import BaseTestUtils
from lms.page_renderers import SCORMRenderer


class TestSequentialMediaAccess(BaseTestUtils):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		suffix = frappe.generate_hash(length=10)
		self.author = self._create_user(
			f"qc01-media-author-{suffix}@example.com", "QC01", "Author", ["Course Creator"]
		)
		self.other = self._create_user(
			f"qc01-media-other-{suffix}@example.com", "QC01", "Other", ["Course Creator"]
		)
		self.student = self._create_user(
			f"qc01-media-student-{suffix}@example.com", "QC01", "Student", ["LMS Student"]
		)
		self.moderator = self._create_user(
			f"qc01-media-mod-{suffix}@example.com", "QC01", "Mod", ["Moderator"]
		)
		self.course = self._create_course(f"QC01 Media {suffix}", self.author.name)
		self.chapter = self._create_chapter(f"QC01 media chapter {suffix}", self.course.name)
		self._create_chapter_reference(self.course.name, self.chapter.name)
		self.first = self._create_lesson(f"QC01 first {suffix}", self.chapter.name, self.course.name)
		self.future = self._create_lesson(f"QC01 future {suffix}", self.chapter.name, self.course.name)
		chapter = frappe.get_doc("Course Chapter", self.chapter.name)
		chapter.set("lessons", [{"lesson": self.first.name}, {"lesson": self.future.name}])
		chapter.save()
		self._create_enrollment(self.student.name, self.course.name)
		frappe.db.set_value("LMS Course", self.course.name, "enforce_lesson_completion", 1)
		frappe.set_user(self.author.name)
		# nosemgrep: lms-unjustified-ignore-permissions - isolated fixture attachment owned by the real course author
		self.file = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": f"QC01_media_{suffix}.txt",
				"is_private": 1,
				"content": f"QC01 synthetic bytes {suffix}",
				"attached_to_doctype": "Course Lesson",
				"attached_to_name": self.future.name,
				"attached_to_field": "content",
			}
		).insert(ignore_permissions=True)
		self.addCleanup(self._remove_file, self.file.get_full_path())
		frappe.set_user("Administrator")
		self.embed(self.future.name, self.file.file_url)

	@staticmethod
	def _remove_file(path):
		if os.path.exists(path):
			os.remove(path)

	def embed(self, lesson, url, field="content"):
		frappe.db.set_value(
			"Course Lesson",
			lesson,
			field,
			json.dumps({"blocks": [{"type": "upload", "data": {"file_url": url, "file_type": "Video"}}]}),
			update_modified=False,
		)

	def serve_as(self, user, url=None):
		frappe.set_user(user)
		try:
			with patch(
				"lms.lms.doctype.course_lesson.course_lesson._serve_private_file", return_value="bytes"
			):
				return serve_resource(url or self.file.file_url)
		finally:
			frappe.set_user("Administrator")

	def test_future_bytes_are_denied_then_released_after_prerequisite(self):
		self.assertFalse(file_has_permission(self.file, user=self.student.name))
		with self.assertRaises(frappe.PermissionError):
			self.serve_as(self.student.name)
		progress = self._create_progress(self.student.name, self.course.name, self.first.name)
		frappe.db.set_value("LMS Course Progress", progress.name, "status", "Complete")
		self.assertTrue(file_has_permission(self.file, user=self.student.name))
		self.assertEqual(self.serve_as(self.student.name), "bytes")

	def test_shared_bytes_require_at_least_one_accessible_legitimate_reference(self):
		self.embed(self.first.name, self.file.file_url)
		self.assertEqual(self.serve_as(self.student.name), "bytes")
		frappe.db.set_value("Course Lesson", self.first.name, "content", "")
		with self.assertRaises(frappe.PermissionError):
			self.serve_as(self.student.name)

	def test_prefix_match_does_not_turn_a_future_file_into_an_open_reference(self):
		self.embed(self.first.name, self.file.file_url + ".other")
		with self.assertRaises(frappe.PermissionError):
			self.serve_as(self.student.name)

	def test_preview_author_and_moderator_are_preserved_without_granting_other_creators(self):
		for user in (self.author.name, self.moderator.name):
			self.assertEqual(self.serve_as(user), "bytes")
		for user in (self.other.name, "Guest"):
			with self.assertRaises(frappe.PermissionError):
				self.serve_as(user)
		frappe.db.set_single_value("LMS Settings", "allow_guest_access", 1)
		frappe.clear_document_cache("LMS Settings", "LMS Settings")
		frappe.db.set_value("Course Lesson", self.future.name, "include_in_preview", 1)
		self.assertEqual(self.serve_as("Guest"), "bytes")
		# Preview must not be an alternate path around the sequencing of a member.
		with self.assertRaises(frappe.PermissionError):
			self.serve_as(self.student.name)

	def test_instructor_only_reference_does_not_authorize_student_bytes(self):
		frappe.db.set_value("File", self.file.name, "attached_to_field", "instructor_content")
		frappe.db.set_value("Course Lesson", self.future.name, "content", "")
		self.embed(self.first.name, self.file.file_url, "instructor_content")
		with self.assertRaises(frappe.PermissionError):
			self.serve_as(self.student.name)
		self.assertEqual(self.serve_as(self.author.name), "bytes")

	def test_chapter_move_cannot_borrow_old_course_membership_or_uploader_authority(self):
		new_course = self._create_course(f"QC01 moved {frappe.generate_hash(length=8)}", self.other.name)
		frappe.db.set_value("Course Chapter", self.chapter.name, "course", new_course.name)
		with self.assertRaises(frappe.PermissionError):
			self.serve_as(self.student.name)
		self.assertFalse(can_access_lesson(self.future.name, user=self.author.name))

	def test_scorm_pair_and_renderer_deny_locked_bytes_then_unlock(self):
		# The package's selected lesson is the future one; native renderer reads this relation.
		frappe.db.set_value(
			"Lesson Reference", {"parent": self.chapter.name, "lesson": self.first.name}, "idx", 2
		)
		frappe.db.set_value(
			"Lesson Reference", {"parent": self.chapter.name, "lesson": self.future.name}, "idx", 1
		)
		# Keep a prerequisite in an earlier chapter so ordering still locks the SCORM lesson.
		prerequisite = self._create_chapter(
			f"QC01 prerequisite {frappe.generate_hash(length=8)}", self.course.name
		)
		frappe.db.set_value("Chapter Reference", {"parent": self.course.name}, "idx", 2)
		self._create_chapter_reference(self.course.name, prerequisite.name, idx=1)
		frappe.db.set_value("Course Lesson", self.first.name, "chapter", prerequisite.name)
		frappe.db.delete("Lesson Reference", {"parent": self.chapter.name, "lesson": self.first.name})
		self._create_lesson_reference(prerequisite.name, self.first.name)
		package = f"/scorm/{self.course.name}/{self.chapter.name}"
		frappe.db.set_value(
			"Course Chapter", self.chapter.name, {"is_scorm_package": 1, "scorm_package_path": package}
		)
		frappe.set_user(self.student.name)
		access = resolve_scorm_access(self.course.name, self.future.name)
		self.assertTrue(access.locked)
		payload = _scorm_playback_payload(
			frappe._dict(
				name=self.chapter.name,
				course=self.course.name,
				title="QC01",
				course_title="QC01",
				launch_file=package + "/index.html",
			),
			self.future.name,
			access,
		)
		self.assertIsNone(payload["launch_file"])
		with self.assertRaises(frappe.PermissionError):
			SCORMRenderer(path=package.lstrip("/") + "/index.html")._check_permission(
				self.course.name, self.chapter.name
			)
		frappe.set_user("Administrator")
		progress = self._create_progress(self.student.name, self.course.name, self.first.name)
		frappe.db.set_value("LMS Course Progress", progress.name, "status", "Complete")
		frappe.set_user(self.student.name)
		self.assertFalse(resolve_scorm_access(self.course.name, self.future.name).locked)
		SCORMRenderer(path=package.lstrip("/") + "/index.html")._check_permission(
			self.course.name, self.chapter.name
		)

	def test_scorm_preview_authority_and_wrong_course_do_not_widen_access(self):
		package = f"/scorm/{self.course.name}/{self.chapter.name}"
		frappe.db.set_value(
			"Course Chapter", self.chapter.name, {"is_scorm_package": 1, "scorm_package_path": package}
		)
		renderer = SCORMRenderer(path=package.lstrip("/") + "/index.html")
		for user in (self.other.name, "Guest"):
			frappe.set_user(user)
			self.assertFalse(resolve_scorm_access(self.course.name, self.first.name).can_access)
			with self.assertRaises(frappe.PermissionError):
				renderer._check_permission(self.course.name, self.chapter.name)
		for user in (self.author.name, self.moderator.name):
			frappe.set_user(user)
			self.assertFalse(resolve_scorm_access(self.course.name, self.future.name).locked)
			renderer._check_permission(self.course.name, self.chapter.name)
		frappe.set_user("Administrator")
		frappe.db.set_single_value("LMS Settings", "allow_guest_access", 1)
		frappe.clear_document_cache("LMS Settings", "LMS Settings")
		frappe.db.set_value("Course Lesson", self.first.name, "include_in_preview", 1)
		frappe.set_user("Guest")
		self.assertTrue(resolve_scorm_access(self.course.name, self.first.name).can_access)
		self.assertFalse(resolve_scorm_access("unrelated-course", self.first.name).can_access)
		renderer._check_permission(self.course.name, self.chapter.name)

	def test_native_download_rejects_forged_owner_then_releases_legitimate_reference(self):
		from frappe.core.doctype.file.utils import find_file_by_url

		self.assertIsInstance(
			frappe.get_doc("File", self.file.name),
			LessonFileAccess,
			"the integrator must install the native File extension",
		)
		frappe.set_user("Administrator")
		# Seed a historical forged-owner row as trusted fixture setup; native insertion
		# already refuses the same URL when attempted by the blocked student.
		# nosemgrep: lms-unjustified-ignore-permissions - synthetic row; authorization is asserted at native download
		duplicate = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": self.file.file_name,
				"file_url": self.file.file_url,
				"is_private": 1,
				"owner": self.student.name,
			}
		).insert(ignore_permissions=True)
		duplicate.db_set("owner", self.student.name)
		frappe.set_user(self.student.name)
		self.assertEqual(duplicate.owner, self.student.name)
		self.assertFalse(duplicate.is_downloadable())
		self.assertIsNone(find_file_by_url(self.file.file_url, name=duplicate.name))
		frappe.set_user(self.student.name)
		from lms.lms.doctype.course_lesson.course_lesson import save_progress
		save_progress(self.first.name, self.course.name)
		self.assertEqual(find_file_by_url(self.file.file_url, name=duplicate.name).name, duplicate.name)

	def test_native_download_preserves_shared_references_and_non_lms_private_files(self):
		from frappe.core.doctype.file.utils import find_file_by_url

		self.embed(self.first.name, self.file.file_url)
		frappe.set_user(self.author.name)
		self.assertEqual(find_file_by_url(self.file.file_url).name, self.file.name)
		frappe.set_user(self.student.name)
		# Own a duplicate metadata row: its ownership must not be sufficient on its own,
		# but an actual open, canonical reference is sufficient alongside native ownership.
		frappe.set_user("Administrator")
		duplicate = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": self.file.file_name,
				"file_url": self.file.file_url,
				"is_private": 1,
				"owner": self.student.name,
			}
		).insert(ignore_permissions=True)
		duplicate.db_set("owner", self.student.name)
		frappe.set_user(self.student.name)
		self.assertTrue(duplicate.is_downloadable())
		self.assertEqual(find_file_by_url(self.file.file_url, name=duplicate.name).name, duplicate.name)
		other = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": "QC01-personal-" + frappe.generate_hash(length=10) + ".txt",
				"is_private": 1,
				"content": "QC01 personal file " + frappe.generate_hash(length=10),
			}
		).insert(ignore_permissions=True)
		self.addCleanup(self._remove_file, other.get_full_path())
		self.assertTrue(other.is_downloadable())
		self.assertEqual(find_file_by_url(other.file_url).name, other.name)
		# A course author merely pasting another owner's URL grants neither access
		# nor power to revoke that owner's native private-file access.
		frappe.set_user("Administrator")
		self.embed(self.first.name, other.file_url)
		frappe.set_user(self.student.name)
		self.assertTrue(other.is_downloadable())

	def test_archive_cutoff_composes_with_sequence_on_custom_and_native_bytes(self):
		from datetime import timedelta

		from frappe.core.doctype.file.utils import find_file_by_url
		from frappe.utils import now_datetime

		from lms.lms.api import archive_lesson

		cutoff = now_datetime() - timedelta(minutes=1)
		frappe.db.set_value(
			"LMS Enrollment",
			{"course": self.course.name, "member": self.student.name},
			"creation",
			cutoff - timedelta(seconds=1),
		)
		with patch("lms.lms.child_content.now_datetime", return_value=cutoff):
			archive_lesson(self.future.name)
		with self.assertRaises(frappe.PermissionError):
			self.serve_as(self.student.name)
		frappe.set_user(self.student.name)
		self.assertFalse(find_file_by_url(self.file.file_url, name=self.file.name))
		frappe.set_user(self.student.name)
		from lms.lms.doctype.course_lesson.course_lesson import save_progress
		save_progress(self.first.name, self.course.name)
		self.assertEqual(self.serve_as(self.student.name), "bytes")
		frappe.set_user(self.student.name)
		from lms.lms.lesson_files import lesson_file_access
		from frappe.core.doctype.file.file import has_permission as native_file_permission
		self.assertTrue(find_file_by_url(self.file.file_url, name=self.file.name), {
			"canonical": lesson_file_access(self.file.file_url),
			"native": native_file_permission(frappe.get_doc("File", self.file.name), "read"),
			"lesson": frappe.has_permission("Course Lesson", "read", doc=self.future.name),
			"path": getattr(getattr(frappe.local, "request", None), "path", None),
		})
		frappe.set_user("Administrator")
		# Equal timestamps do not borrow the old cohort's access.
		frappe.db.set_value(
			"LMS Enrollment", {"course": self.course.name, "member": self.student.name}, "creation", cutoff
		)
		with self.assertRaises(frappe.PermissionError):
			self.serve_as(self.student.name)

	def test_archived_file_cannot_be_deleted_or_made_public_even_by_owner(self):
		from lms.lms.api import archive_lesson

		archive_lesson(self.future.name)
		frappe.set_user(self.author.name)
		self.assertIsInstance(self.file, LessonFileAccess)
		with self.assertRaises(frappe.PermissionError):
			frappe.delete_doc("File", self.file.name, ignore_permissions=True, force=True)
		file = frappe.get_doc("File", self.file.name)
		file.is_private = 0
		with self.assertRaises(frappe.PermissionError):
			file.save(ignore_permissions=True)
		self.assertTrue(os.path.isfile(self.file.get_full_path()))
