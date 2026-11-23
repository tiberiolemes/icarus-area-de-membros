# Copyright (c) 2025, Frappe and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from lms.lms.video_position import canonical_source, position_identity, position_snapshot_read, position_time


class LMSVideoWatchDuration(Document):
	def check_if_latest(self, *args, **kwargs):
		from lms.lms.child_content import lock_learning_write

		with position_snapshot_read():
			lock_learning_write(self)
			return super().check_if_latest(*args, **kwargs)

	def before_insert(self):
		from lms.lms.child_content import lock_learning_write

		with position_snapshot_read():
			lock_learning_write(self)

	def validate(self):
		from lms.lms.child_content import lock_learning_write, validate_progress

		with position_snapshot_read():
			lock_learning_write(self)
			validate_progress(self)
			previous = None if self.is_new() else self.get_doc_before_save()
			if previous and self.source != previous.source:
				frappe.throw(frappe._("Video source cannot be changed."), frappe.PermissionError)
			canonical = canonical_source(self.lesson, self.source)
			if self.is_new():
				self.source = canonical
			self.source_identity = position_identity(self.member, self.lesson, canonical)
			seconds = position_time(self.watch_time)
			if previous and seconds < position_time(previous.watch_time):
				frappe.throw(frappe._("Video position cannot move backwards."))

	def on_trash(self):
		from lms.lms.child_content import lock_learning_write, preserve_archived_evidence

		lock_learning_write(self)
		preserve_archived_evidence(self)


def on_doctype_update():
	# Backs the (member, lesson, source) lookup in track_video_watch_duration.
	# Runs on every doctype sync (fresh install + re-sync), so new sites get the
	# index that the one-time patch only adds to existing sites. Idempotent.
	frappe.db.add_index("LMS Video Watch Duration", ["member", "lesson", "source"])
