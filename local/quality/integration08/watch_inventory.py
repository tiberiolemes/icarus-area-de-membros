"""Read-only aggregate preview before adding the video-position identity constraint."""

import json
from collections import Counter

import frappe

frappe.init(site="tiberio.localhost")
frappe.connect()
try:
	rows = frappe.db.get_all("LMS Video Watch Duration", fields=["member", "lesson", "source", "watch_time"])
	identities = Counter((row.member, row.lesson, row.source) for row in rows)
	print(json.dumps({
		"rows": len(rows),
		"exact_duplicate_groups": sum(count > 1 for count in identities.values()),
		"rows_in_exact_duplicates": sum(count for count in identities.values() if count > 1),
		"sources_missing": sum(not row.source for row in rows),
		"source_over_140": sum(len(row.source or "") > 140 for row in rows),
		"source_classes": dict(Counter("local" if (row.source or "").startswith(("/files/", "/private/files/")) else "mediated" if "course_lesson.serve_resource?" in (row.source or "") else "other" for row in rows)),
		"read_only": True,
		"credentials_or_urls_printed": False,
	}, sort_keys=True))
finally:
	frappe.db.rollback()
	frappe.destroy()
