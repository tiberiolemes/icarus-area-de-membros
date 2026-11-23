"""Run inside the existing app image; stdout is private backup metadata only."""

import base64
import hashlib
import json
import sys
from pathlib import Path

SITES = Path("/home/frappe/frappe-bench/sites")
SITE = "tiberio.localhost"


def files():
	result = {}
	roots = [SITES / SITE / kind / "files" for kind in ("public", "private")]
	paths = [SITES / SITE / "site_config.json", SITES / "common_site_config.json", SITES / "apps.txt"]
	for root in roots:
		if not root.is_dir() or root.is_symlink():
			raise ValueError("Missing files directory or symlink")
		for path in root.rglob("*"):
			if path.is_symlink() or not (path.is_file() or path.is_dir()):
				raise ValueError("Unsupported site file")
			if path.is_file():
				paths.append(path)
	for path in paths:
		if path.is_symlink():
			raise ValueError("Configuration symlink")
		with path.open("rb") as stream:
			digest = hashlib.file_digest(stream, "sha256").hexdigest()
		result[path.relative_to(SITES).as_posix()] = {
			"bytes": path.stat().st_size,
			"sha256": digest,
		}
	return result


def encode(value):
	return {"binary": base64.b64encode(value).decode()} if isinstance(value, bytes) else str(value)


def assert_snapshot_engine(engine, count):
	# Frappe's disposable MyISAM log/search tables are allowed only when empty.
	if engine != "InnoDB" and count:
		raise ValueError("Nontransactional table contains data; online backup refused")


def database(*, allow_nontransactional=False):
	import pymysql

	config = json.loads((SITES / "common_site_config.json").read_text())
	config.update(json.loads((SITES / SITE / "site_config.json").read_text()))
	db = pymysql.connect(
		host=config["db_host"],
		user=config.get("db_user") or config["db_name"],
		password=config["db_password"],
		database=config["db_name"],
		charset="utf8mb4",
	)
	result = {}
	try:
		with db.cursor() as cursor:
			cursor.execute("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY")
			cursor.execute(
				"SELECT table_name,engine FROM information_schema.tables WHERE table_schema=DATABASE() "
				"AND table_type='BASE TABLE'"
			)
			engines = dict(cursor.fetchall())
			cursor.execute("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
			tables = [row[0] for row in cursor.fetchall()]
			for table in sorted(tables):
				quoted = "`" + table.replace("`", "``") + "`"
				cursor.execute("SHOW CREATE TABLE " + quoted)
				schema = cursor.fetchone()[1]
				cursor.execute("SELECT * FROM " + quoted)
				rows = [
					hashlib.sha256(
						json.dumps(row, default=encode, ensure_ascii=False, separators=(",", ":")).encode()
					).digest()
					for row in cursor.fetchall()
				]
				if not allow_nontransactional:
					assert_snapshot_engine(engines[table], len(rows))
				result[table] = {
					"count": len(rows),
					"sha256": hashlib.sha256(b"".join(sorted(rows))).hexdigest(),
					"schema_sha256": hashlib.sha256(schema.encode()).hexdigest(),
					"engine": engines[table],
				}
	finally:
		db.rollback()
		db.close()
	return result


def access():
	import frappe

	from lms.lms.permissions import can_access_course, can_access_lesson

	frappe.init(site=SITE)
	frappe.connect()
	try:
		course = "desenvolvimento-com-agentes-de-ia-estudo-inicial"
		student = "aluno@example.test"
		other = "outro@example.test"
		assert frappe.db.exists("LMS Enrollment", {"course": course, "member": student})
		assert not frappe.db.exists("LMS Enrollment", {"course": course, "member": other})
		lessons = frappe.get_all("Course Lesson", filters={"course": course}, pluck="name")
		assert lessons
		first = frappe.db.sql(
			"""SELECT lr.lesson FROM `tabLesson Reference` lr
            JOIN `tabChapter Reference` cr ON cr.chapter=lr.parent
            WHERE cr.parent=%s ORDER BY cr.idx,lr.idx LIMIT 1""",
			(course,),
		)[0][0]
		assert can_access_course(course, user=student)
		assert can_access_lesson(first, user=student)
		assert not can_access_lesson(first, user=other)
		assert not can_access_lesson(first, user="Guest")
		assert any(frappe.db.get_value("Course Lesson", name, "content") for name in lessons)
		assert frappe.db.count("LMS Course Progress", {"course": course, "member": student}) > 0
		files = frappe.get_all("File", filters={"is_folder": 0}, fields=["file_url", "is_private"])
		checked = {"public": 0, "private": 0}
		for row in files:
			url = row.file_url or ""
			if url.startswith("/private/files/") or url.startswith("/files/"):
				relative = url.lstrip("/") if row.is_private else "public/" + url.lstrip("/")
				path = (SITES / SITE / relative).resolve()
				assert path.is_relative_to((SITES / SITE).resolve())
				assert path.is_file() and path.stat().st_size > 0
				checked["private" if row.is_private else "public"] += 1
		assert checked["private"] and checked["public"]
		return {
			"enrolled_allowed": True,
			"unenrolled_denied": True,
			"guest_denied": True,
			"lesson_content_present": True,
			"student_progress_present": True,
			"referenced_files_readable": checked,
		}
	finally:
		frappe.db.rollback()
		frappe.destroy()


if __name__ == "__main__":
	if sys.argv[1] == "snapshot":
		result = {"tables": database(), "files": files()}
	elif sys.argv[1] == "files":
		result = {"files": files()}
	elif sys.argv[1] == "restored-snapshot":
		result = {"tables": database(allow_nontransactional=True), "files": files()}
	elif sys.argv[1] == "access":
		result = access()
	else:
		raise SystemExit("snapshot|access")
	print(json.dumps(result, sort_keys=True))
