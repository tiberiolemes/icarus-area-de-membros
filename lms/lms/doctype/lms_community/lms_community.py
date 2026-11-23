import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class LMSCommunity(Document):
	def validate(self):
		from lms.lms.community import require_admin

		require_admin()
		if not self.is_new() and self.has_value_changed("community_key"):
			frappe.throw(_("Community history must be preserved."))
		if not 1 <= cint(self.term_months) <= 120:
			frappe.throw(_("The community term must be between 1 and 120 months."))

	def on_trash(self):
		frappe.throw(_("Community history must be preserved."))
