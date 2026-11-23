"""Actual source policies with boundary doubles; no product runtime or persistent database.

Optional pinned-PyPika SQL tests use the framework's exact source dependency on PYTHONPATH.
SQLite here validates query logic, not MariaDB locks, HTTP or Frappe persistence.
"""

import ast
import copy
import json
import sqlite3
import unittest
from contextvars import ContextVar
from datetime import datetime, timedelta
from html import escape
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 11, 21, 12)


class Row(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__


class Denied(Exception):
	pass


def throw(message, exception=Denied):
	raise exception(message)


def native_date(value):
	return value if isinstance(value, datetime) else datetime.fromisoformat(value)


def load(relative, names, env, *, cls=None):
	"""Strip imports/decorators only: each named boundary is supplied explicitly below."""
	tree = ast.parse((ROOT / relative).read_text())
	nodes = (
		tree.body
		if not cls
		else next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == cls).body
	)
	selected = [n for n in nodes if isinstance(n, ast.FunctionDef) and n.name in names]
	assert {n.name for n in selected} == set(names)

	class Boundaries(ast.NodeTransformer):
		def visit_ImportFrom(self, node):
			return None

	for node in selected:
		node.decorator_list = []
		Boundaries().visit(node)
	exec(
		compile(ast.fix_missing_locations(ast.Module(body=selected, type_ignores=[])), relative, "exec"), env
	)
	return env


def base_env():
	return dict(
		frappe=SimpleNamespace(session=Row(user="author"), throw=throw, PermissionError=Denied),
		_=lambda s: s,
		cint=lambda v: int(v or 0),
		get_datetime=native_date,
		now_datetime=lambda: NOW,
		json=json,
		escape_html=escape,
		_transition=ContextVar("test_archive", default=None),
		CHILDREN={"Course Lesson", "Course Chapter"},
	)


class TestTemporalCurriculum(unittest.TestCase):
	def setUp(self):
		self.env = load("lms/child_content.py", ["archive_allows_member"], base_env())
		self.allow = self.env["archive_allows_member"]

	def test_strict_before_equal_after(self):
		self.assertTrue(self.allow(1, NOW, NOW - timedelta(microseconds=1)))
		self.assertFalse(self.allow(1, NOW, NOW))
		self.assertFalse(self.allow(1, NOW, NOW + timedelta(microseconds=1)))

	def test_unknown_invalid_and_future_cutoffs_fail_closed(self):
		for cutoff in (None, "invalid", NOW + timedelta(seconds=1)):
			with self.subTest(cutoff=cutoff):
				self.assertFalse(self.allow(1, cutoff, NOW - timedelta(days=1)))
		self.assertFalse(self.allow(1, NOW, None))

	def test_active_preview_has_no_enrollment_requirement(self):
		self.assertTrue(self.allow(0, None, None))

	def test_parent_and_child_cutoffs_compose_and_no_reference_denies(self):
		e = self.env
		lesson = Row(chapter="chapter", is_archived=1, archived_on=NOW - timedelta(hours=1))
		chapter = Row(course="course", is_archived=1, archived_on=NOW)
		created = NOW - timedelta(hours=2)
		e.update(
			can_author_course=lambda *a, **k: False,
			enrollment_creation=lambda *a: created,
			curriculum_rows=lambda *a, **k: [Row(name="lesson")],
		)
		e["frappe"].db = SimpleNamespace(
			get_value=lambda doctype, *a, **k: lesson if doctype == "Course Lesson" else chapter
		)
		load("lms/child_content.py", ["lesson_is_eligible"], e)
		self.assertTrue(e["lesson_is_eligible"]("lesson", user="student"))
		created = NOW - timedelta(minutes=30)
		self.assertFalse(e["lesson_is_eligible"]("lesson", user="student"))
		created = NOW - timedelta(hours=2)
		e["curriculum_rows"] = lambda *a, **k: []
		self.assertFalse(e["lesson_is_eligible"]("lesson", user="student"))

	def test_author_management_does_not_reclassify_member_curriculum(self):
		e = self.env
		e.update(
			can_author_course=lambda *a, **k: True,
			enrollment_creation=lambda *a: None,
			curriculum_rows=lambda *a, **k: [],
		)
		e["frappe"].db = SimpleNamespace(
			get_value=lambda *a, **k: Row(course="course", is_archived=1, archived_on=NOW)
		)
		load("lms/child_content.py", ["chapter_is_eligible"], e)
		self.assertTrue(e["chapter_is_eligible"]("chapter"))
		self.assertFalse(e["chapter_is_eligible"]("chapter", as_member=True))


