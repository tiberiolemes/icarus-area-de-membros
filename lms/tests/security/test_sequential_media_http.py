"""Native WSGI/DB/download acceptance; only the explicitly segregated, muted site."""

import json
import os
import secrets
import unittest
from urllib.parse import urlencode

import frappe
from frappe.tests.test_api import make_request
from frappe.utils import get_test_client

from lms.lms.test_helpers import BaseTestUtils
from lms.tests.test_coupon_redemption import _delete_committed, _delete_committed_user


class TestSequentialMediaHTTP(unittest.TestCase):
	def test_native_download_and_lesson_http_use_the_same_canonical_authority(self):
		site = frappe.local.site
		self.assertEqual(os.environ.get("QC11_CONCURRENCY_SITE"), site)
		self.assertTrue(site.startswith("test_") and frappe.conf.mute_emails)
		frappe.set_user("Administrator")
		previous_guest_access = frappe.db.get_single_value("LMS Settings", "allow_guest_access")
		fixture = BaseTestUtils
		suffix = secrets.token_hex(8)
		users, files = [], []
		course = chapter = first = future = None
		try:
			for label, roles in (
				("author", ["Course Creator"]),
				("student", ["LMS Student"]),
				("outsider", ["LMS Student"]),
			):
				doc = fixture._create_user(f"qc08-media-{label}-{suffix}@example.test", "HTTP", label, roles)
				doc.api_key, doc.api_secret = secrets.token_hex(16), secrets.token_hex(24)
				doc.save()
				users.append((doc.name, "token " + doc.api_key + ":" + doc.get_password("api_secret")))
			author, student, outsider = users
			course = fixture._create_course("QC08 HTTP Media " + suffix, author[0])
			chapter = fixture._create_chapter("QC08 HTTP Chapter " + suffix, course.name)
			first = fixture._create_outline_lesson("QC08 HTTP First " + suffix, chapter.name, course.name)
			future = fixture._create_outline_lesson("QC08 HTTP Future " + suffix, chapter.name, course.name)
			fixture._create_enrollment(student[0], course.name)
			frappe.db.set_value("LMS Course", course.name, "enforce_lesson_completion", 1)
			frappe.db.set_value(
				"Course Lesson", future.name, "instructor_notes", "QC08 instructor secret " + suffix
			)

			def attach(label, owner, lesson=None, field="content"):
				frappe.set_user(owner)
				row = frappe.get_doc(
					{
						"doctype": "File",
						"file_name": f"qc08-{label}-{suffix}.txt",
						"is_private": 1,
						"content": "QC08 bytes " + label + " " + suffix,
						"attached_to_doctype": "Course Lesson" if lesson else None,
						"attached_to_name": lesson.name if lesson else None,
						"attached_to_field": field if lesson else None,
					}
				).insert(ignore_permissions=True)
				files.append(row)
				frappe.set_user("Administrator")
				return row

			def embed(lesson, url, field="content"):
				frappe.db.set_value(
					"Course Lesson",
					lesson.name,
					field,
					json.dumps({"blocks": [{"type": "upload", "data": {"file_url": url}}]}),
				)

			media = attach("future", author[0], future)
			instructor = attach("instructor", author[0], first, "instructor_content")
			personal = attach("personal", student[0])
			embed(future, media.file_url)
			embed(first, instructor.file_url, "instructor_content")
			frappe.db.commit()

			def request(actor, path, *, data=None):
				client = get_test_client()
				headers = {"Authorization": actor[1]} if actor else {}
				return make_request(
					client.post if data is not None else client.get,
					args=("http://" + site + path,),
					kwargs={"headers": headers, **({"json": data} if data is not None else {})},
					site=site,
				)

			def custom(row):
				return "/api/method/lms.lms.doctype.course_lesson.course_lesson.serve_resource?" + urlencode(
					{"file_url": row.file_url}
				)

			def lesson(actor):
				return request(
					actor,
					"/api/method/lms.lms.utils.get_lesson?"
					+ urlencode({"course": course.name, "chapter": 1, "lesson": 2}),
				)

			for actor in (student, outsider, None):
				for path in (media.file_url, custom(media)):
					self.assertGreaterEqual(request(actor, path).status_code, 400)
			self.assertEqual(lesson(student).json["message"]["locked"], 1)
			self.assertEqual(request(author, media.file_url).get_data(), media.get_content().encode())
			for actor in (student, outsider):
				metadata = request(actor, "/api/resource/Course%20Lesson/" + future.name)
				self.assertGreaterEqual(metadata.status_code, 400)
				self.assertNotIn("QC08 instructor secret", metadata.get_data(as_text=True))
			# Native insertion refuses a blocked student's forged metadata before we
			# seed a historical forged/shared row to test the download boundary itself.
			forged = request(
				student,
				"/api/resource/File",
				data={"file_name": media.file_name, "file_url": media.file_url, "is_private": 1},
			)
			self.assertGreaterEqual(forged.status_code, 400)
			frappe.db.rollback()
			frappe.set_user("Administrator")
			duplicate = frappe.get_doc(
				{"doctype": "File", "file_name": media.file_name, "file_url": media.file_url, "is_private": 1}
			).insert(ignore_permissions=True)
			duplicate.db_set("owner", student[0])
			files.append(duplicate)
			frappe.share.add("File", duplicate.name, outsider[0], read=1)
			frappe.db.commit()
			for actor in (student, outsider):
				self.assertGreaterEqual(
					request(actor, media.file_url + "?fid=" + duplicate.name).status_code, 400
				)
			# Multiple legitimate references: the open first lesson releases the same
			# bytes, and removing that reference restores the sequence gate.
			embed(first, media.file_url)
			frappe.db.commit()
			self.assertEqual(request(student, media.file_url).status_code, 200)
			frappe.db.set_value("Course Lesson", first.name, "content", "")
			frappe.db.commit()
			self.assertGreaterEqual(request(student, media.file_url).status_code, 400)
			progress = request(
				student,
				"/api/method/lms.lms.doctype.course_lesson.course_lesson.save_progress",
				data={"lesson": first.name, "course": course.name},
			)
			self.assertEqual(progress.status_code, 200, progress.json)
			for path in (media.file_url, custom(media)):
				response = request(student, path)
				self.assertEqual(response.status_code, 200)
				self.assertEqual(response.get_data(), media.get_content().encode())
			opened = lesson(student)
			self.assertEqual(opened.status_code, 200)
			self.assertNotIn("QC08 instructor secret", opened.get_data(as_text=True))
			self.assertNotIn(instructor.file_url, opened.get_data(as_text=True))
			for path in (instructor.file_url, custom(instructor)):
				self.assertGreaterEqual(request(student, path).status_code, 400)
				self.assertEqual(request(author, path).status_code, 200)
			self.assertEqual(request(student, personal.file_url).status_code, 200)
			self.assertGreaterEqual(request(outsider, personal.file_url).status_code, 400)
			frappe.db.rollback()
			frappe.db.set_single_value("LMS Settings", "allow_guest_access", 1)
			frappe.clear_document_cache("LMS Settings", "LMS Settings")
			frappe.db.set_value("Course Lesson", future.name, "include_in_preview", 1)
			frappe.db.commit()
			self.assertEqual(request(None, custom(media)).status_code, 200)
			self.assertGreaterEqual(request(None, media.file_url).status_code, 400)
		finally:
			frappe.db.rollback()
			frappe.set_user("Administrator")
			for row in reversed(files):
				frappe.db.delete("DocShare", {"share_doctype": "File", "share_name": row.name})
				if frappe.db.exists("File", row.name):
					_delete_committed("File", row.name)
			if course:
				for doctype in ("LMS Course Progress", "LMS Enrollment"):
					frappe.db.delete(doctype, {"course": course.name})
			for doctype, row in (
				("Course Lesson", first),
				("Course Lesson", future),
				("Course Chapter", chapter),
				("LMS Course", course),
			):
				if row:
					for field in frappe.get_meta(doctype).get_table_fields():
						frappe.db.delete(field.options, {"parent": row.name, "parenttype": doctype})
					frappe.db.delete(doctype, {"name": row.name})
			for name, _ in users:
				_delete_committed_user(name)
			frappe.db.set_single_value("LMS Settings", "allow_guest_access", previous_guest_access)
			frappe.clear_document_cache("LMS Settings", "LMS Settings")
			frappe.db.commit()
