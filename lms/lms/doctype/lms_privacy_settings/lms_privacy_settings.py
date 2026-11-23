import frappe
from frappe import _
from frappe.model.document import Document


class LMSPrivacySettings(Document):
	def validate(self):
		if not self.publication_approved:
			self.approved_revision = ""
			return
		from lms.lms.privacy import REQUIRED

		missing = [_(label) for field, label in REQUIRED.items() if not (self.get(field) or "").strip()]
		if not (frappe.db.get_single_value("LMS Settings", "custom_signup_content") or "").strip():
			missing.append(_("Terms in LMS Settings / Custom Signup Content"))
		if missing:
			frappe.throw(
				_("Complete these fields before approving public registration: {0}").format(
					", ".join(missing)
				)
			)
		# Compute from the submitted values; get_single otherwise reads persisted data.
		import hashlib
		import json

		values = {field: (self.get(field) or "").strip() for field in REQUIRED}
		values["terms"] = frappe.db.get_single_value("LMS Settings", "custom_signup_content").strip()
		self.approved_revision = hashlib.sha256(
			json.dumps(values, sort_keys=True, ensure_ascii=False).encode()
		).hexdigest()