class TestArchiveAndNativeGuards(unittest.TestCase):
	def setUp(self):
		self.env = base_env()
		self.course_archived, self.chapter_archived = 0, 0
		self.saves, self.logs, self.events = [], [], []
		self.doc = Row(
			doctype="Course Lesson",
			name="lesson",
			course="course",
			chapter="chapter",
			is_archived=0,
			archived_on=None,
			content="original",
			assessments=[Row(name="assessment-id")],
		)
		self.doc.save = lambda **k: self.saves.append(copy.deepcopy(dict(self.doc)))
		self.env.update(
			_require_author=lambda c: self.events.append(("course_lock", c)), _course_for=lambda d: "course"
		)
		self.env["frappe"].db = SimpleNamespace(get_value=self.value)
		self.env["frappe"].get_doc = self.get_doc
		load(
			"lms/child_content.py",
			["set_child_archived", "transition_authorized", "validate_child", "validate_outline_parent"],
			self.env,
		)

	def value(self, doctype, name, field, **kwargs):
		if isinstance(field, list):
			return Row(course="course", chapter="chapter")
		if field == "course":
			return "course"
		return self.course_archived if doctype == "LMS Course" else self.chapter_archived

	def get_doc(self, *args, **kwargs):
		if isinstance(args[0], dict):
			return SimpleNamespace(insert=lambda **k: self.logs.append(args[0]))
		self.events.append(("child_lock", args[1]))
		return self.doc

	def archive(self, state=True, chapter=None):
		return self.env["set_child_archived"]("Course Lesson", "lesson", state, chapter=chapter)

	def test_archive_preserves_identity_content_and_placements_and_is_idempotent(self):
		result = self.archive()
		self.assertEqual(result["archived_on"], NOW)
		self.assertEqual(self.doc.content, "original")
		self.assertEqual(self.doc.assessments[0].name, "assessment-id")
		self.env["now_datetime"] = lambda: NOW + timedelta(days=1)
		self.archive()
		self.assertEqual(self.doc.archived_on, NOW)
		self.assertEqual(len(self.saves), 1)
		self.assertEqual(len(self.logs), 1)
		self.assertEqual(self.events[:2], [("course_lock", "course"), ("child_lock", "lesson")])

	def test_restore_requires_active_ancestors_and_never_restores_parent(self):
		self.archive()
		self.chapter_archived = 1
		with self.assertRaises(Denied):
			self.archive(False)
		self.chapter_archived = 0
		self.course_archived = 1
		with self.assertRaises(Denied):
			self.archive(False)
		self.course_archived = 0
		self.archive(False)
		self.assertIsNone(self.doc.archived_on)
		self.assertEqual(self.chapter_archived, 0)
		self.assertEqual(len(self.saves), 2)

	def test_forged_chapter_and_missing_cutoff_do_not_transition(self):
		with self.assertRaises(Denied):
			self.archive(chapter="foreign")
		self.doc.is_archived = 1
		with self.assertRaises(Denied):
			self.archive()
		self.assertFalse(self.saves)

	def test_generic_state_and_parent_edits_do_not_accept_flags(self):
		old = Row(self.doc)
		self.doc.is_new = lambda: False
		self.doc.get_doc_before_save = lambda: old
		self.doc.flags = Row(ignore_permissions=True, in_test=True, allow_archive=True)
		self.env["effective_archived"] = lambda *a, **k: False
		self.doc.is_archived = 1
		with self.assertRaises(Denied):
			self.env["validate_child"](self.doc)
		self.doc.is_archived = 0
		self.doc.chapter = "foreign"
		with self.assertRaises(Denied):
			self.env["validate_child"](self.doc)

	def test_parent_save_cannot_erase_or_retarget_a_child_reference(self):
		old = Row(lessons=[Row(name="reference-id", lesson="lesson", idx=1)])
		parent = Row(
			doctype="Course Chapter", lessons=[], is_new=lambda: False, get_doc_before_save=lambda: old
		)
		self.env["validate_reference"] = lambda *a, **k: None
		for rows in ([], [Row(name="reference-id", lesson="foreign", idx=1)]):
			parent.lessons = rows
			with self.assertRaises(Denied):
				self.env["validate_outline_parent"](parent)
		parent.lessons = old.lessons
		self.env["validate_outline_parent"](parent)

	def test_enrollment_timestamp_is_captured_after_course_lock(self):
		events = []
		doc = Row(
			enforce_member_ownership=lambda: None,
			validate_duplicate_enrollment=lambda: events.append("course_lock"),
			validate_course_enrollment_eligibility=lambda: None,
			validate_owner=lambda: None,
			creation=NOW - timedelta(days=100),
		)
		self.env.update(
			validate_new_enrollment=lambda d: events.append("archive_guard"),
			now_datetime=lambda: events.append("server_now") or NOW,
		)
		load("lms/doctype/lms_enrollment/lms_enrollment.py", ["before_insert"], self.env, cls="LMSEnrollment")
		self.env["before_insert"](doc)
		self.assertEqual(events, ["course_lock", "archive_guard", "server_now"])
		self.assertEqual(doc.creation, NOW)

	def test_enrollment_creation_immutable_including_privileged_actor(self):
		self.env["frappe"].db = SimpleNamespace(get_value=lambda *a, **k: NOW)
		self.env["validate_identity_unchanged"] = lambda *a: None
		self.env["IDENTITY_FIELDS"] = ()
		load("lms/doctype/lms_enrollment/lms_enrollment.py", ["validate"], self.env, cls="LMSEnrollment")
		doc = Row(
			doctype="LMS Enrollment",
			name="e",
			creation=NOW - timedelta(seconds=1),
			is_new=lambda: False,
			enforce_server_managed_fields=lambda: None,
			flags=Row(ignore_permissions=True),
		)
		with self.assertRaises(Denied):
			self.env["validate"](doc)
		doc.creation = NOW
		self.env["validate"](doc)


