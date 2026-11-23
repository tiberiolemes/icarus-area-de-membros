"""Sanitized native schema/hook evidence, no account content or credentials."""

import json
import os

import frappe

site = os.environ.get("QC08_SITE", "test_quality08.localhost")
frappe.init(site=site, sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
frappe.set_user("Administrator")
try:
	from frappe.model.base_document import get_controller

	from lms.patches.v2_0.manual_discussion_community import legacy_preview

	print(
		json.dumps(
			{
				"site": site,
				"legacy_preview": legacy_preview(),
				"moderation_column": frappe.db.has_column("Discussion Topic", "lms_moderation_state"),
				"community_count": frappe.db.count("LMS Community"),
				"file_mro": [cls.__module__ + "." + cls.__name__ for cls in get_controller("File").__mro__],
				"user_mro": [cls.__module__ + "." + cls.__name__ for cls in get_controller("User").__mro__],
				"patches": {
					name: frappe.db.get_value(
						"Patch Log", {"patch": name}, ["patch", "skipped"], as_dict=True
					)
					for name in (
						"lms.patches.v2_0.add_child_archive_state",
						"lms.patches.v2_0.account_security_policy",
						"lms.patches.v2_0.manual_discussion_community",
						"lms.patches.v2_0.privacy_controls",
					)
				},
			},
			default=str,
		)
	)
finally:
	frappe.db.rollback()
	frappe.destroy()
