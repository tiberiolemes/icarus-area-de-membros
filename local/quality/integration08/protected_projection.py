"""Hash original business columns before/after migration, without new-field noise."""

import base64
import hashlib
import json
import sys
from pathlib import Path

import pymysql

sites = Path("/home/frappe/frappe-bench/sites")
config = json.loads((sites / "common_site_config.json").read_text())
config.update(json.loads((sites / "tiberio.localhost/site_config.json").read_text()))
db = pymysql.connect(
	host=config["db_host"],
	user=config.get("db_user") or config["db_name"],
	password=config["db_password"],
	database=config["db_name"],
	charset="utf8mb4",
)
plan = json.load(sys.stdin)


def encoded(value):
	return {"bytes": base64.b64encode(value).decode()} if isinstance(value, bytes) else str(value)


try:
	with db.cursor() as cursor:
		if not plan:
			cursor.execute("SHOW TABLES")
			tables = [row[0] for row in cursor.fetchall()]
			selected = {
				"tabHas Role",
				"tabUser",
				"__Auth",
				"tabFile",
				"tabCourse Instructor",
				"tabLMS Content Author",
				"tabCourse Chapter",
				"tabCourse Lesson",
				"tabChapter Reference",
				"tabLesson Reference",
				"tabDiscussion Topic",
				"tabDiscussion Reply",
			}
			plan = {}
			for table in tables:
				if table in selected or table.startswith("tabLMS "):
					cursor.execute("SHOW COLUMNS FROM `" + table.replace("`", "``") + "`")
					plan[table] = [row[0] for row in cursor.fetchall()]
		result = {}
		for table, columns in sorted(plan.items()):
			assert all(isinstance(value, str) and "`" not in value for value in [table, *columns])
			cursor.execute(
				"SELECT " + ",".join("`" + value + "`" for value in columns) + " FROM `" + table + "`"
			)
			rows = [
				hashlib.sha256(json.dumps(row, default=encoded, ensure_ascii=False).encode()).digest()
				for row in cursor.fetchall()
			]
			result[table] = {"count": len(rows), "sha256": hashlib.sha256(b"".join(sorted(rows))).hexdigest()}
		print(json.dumps({"original_columns": plan, "tables": result}))
finally:
	db.rollback()
	db.close()
