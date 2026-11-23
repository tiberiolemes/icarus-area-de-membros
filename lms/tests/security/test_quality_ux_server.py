"""Run on the integrated, isolated test site after installing the File.validate hook."""

import io
from unittest.mock import patch

import frappe
from PIL import Image

from lms.lms.media import upload
from lms.lms.statistics import get_statistics, get_statistics_records
from lms.lms.test_helpers import BaseTestUtils


class TestQualityServer(BaseTestUtils):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		suffix = frappe.generate_hash(length=10)
		self.author = self._create_user(
			f"qc05-author-{suffix}@example.com", "QC05", "Author", ["Course Creator"]
		)
		self.student = self._create_user(
			f"qc05-student-{suffix}@example.com", "QC05", "Student", ["LMS Student"]
		)
		self.other = self._create_user(
			f"qc05-other-{suffix}@example.com", "QC05", "Other", ["Course Creator"]
		)
		self.course = self._create_course(f"QC05 course {suffix}", self.author.name)
		chapter = self._create_chapter(f"QC05 chapter {suffix}", self.course.name)
		self._create_chapter_reference(self.course.name, chapter.name)
		self.lesson = self._create_lesson(f"QC05 lesson {suffix}", chapter.name, self.course.name)
		self._create_lesson_reference(chapter.name, self.lesson.name)

	def test_students_and_guests_cannot_call_statistics_or_record_lists_directly(self):
		for actor in ("Guest", self.student.name, self.author.name):
			frappe.set_user(actor)
			with self.assertRaises(frappe.PermissionError):
				get_statistics()
			with self.assertRaises(frappe.PermissionError):
				get_statistics_records("users")

	def test_counts_and_drilldown_use_identical_population(self):
		frappe.set_user("Administrator")
		data = get_statistics("", "")
		for metric, count in data["counts"].items():
			page = get_statistics_records(metric, "", "")
			self.assertEqual(page["total"], count)
		self.assertIn("America/Sao_Paulo", data["window"]["timezone"])

	def test_native_file_insertion_cannot_bypass_mime_or_lesson_privacy(self):
		frappe.set_user(self.author.name)
		from pypdf import PdfWriter

		pdf = io.BytesIO()
		writer = PdfWriter()
		writer.add_blank_page(width=100, height=100)
		writer.write(pdf)
		for name, content, private in [
			("forged.png", b"<html>bad</html>", 1),
			("public.pdf", pdf.getvalue(), 0),
		]:
			doc = frappe.get_doc(
				{
					"doctype": "File",
					"file_name": "qc05-" + frappe.generate_hash(length=10) + name,
					"content": content,
					"is_private": private,
					"attached_to_doctype": "Course Lesson",
					"attached_to_name": self.lesson.name,
					"attached_to_field": "content",
				}
			)
			try:
				with self.assertRaises(frappe.ValidationError):
					doc.insert(ignore_permissions=True)
			finally:
				if doc.flags.new_file:
					doc.on_rollback()

	def test_native_avatar_cannot_exceed_processed_limit(self):
		frappe.set_user(self.student.name)
		stream = io.BytesIO()
		Image.effect_noise((2000, 2000), 100).convert("RGB").save(stream, format="PNG")
		self.assertGreater(len(stream.getvalue()), 250 * 1024)
		doc = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": "qc05-" + frappe.generate_hash(length=10) + ".png",
				"content": stream.getvalue(),
				"is_private": 0,
				"attached_to_doctype": "User",
				"attached_to_name": self.student.name,
				"attached_to_field": "user_image",
			}
		)
		try:
			with self.assertRaises(frappe.ValidationError):
				doc.insert(ignore_permissions=True)
		finally:
			if doc.flags.new_file:
				doc.on_rollback()

	def test_wrong_course_upload_is_denied_before_reading_the_stream(self):
		frappe.set_user(self.other.name)
		with self.assertRaises(frappe.PermissionError):
			upload("material", doctype="Course Lesson", docname=self.lesson.name)