class TestProgressAndCertificates(unittest.TestCase):
	def setUp(self):
		self.env = base_env()
		self.env["frappe"].session.user = "student"
		self.env["frappe"].db = SimpleNamespace(exists=lambda *a, **k: True, get_value=lambda *a, **k: 1)
		self.env.update(
			resolve_lesson_course=lambda l: "course",
			can_author_course=lambda c: False,
			is_grading_progress=lambda d: False,
			lesson_is_eligible=lambda *a, **k: True,
			resolve_lesson_access=lambda *a, **k: (False, True),
		)
		load("lms/child_content.py", ["validate_progress"], self.env)
		self.doc = Row(
			doctype="LMS Course Progress",
			lesson="lesson",
			course="course",
			member="student",
			is_new=lambda: True,
		)

	def test_correct_enrolled_learner_can_record_progress(self):
		self.env["validate_progress"](self.doc)

	def test_wrong_actor_and_forged_course_are_denied(self):
		self.doc.member = "other"
		with self.assertRaises(Denied):
			self.env["validate_progress"](self.doc)
		self.doc.member, self.doc.course = "student", "foreign"
		with self.assertRaises(Denied):
			self.env["validate_progress"](self.doc)

	def test_excluded_or_sequentially_locked_lesson_denies_complete(self):
		self.env["lesson_is_eligible"] = lambda *a, **k: False
		with self.assertRaises(Denied):
			self.env["validate_progress"](self.doc)
		self.env["lesson_is_eligible"] = lambda *a, **k: True
		self.env["resolve_lesson_access"] = lambda *a, **k: (False, False)
		with self.assertRaises(Denied):
			self.env["validate_progress"](self.doc)

	def test_existing_progress_cannot_be_rehomed(self):
		self.doc.is_new = lambda: False
		self.doc.get_doc_before_save = lambda: Row(lesson="other", course="course", member="student")
		with self.assertRaises(Denied):
			self.env["validate_progress"](self.doc)

	def test_both_certificate_entry_points_recount_instead_of_cache100(self):
		self.env.update(
			get_course_progress=lambda course, member, **kw: 50,
			curriculum_rows=lambda *a, **k: [Row(name="a"), Row(name="b")],
		)
		load(
			"lms/doctype/lms_certificate/lms_certificate.py", ["validate_certification_eligibility"], self.env
		)
		load(
			"lms/doctype/lms_certificate/lms_certificate.py",
			["validate_course_enrollment"],
			self.env,
			cls="LMSCertificate",
		)
		for progress in (0, 50, 100):
			self.env["get_course_progress"] = lambda course, member, **kw: progress
			for check in (
				lambda: self.env["validate_certification_eligibility"]("course"),
				lambda: self.env["validate_course_enrollment"](Row(course="course", member="student")),
			):
				if progress < 100:
					with self.assertRaises(Denied):
						check()
				else:
					check()

	def test_certificate_uses_the_recipient_and_denies_zero_curriculum(self):
		members = []
		self.env.update(
			get_course_progress=lambda c, m, **kw: members.append((m, kw)) or 100,
			curriculum_rows=lambda *a, **k: [Row(name="a")],
		)
		load(
			"lms/doctype/lms_certificate/lms_certificate.py",
			["validate_course_enrollment"],
			self.env,
			cls="LMSCertificate",
		)
		doc = Row(course="course", member="actual-recipient")
		self.env["validate_course_enrollment"](doc)
		self.assertEqual(members, [("actual-recipient", {"for_update": True})])
		self.env["curriculum_rows"] = lambda *a, **k: []
		with self.assertRaises(Denied):
			self.env["validate_course_enrollment"](doc)

	def test_issued_certificate_edit_does_not_revalidate_completion(self):
		calls = []
		load("lms/doctype/lms_certificate/lms_certificate.py", ["validate"], self.env, cls="LMSCertificate")
		doc = Row(
			is_new=lambda: False,
			has_value_changed=lambda f: False,
			validate_criteria=lambda: calls.append("criteria"),
			validate_duplicate_certificate=lambda: calls.append("duplicates"),
		)
		self.env["validate"](doc)
		self.assertEqual(calls, ["duplicates"])

	def test_import_drops_client_state_and_flags(self):
		load("lms/course_import_export.py", ["drop_archive_fields"], self.env)
		data = dict(
			title="portable",
			is_archived=1,
			archived_on=str(NOW),
			effective_is_archived=1,
			flags={"purge": True},
			creation=str(NOW),
		)
		self.env["drop_archive_fields"](data)
		self.assertEqual(data, {"title": "portable"})


