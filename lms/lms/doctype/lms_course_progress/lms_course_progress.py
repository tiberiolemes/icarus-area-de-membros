# Copyright (c) 2021, FOSS United and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from lms.lms.utils import recalculate_course_progress


class LMSCourseProgress(Document):
	def validate(self):
		# Guards updates too; before_insert also calls it so member is bound before the
		# insert-time duplicate check below. The call is idempotent.
		self.enforce_member_ownership()
		self.lock_enrollment()
		from lms.lms.child_content import validate_progress

		validate_progress(self)

	def before_insert(self):
		self.enforce_member_ownership()
		self.lock_enrollment()
		if (
			self.member
			and self.lesson
			and frappe.db.exists("LMS Course Progress", {"member": self.member, "lesson": self.lesson})
		):
			frappe.throw(
				_("Progress is already recorded for this lesson."),
				frappe.UniqueValidationError,
			)

	def check_if_latest(self, *args, **kwargs):
		self.enforce_member_ownership()
		self.lock_enrollment()
		return super().check_if_latest(*args, **kwargs)

	def enforce_member_ownership(self):
		from lms.lms.child_content import is_grading_progress
		from lms.lms.permissions import can_author_course, resolve_lesson_course

		course = resolve_lesson_course(self.lesson)
		if not self.member:
			self.member = frappe.session.user
		if (
			self.member != frappe.session.user
			and not can_author_course(course)
			and not is_grading_progress(self)
		):
			frappe.throw(_("You can only record progress for your own account."), frappe.PermissionError)

	def lock_enrollment(self):
		from lms.lms.child_content import lock_learning_write

		lock_learning_write(self)

	def on_trash(self):
		self.lock_enrollment()
		from lms.lms.child_content import preserve_archived_evidence

		preserve_archived_evidence(self)

	def on_update(self):
		recalculate_course_progress(self.course, self.member)

	def after_delete(self):
		recalculate_course_progress(self.course, self.member)


def on_doctype_update():
	# count_completed_lessons_locked locks one enrolment's progress rows through it.
	frappe.db.add_index("LMS Course Progress", ["member", "course"])
