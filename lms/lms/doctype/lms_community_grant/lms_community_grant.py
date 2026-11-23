import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, now_datetime


class LMSCommunityGrant(Document):
	def validate(self):
		from lms.lms.community import require_admin

		require_admin()
		if self.is_new():
			self.granted_by = frappe.session.user
		if get_datetime(self.ends_on) <= get_datetime(self.starts_on):
			frappe.throw(_("Access end must be after its start."))
		if not self.is_new():
			old = self.get_doc_before_save()
			for field in (
				"community",
				"member",
				"request_key",
				"starts_on",
				"ends_on",
				"granted_by",
				"reason",
				"owner",
				"creation",
			):
				if self.get(field) != old.get(field):
					frappe.throw(_("Existing grants are immutable. Create a new grant for renewal."))
			if old.revoked_on and any(
				self.get(f) != old.get(f) for f in ("revoked_on", "revoked_by", "revocation_reason")
			):
				frappe.throw(_("A revocation cannot be undone. Create a new grant."))
		if self.revoked_on and (self.is_new() or not old.revoked_on):
			self.revoked_on, self.revoked_by = now_datetime(), frappe.session.user
		if self.revoked_on and (not self.revocation_reason or not self.revoked_by):
			frappe.throw(_("Revocation requires a reason and an administrator."))

	def on_trash(self):
		frappe.throw(_("Community history must be preserved."))