class TestFileAndContinuation(unittest.TestCase):
	def setUp(self):
		self.env = base_env()
		self.refs, self.archived, self.purge = [("lesson", False)], True, False
		self.env.update(
			effective_archived=lambda *a, **k: self.archived,
			is_course_purge_authorized=lambda c: self.purge,
			course_purge_in_progress=lambda: self.purge,
			_references_vouched_by_owner=lambda refs: refs,
			_resolve_lesson_references=lambda url: self.refs,
			resolve_lesson_course=lambda name: "course",
		)
		self.env["frappe"].db = SimpleNamespace(get_value=lambda *a, **k: "course")
		self.env["frappe"].get_all = lambda *a: []
		self.env["frappe"].get_doc = lambda doctype, name, **kwargs: Row(
			doctype=doctype, name=name, course="course", chapter="chapter"
		)
		load("lms/lesson_files.py", ["preserve_file_history"], self.env)
		self.doc = Row(
			name="file",
			file_url="/private/files/lesson.txt",
			attached_to_doctype=None,
			is_new=lambda: False,
			get_doc_before_save=lambda: None,
		)

	def test_archived_canonical_bytes_are_frozen_even_for_owner(self):
		for deleting in (True, False):
			with self.assertRaises(Denied):
				self.env["preserve_file_history"](self.doc, deleting=deleting)

	def test_unvouched_private_file_keeps_native_policy(self):
		self.refs = []
		self.env["preserve_file_history"](self.doc, deleting=True)

	def test_only_private_course_purge_context_can_remove_archived_bytes(self):
		self.purge = True
		self.env["preserve_file_history"](self.doc, deleting=True)

	def test_continuation_uses_an_eligible_reference_instead_of_first_unfiltered_reference(self):
		self.env.update(
			can_author_course=lambda c: False,
			curriculum_rows=lambda *a, **k: [Row(chapter_idx=3, lesson_idx=5)],
		)
		load("lms/utils.py", ["get_lesson_index"], self.env)
		self.assertEqual(self.env["get_lesson_index"]("lesson"), "3-5")
		self.env["curriculum_rows"] = lambda *a, **k: []
		self.assertIsNone(self.env["get_lesson_index"]("lesson"))

	def test_enrollment_update_locks_persisted_course_then_delegates_native_version_check(self):
		events = []

		class Native:
			def check_if_latest(self, *args, **kwargs):
				events.append(("native_version_check", args, kwargs))
				return "native-result"

			def is_new(self):
				return False

		def value(doctype, name, field, **kwargs):
			if kwargs.get("for_update"):
				events.append(("lock", name))
			return "real-course"

		self.env["Document"] = Native
		self.env["frappe"].db.get_value = value
		tree = ast.parse((ROOT / "lms/doctype/lms_enrollment/lms_enrollment.py").read_text())
		cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "LMSEnrollment")
		cls.body = [n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "check_if_latest"]
		exec(
			compile(ast.Module(body=[cls], type_ignores=[]), "enrollment-native-extension", "exec"), self.env
		)
		doc = self.env["LMSEnrollment"]()
		doc.doctype, doc.name, doc.course = "LMS Enrollment", "e", "forged-course"
		self.assertEqual(doc.check_if_latest("sentinel", native=True), "native-result")
		self.assertEqual(
			events, [("lock", "real-course"), ("native_version_check", ("sentinel",), {"native": True})]
		)


