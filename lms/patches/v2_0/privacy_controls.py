import frappe


def execute():
	# Add only native metadata; never enable signup, approve copy or alter users.
	frappe.reload_doc("lms", "doctype", "lms_privacy_settings")
	frappe.reload_doc("lms", "doctype", "lms_help_feedback")
	frappe.reload_doc("lms", "doctype", "lms_tour_progress")
