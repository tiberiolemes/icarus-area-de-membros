"""Read-only native timings/counts on the same preserved local courses, no load claim."""

import hashlib
import json
import statistics
import time

import frappe

frappe.init(site="tiberio.localhost", sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
frappe.set_user("Administrator")
try:
	from lms.lms.utils import get_courses

	results = []
	original = frappe.db.sql
	for _ in range(7):
		counts = [0]

		def counted(*args, **kwargs):
			counts[0] += 1
			return original(*args, **kwargs)

		frappe.db.sql = counted
		started = time.perf_counter()
		rows = get_courses(filters={}, start=0, limit_page_length=20)
		elapsed = (time.perf_counter() - started) * 1000
		frappe.db.sql = original
		results.append({"ms": round(elapsed, 3), "queries": counts[0], "rows": len(rows)})
	print(
		json.dumps(
			{
				"case": "native get_courses as Administrator, 7 sequential reads, existing cache",
				"samples": results,
				"median_ms": statistics.median(x["ms"] for x in results),
				"capacity_claim": False,
			}
		)
	)
finally:
	frappe.db.rollback()
	frappe.destroy()