try:
	from pypika import Case, Query, Table
	from pypika import functions as fn
	from pypika.enums import Order
	from pypika.terms import Function, LiteralValue, Term
except ImportError:
	Query = None


@unittest.skipIf(Query is None, "Pinned framework PyPika source not on PYTHONPATH")
class TestCurriculumSQL(unittest.TestCase):
	def setUp(self):
		self.db = sqlite3.connect(":memory:")
		self.addCleanup(self.db.close)
		for table, fields in {
			"LMS Enrollment": "name,member,course,creation",
			"Chapter Reference": "name,parent,parenttype,chapter,idx,parentfield",
			"Course Chapter": "name,course,is_archived,archived_on",
			"Lesson Reference": "name,parent,parenttype,lesson,idx,parentfield",
			"Course Lesson": "name,chapter,is_archived,archived_on",
			"LMS Course Progress": "name,member,course,lesson,status,creation",
		}.items():
			self.db.execute(f'create table "tab{table}" ({fields})')
		self.env = base_env()
		self.env.update(Case=Case, fn=fn, Term=Term, LiteralValue=LiteralValue, Function=Function)
		self.env["frappe"].qb = SimpleNamespace(DocType=lambda name: Table("tab" + name), from_=Query.from_)
		self.env["frappe"].db = SimpleNamespace(escape=lambda s: "'" + s.replace("'", "''") + "'")
		load("lms/child_content.py", ["archive_condition", "curriculum_progress_query"], self.env)
		for member, created in (
			("old", NOW - timedelta(seconds=1)),
			("new", NOW + timedelta(seconds=1)),
			("equal", NOW),
		):
			self.insert("LMS Enrollment", (member, member, "course", str(created)))
		self.insert("Chapter Reference", ("cr", "course", "LMS Course", "chapter", 1, "chapters"))
		self.insert("Course Chapter", ("chapter", "course", 0, None))
		for name, archived, cutoff, idx in (("a", 0, None, 1), ("b", 1, str(NOW), 2)):
			self.insert("Course Lesson", (name, "chapter", archived, cutoff))
			self.insert("Lesson Reference", ("lr" + name, "chapter", "Course Chapter", name, idx, "lessons"))
		for member in ("old", "new", "equal"):
			self.insert("LMS Course Progress", ("p" + member, member, "course", "a", "Complete", str(NOW)))

	def insert(self, table, values):
		self.db.execute(f'insert into "tab{table}" values ({",".join("?" for _ in values)})', values)

	def rows(self, query=None):
		query = query or self.env["curriculum_progress_query"](["course"])
		cursor = self.db.execute(query.get_sql())
		return [Row(zip((c[0] for c in cursor.description), row, strict=True)) for row in cursor]

	def test_distinct_denominators_and_strict_equality_in_actual_query(self):
		rows = {row.member: row for row in self.rows()}
		self.assertEqual(
			(rows["old"].total_lessons, rows["old"].lessons_completed, rows["old"].progress), (2, 1, 50)
		)
		for member in ("new", "equal"):
			self.assertEqual(
				(rows[member].total_lessons, rows[member].lessons_completed, rows[member].progress),
				(1, 1, 100),
			)

	def test_duplicate_legitimate_references_do_not_inflate_evidence(self):
		self.insert("Lesson Reference", ("duplicate", "chapter", "Course Chapter", "a", 3, "lessons"))
		row = next(row for row in self.rows() if row.member == "old")
		self.assertEqual((row.total_lessons, row.lessons_completed), (2, 1))

	def test_parent_cutoff_unknown_and_zero_are_consistent(self):
		self.db.execute('update "tabCourse Chapter" set is_archived=1,archived_on=?', (str(NOW),))
		rows = {row.member: row for row in self.rows()}
		self.assertEqual(rows["new"].progress, 0)
		self.assertEqual(rows["new"].total_lessons, 0)
		self.assertEqual(rows["old"].progress, 50)
		self.db.execute('update "tabCourse Chapter" set archived_on=NULL')
		self.assertTrue(
			all(row.total_lessons == row.lessons_completed == row.progress == 0 for row in self.rows())
		)

	def test_dashboard_order_uses_percentage_before_limit_and_stable_tie(self):
		progress = self.env["curriculum_progress_query"](["course"]).as_("p")
		query = Query.from_(progress).select(progress.member, progress.progress.as_("progress"))
		fields = query._selects
		self.env.update(Order=Order)
		load("lms/dashboard/common.py", ["_student_order"], self.env)
		query = self.env["_student_order"](
			query, fields, SimpleNamespace(name=progress.enrollment, creation=None), "progress", "desc"
		).limit(1)
		self.assertEqual(self.rows(query)[0].member, "new")

	def test_completion_population_statistics_list_and_export_match_without_rewriting_cache(self):
		from pypika.queries import QueryBuilder

		self.db.execute('alter table "tabLMS Enrollment" add member_name')
		self.db.execute('alter table "tabLMS Enrollment" add progress default 100')
		self.db.execute('update "tabLMS Enrollment" set member_name=member')
		self.env["frappe"].qb.asc, self.env["frappe"].qb.desc = Order.asc, Order.desc
		load("lms/child_content.py", ["completed_enrollments_query"], self.env)
		load("lms/statistics.py", ["_completion_query", "_completion_count", "_completion_records"], self.env)
		window = {"lower": None, "upper": NOW + timedelta(days=1)}

		def run(query, as_dict=False):
			cursor = self.db.execute(query.get_sql())
			return (
				[Row(zip((c[0] for c in cursor.description), row, strict=True)) for row in cursor]
				if as_dict
				else cursor.fetchall()
			)

		with patch.object(QueryBuilder, "run", run, create=True):
			self.assertEqual(self.env["_completion_count"](window), 2)
			page, total = self.env["_completion_records"](window, "", "name", "asc", 0, 1)
			self.assertEqual((total, [r.name for r in page]), (2, ["equal"]))
			export, filtered_total = self.env["_completion_records"](window, "new", "name", "asc", 0, 0)
			self.assertEqual((filtered_total, [r.name for r in export]), (1, ["new"]))
			# Restoring expands the current curriculum; cache100 remains historical.
			self.db.execute('update "tabCourse Lesson" set is_archived=0,archived_on=NULL')
			self.assertEqual(self.env["_completion_count"](window), 0)
			self.assertTrue(
				all(value == 100 for (value,) in self.db.execute('select progress from "tabLMS Enrollment"'))
			)

	def test_empty_roster_never_generates_unbounded_member_population(self):
		self.assertEqual(self.rows(self.env["curriculum_progress_query"](["course"], [])), [])

	def test_program_projection_composes_current_course_curricula_without_cached100(self):
		from pypika.queries import QueryBuilder

		self.db.execute('create table "tabLMS Program Course" (name,parent,course)')
		self.db.executemany(
			'insert into "tabLMS Program Course" values (?,?,?)',
			[("pc1", "program", "course"), ("pc2", "program", "not-enrolled")],
		)
		load("lms/child_content.py", ["program_progress"], self.env)

		def run(query, as_dict=False):
			cursor = self.db.execute(query.get_sql())
			return [Row(zip((c[0] for c in cursor.description), row, strict=True)) for row in cursor]

		with patch.object(QueryBuilder, "run", run, create=True):
			self.assertEqual(self.env["program_progress"](["program"], "old"), {"program": 25})
			self.assertEqual(self.env["program_progress"](["program"], "new"), {"program": 50})
			self.db.execute('update "tabCourse Lesson" set is_archived=0,archived_on=NULL')
			self.assertEqual(self.env["program_progress"](["program"], "new"), {"program": 25})

	def test_native_dashboard_facts_and_stages_use_the_real_percentage_query(self):
		for name, columns in {
			"certificates": "member,certificate,issued_on",
			"activity": "member,last_active",
			"requests": "member,requested_on",
		}.items():
			self.db.execute(f'create table "{name}" ({columns})')
		self.env["frappe"]._dict = Row
		self.env.update(
			_certificates_by_member=lambda c: Table("certificates"),
			_last_activity_by_member=lambda c: Table("activity"),
			_certificate_requests_by_member=lambda c: Table("requests"),
		)
		load("lms/dashboard/course.py", ["_enrollment_facts", "_stage_condition"], self.env)
		query, facts = self.env["_enrollment_facts"]("course", [])
		fields = [
			facts.enrollment.member,
			facts.total_lessons.as_("total_lessons"),
			facts.progress.as_("progress"),
		]
		completed = self.rows(
			query.select(*fields).where(self.env["_stage_condition"]("completed", facts, NOW))
		)
		self.assertEqual({row.member for row in completed}, {"new", "equal"})
		started = self.rows(
			query.select(*fields).where(self.env["_stage_condition"]("in_progress", facts, NOW))
		)
		self.assertEqual([(r.member, r.progress, r.total_lessons) for r in started], [("old", 50, 2)])
		self.db.execute('update "tabCourse Chapter" set is_archived=1,archived_on=NULL')
		self.assertEqual(
			self.rows(query.select(*fields).where(self.env["_stage_condition"]("completed", facts, NOW))), []
		)


