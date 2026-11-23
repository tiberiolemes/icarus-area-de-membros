import frappe
from frappe import _
from frappe.model.document import Document


class LMSDiscussionDecision(Document):
	def validate(self):
		from lms.lms.moderation import _transition

		if not self.is_new() or not _transition.get():
			frappe.throw(_("Moderation records are immutable."), frappe.PermissionError)

	def on_trash(self):
		frappe.throw(_("Moderation records are immutable."))
