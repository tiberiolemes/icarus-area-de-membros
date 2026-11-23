"""Tighten native private downloads without replacing Frappe's File permissions."""

import frappe
from frappe import _


def lesson_file_access(file_url: str, *, user: str | None = None) -> bool | None:
	"""None means this URL is outside lesson media and native policy remains in charge."""
	if not isinstance(file_url, str) or not file_url.startswith("/private/files/"):
		return None
	# Local imports keep File/controller/permissions loading acyclic.
	from lms.lms.doctype.course_lesson.course_lesson import (
		_references_vouched_by_owner,
		_resolve_lesson_references,
	)
	from lms.lms.permissions import can_access_lesson

	# An untrusted lesson pasting an unrelated private URL must not confiscate it
	# from its real owner. Only vouched references classify bytes as lesson media.
	candidates = _resolve_lesson_references(file_url)
	if not candidates:
		return None
	references = _references_vouched_by_owner(candidates)
	if not references:
		return None
	return any(
		can_access_lesson(lesson, instructor_only=instructor_only, user=user)
		for lesson, instructor_only in references
	)


def preserve_file_history(doc, *, deleting=False):
	from lms.lms.child_content import effective_archived
	from lms.lms.course_lifecycle import course_purge_in_progress, is_course_purge_authorized
	from lms.lms.doctype.course_lesson.course_lesson import (
		_references_vouched_by_owner,
		_resolve_lesson_references,
	)
	from lms.lms.permissions import resolve_lesson_course

	previous = None if doc.is_new() else doc.get_doc_before_save()
	urls = {row.get("file_url") for row in (doc, previous) if row and row.get("file_url")}
	lessons = set()
	for url in urls:
		if url.startswith("/private/files/"):
			lessons.update(
				name for name, _instructor in _references_vouched_by_owner(_resolve_lesson_references(url))
			)
	# Lock shared courses in one order before any lesson/chapter row.
	chapters = (
		frappe.get_all("Course Chapter", {"scorm_package": doc.name}, ["name", "course"]) if doc.name else []
	)
	lesson_courses = {name: resolve_lesson_course(name) for name in lessons}
	all_courses = set(lesson_courses.values()) | {row.course for row in chapters}
	attached_course = None
	if (
		not deleting
		and doc.attached_to_name
		and doc.attached_to_doctype in ("Course Lesson", "Course Chapter")
	):
		attached_course = (
			resolve_lesson_course(doc.attached_to_name)
			if doc.attached_to_doctype == "Course Lesson"
			else frappe.db.get_value("Course Chapter", doc.attached_to_name, "course")
		)
		if attached_course:
			all_courses.add(attached_course)
	for course in sorted(course for course in all_courses if course):
		frappe.db.get_value("LMS Course", course, "name", for_update=True)
	protected_courses = set()
	for name in sorted(lessons):
		lesson = frappe.get_doc("Course Lesson", name, for_update=True)
		actual = frappe.db.get_value("Course Chapter", lesson.chapter, "course", for_update=True)
		if actual != lesson_courses[name]:
			frappe.throw(_("The content changed. Reload and try again."), frappe.PermissionError)
		if effective_archived(lesson, for_update=True):
			protected_courses.add(actual)
	# SCORM packages are File links, not lesson body URLs.
	for row in sorted(chapters, key=lambda row: row.name):
		chapter = frappe.get_doc("Course Chapter", row.name, for_update=True)
		if chapter.course != row.course:
			frappe.throw(_("The content changed. Reload and try again."), frappe.PermissionError)
		if effective_archived(chapter, for_update=True):
			protected_courses.add(chapter.course)
	if deleting and course_purge_in_progress():
		# A course purge cannot remove the last canonical File of another course.
		protected_courses.update(all_courses)
	if any(not is_course_purge_authorized(course) for course in protected_courses):
		frappe.throw(_("Restore the archived content before changing its files."), frappe.PermissionError)
	if (
		not deleting
		and doc.attached_to_doctype in ("Course Lesson", "Course Chapter")
		and doc.attached_to_name
	):
		parent = frappe.get_doc(doc.attached_to_doctype, doc.attached_to_name, for_update=True)
		actual = (
			parent.course
			if parent.doctype == "Course Chapter"
			else frappe.db.get_value("Course Chapter", parent.chapter, "course", for_update=True)
		)
		if actual != attached_course:
			frappe.throw(_("The content changed. Reload and try again."), frappe.PermissionError)
		if effective_archived(parent, for_update=True):
			frappe.throw(_("Restore the archived content before changing its files."), frappe.PermissionError)


class LessonFileAccess:
	def before_rename(self, *args, **kwargs):
		preserve_file_history(self)
		method = getattr(super(), "before_rename", None)
		return method(*args, **kwargs) if method else None

	def before_insert(self):
		# Native File.before_insert can write bytes before validate runs.
		preserve_file_history(self)
		return super().before_insert()

	def validate(self):
		previous = None if self.is_new() else self.get_doc_before_save()
		fields = (
			"file_url",
			"content_hash",
			"is_private",
			"file_name",
			"attached_to_doctype",
			"attached_to_name",
			"attached_to_field",
		)
		if previous and (
			self.get("content") or any(self.get(field) != previous.get(field) for field in fields)
		):
			preserve_file_history(self)
		return super().validate()

	def on_trash(self):
		preserve_file_history(self, deleting=True)
		return super().on_trash()

	def is_downloadable(self):
		# Frappe's native route calls this directly, bypassing app has_permission hooks.
		request = getattr(frappe.local, "request", None)
		path = getattr(request, "path", "")
		if path.startswith("/private/files/") and path != self.file_url:
			return False
		access = lesson_file_access(self.file_url)
		if access is False:
			frappe.logger("lms.security").warning(
				"Private lesson file download denied: user=%s file=%s", frappe.session.user, self.name
			)
			return False
		if access is True:
			# Canonical media access grants bytes, never generic lesson/instructor fields.
			return True
		return super().is_downloadable()