class TestReportPrecision(unittest.TestCase):
	def test_percent_keeps_precision_and_denominator_guard(self):
		env = base_env()
		load("lms/dashboard/common.py", ["_percent"], env)
		self.assertEqual(env["_percent"](1, 8), 12.5)
		self.assertEqual(env["_percent"](1, 3), 100 / 3)
		for empty in (0, None, ""):
			self.assertIsNone(env["_percent"](1, empty))

	def test_course_and_batch_report_progress_use_two_decimal_places(self):
		for name in ("course", "batch"):
			tree = ast.parse((ROOT / f"lms/dashboard/{name}.py").read_text())
			function = next(
				n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == f"_{name}_analytics"
			)
			table = next(
				n.value for n in ast.walk(function) if isinstance(n, ast.keyword) and n.arg == "table_rows"
			)
			expression = next(
				n
				for n in table.elt.elts
				if isinstance(n, ast.BinOp)
				and any(
					isinstance(t, ast.Subscript)
					and isinstance(t.slice, ast.Constant)
					and t.slice.value == "progress"
					for t in ast.walk(n)
				)
			)
			compiled = compile(ast.Expression(expression), "report-precision", "eval")
			self.assertEqual(
				eval(compiled, {"row": {"progress": 12.5}, "flt": lambda v, digits: round(v, digits)}),
				"12,50%",
			)


if __name__ == "__main__":
	unittest.main()
