import frappe


def execute():
	from lms.lms.video_position import backfill_identities

	frappe.reload_doc("lms", "doctype", "lms_video_watch_duration")
	backfill_identities()
