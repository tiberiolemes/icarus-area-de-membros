import frappe


def execute():
	# Incremental schema only: never seed users, change roles or reset passwords.
	frappe.reload_doc("lms", "doctype", "lms_account_security")
	# Empty source permissions acquire a default on DocType.before_insert.
	# Remove only that exact native grant; never reset unrelated/custom controls.
	for permission in frappe.get_all("DocPerm", filters={"parent": "LMS Account Security"}, fields=["*"]):
		full = ("read", "write", "create", "delete", "report", "export", "share", "print", "email")
		zero = ("permlevel", "if_owner", "submit", "cancel", "amend", "import", "select")
		if (
			permission.role != "System Manager"
			or not all(permission.get(key) == 1 for key in full)
			or any(permission.get(key) for key in zero)
		):
			frappe.throw(
				frappe._(
					"Unexpected permissions on private account security records. Review the security configuration."
				)
			)
		frappe.db.delete("DocPerm", {"name": permission.name})
		frappe.clear_cache(doctype="LMS Account Security")
	# Native reset storage already hashes tokens; require a bounded lifetime.
	expiry = frappe.db.get_single_value("System Settings", "reset_password_link_expiry_duration")
	if not expiry or int(expiry) > 3600:
		# Installation precedes the setup wizard's required language/time zone.
		frappe.db.set_single_value("System Settings", "reset_password_link_expiry_duration", 3600)
