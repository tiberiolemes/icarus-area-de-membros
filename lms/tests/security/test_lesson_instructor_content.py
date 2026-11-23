import json

import frappe

from lms.lms.test_helpers import BaseTestUtils
from lms.lms.utils import get_lesson, get_lesson_creation_details

SECRET_MARKER = "ANSWER-KEY-8f21"


def _editorjs(text):
	return json.dumps(
		{
			"time": 1765194986690,
			"blocks": [{"id": "abc123", "type": "markdown", "data": {"text": text}}],
			"version": "2.29.0",
		}
	)


class TestLessonInstructorContentLeak(BaseTestUtils):
	"""get_lesson must not return instructor-only fields to students or preview guests."""

	SECRET_NOTES = "GRADING-NOTES-be-strict"

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		hash = frappe.generate_hash(length=6)
		cls.instructor = cls._create_user(
			f"instr-{hash}@example.com", "Ada", "Instr", ["Course Creator", "Moderator"]
		)
		cls.student = cls._create_user(f"stud-{hash}@example.com", "Sam", "Student", ["LMS Student"])

		cls.course = cls._create_course(title=f"Leak Course {hash}", instructor=cls.instructor.email)
		cls.chapter = cls._create_chapter(f"Chapter {hash}", cls.course.name)
		cls.lesson = cls._create_lesson(f"Lesson {hash}", cls.chapter.name, cls.course.name)
		# Preview + instructor-only content (content fields are EditorJS JSON blobs).
		cls.lesson.include_in_preview = 1
		cls.lesson.instructor_content = _editorjs(SECRET_MARKER)
		cls.lesson.instructor_notes = cls.SECRET_NOTES
		cls.lesson.save()
		cls._create_chapter_reference(cls.course.name, cls.chapter.name, idx=1)
		cls._create_lesson_reference(cls.chapter.name, cls.lesson.name)
		cls._create_enrollment(cls.student.email, cls.course.name)

	def _get(self, user):
		frappe.session.user = user
		try:
			return get_lesson(self.course.name, 1, 1)
		finally:
			frappe.session.user = "Administrator"

	def test_enrolled_student_does_not_receive_instructor_content(self):
		result = self._get(self.student.email)
		self.assertEqual(result.get("title"), self.lesson.title)  # gate passed
		self.assertIsNone(result.get("instructor_content"))
		self.assertIsNone(result.get("instructor_notes"))

	def test_preview_guest_does_not_receive_instructor_content(self):
		frappe.db.set_single_value("LMS Settings", "allow_guest_access", 1)
		result = self._get("Guest")
		self.assertIsNone(result.get("instructor_content"))
		self.assertIsNone(result.get("instructor_notes"))

	def test_instructor_receives_instructor_content(self):
		result = self._get(self.instructor.email)
		self.assertIn(SECRET_MARKER, result.get("instructor_content") or "")
		self.assertEqual(result.get("instructor_notes"), self.SECRET_NOTES)

	def test_only_the_courses_authors_get_the_lesson_creation_details(self):
		other = self._create_user(
			f"other-instr-{frappe.generate_hash(length=6)}@example.com", "Ot", "Her", ["Course Creator"]
		).email
		frappe.set_user(other)
		with self.assertRaises(frappe.PermissionError):
			get_lesson_creation_details(self.course.name, 1, 1)

		frappe.set_user(self.instructor.email)
		details = get_lesson_creation_details(self.course.name, 1, 1)
		self.assertEqual(details["lesson"]["instructor_notes"], self.SECRET_NOTES)

	def test_editor_capability_uses_native_document_permission_without_expanding_it(self):
		creator = self._create_user(
			f"cap-{frappe.generate_hash(length=8)}@example.com", "Own", "Author", ["Course Creator"]
		)
		frappe.set_user(creator.email)
		course = self._create_course("Capability " + frappe.generate_hash(length=8), creator.email)
		chapter = self._create_chapter("Capability chapter", course.name)
		self._create_chapter_reference(course.name, chapter.name)
		own = self._create_lesson("Own capability", chapter.name, course.name)
		self._create_lesson_reference(chapter.name, own.name)
		frappe.set_user("Administrator")
		foreign = self._create_lesson("Other capability", chapter.name, course.name)
		self._create_lesson_reference(chapter.name, foreign.name, idx=2)
		frappe.set_user(creator.email)
		self.assertFalse(frappe.has_permission("Course Lesson", "write", doc=foreign.name))
		details = get_lesson_creation_details(course.name, 1, 2)
		self.assertIs(details["can_edit_lesson"], False)
		self.assertEqual(details["lesson"]["name"], foreign.name)
		self.assertTrue(frappe.has_permission("Course Lesson", "write", doc=own.name))
		self.assertIs(get_lesson_creation_details(course.name, 1, 1)["can_edit_lesson"], True)
		frappe.set_user(self.instructor.email)
		self.assertIs(get_lesson_creation_details(course.name, 1, 2)["can_edit_lesson"], True)
		frappe.set_user("Administrator")
		self.assertIs(get_lesson_creation_details(course.name, 1, 2)["can_edit_lesson"], True)
		frappe.set_user(self.student.email)
		with self.assertRaises(frappe.PermissionError):
			get_lesson_creation_details(course.name, 1, 2)
