"""Native source regressions for the segregated integration08 test site, never study data.

All fixtures use QC11 identities and the native test savepoint rollback. Files are synthetic
and explicitly cleaned. SMTP is mocked, never enabled. No in_test authorization bypass.
"""

from datetime import timedelta
from unittest.mock import patch

import frappe
from frappe.client import delete as client_delete
from frappe.client import insert as client_insert
from frappe.utils import get_datetime, now_datetime

from lms.lms.api import (
	archive_chapter,
	archive_lesson,
	delete_chapter,
	delete_lesson,
	restore_chapter,
	restore_lesson,
	update_lesson_index,
	upsert_chapter,
)
from lms.lms.child_content import curriculum_progress_query, curriculum_rows
from lms.lms.dashboard.course import (
	_course_analytics,
	_course_sheet_row,
	get_course_dashboard_stats,
	get_course_student_detail,
	get_course_students,
)
from lms.lms.doctype.course_lesson.course_lesson import save_progress
from lms.lms.doctype.lms_certificate.lms_certificate import create_certificate
from lms.lms.permissions import can_access_lesson
from lms.lms.test_helpers import BaseTestUtils
from lms.lms.utils import get_course_outline, get_course_progress
from lms.tests.course_lifecycle_helpers import purge_course_fixture


class TestChildContentLifecycle(BaseTestUtils):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		suffix = frappe.generate_hash(length=12)
		self.author = self._create_user(
			f"qc11-author-{suffix}@example.com", "QC11", "Author", ["Course Creator"]
		)
		self.other = self._create_user(
			f"qc11-other-{suffix}@example.com", "QC11", "Other", ["Course Creator"]
		)
		self.old = self._create_user(f"qc11-old-{suffix}@example.com", "QC11", "Old", ["LMS Student"])
		self.new = self._create_user(f"qc11-new-{suffix}@example.com", "QC11", "New", ["LMS Student"])
		self.course = self._create_course(f"QC11 Course {suffix}", self.author.name)
		self.chapter = self._create_chapter(f"QC11 Chapter {suffix}", self.course.name)
		self.chapter_ref = self._create_chapter_reference(self.course.name, self.chapter.name)
		self.a = self._create_lesson(f"QC11 A {suffix}", self.chapter.name, self.course.name)
		self.b = self._create_lesson(f"QC11 B {suffix}", self.chapter.name, self.course.name)
		self.a_ref = self._create_lesson_reference(self.chapter.name, self.a.name)
		self.b_ref = self._create_lesson_reference(self.chapter.name, self.b.name)
		frappe.db.set_value("Lesson Reference", self.b_ref.name, "idx", 2)
		self.old_enrollment = self._create_enrollment(self.old.name, self.course.name)
		# Synthetic clock fixtures only; real rows are never retimestamped by a patch/API.
		self.cutoff = now_datetime() - timedelta(minutes=5)
		frappe.db.set_value(
			"LMS Enrollment", self.old_enrollment.name, "creation", self.cutoff - timedelta(seconds=1)
		)
		with patch("lms.lms.child_content.now_datetime", return_value=self.cutoff):
			archive_lesson(self.b.name)
		self.new_enrollment = self._create_enrollment(self.new.name, self.course.name)

	def snapshot(self):
		return {
			doctype: frappe.get_all(doctype, filters=filters, fields=["*"], order_by="name")
			for doctype, filters in (
				("Lesson Reference", {"parent": self.chapter.name}),
				("Chapter Reference", {"parent": self.course.name}),
				("LMS Enrollment", {"course": self.course.name}),
				("LMS Course Progress", {"course": self.course.name}),
				("LMS Certificate", {"course": self.course.name}),
				(
					"Discussion Topic",
					{"reference_doctype": "Course Lesson", "reference_docname": self.b.name},
				),
			)
		}

	def complete(self, member, lesson):
		frappe.set_user(member)
		try:
			return save_progress(lesson, self.course.name)
		finally:
			frappe.set_user("Administrator")

	def test_old_new_and_equal_cohorts_share_identity_but_not_curriculum(self):
		self.assertEqual(
			[r.name for r in curriculum_rows(self.course.name, self.old.name)], [self.a.name, self.b.name]
		)
		self.assertEqual([r.name for r in curriculum_rows(self.course.name, self.new.name)], [self.a.name])
		frappe.db.set_value("LMS Enrollment", self.new_enrollment.name, "creation", self.cutoff)
		self.assertFalse(can_access_lesson(self.b.name, user=self.new.name))
		self.assertTrue(can_access_lesson(self.b.name, user=self.old.name))
		self.assertTrue(can_access_lesson(self.b.name, user=self.author.name))
		frappe.db.set_value("Course Lesson", self.b.name, "include_in_preview", 1)
		self.assertFalse(can_access_lesson(self.b.name, user="Guest"))

	def test_delete_aliases_preserve_reference_order_content_and_history(self):
		before = self.snapshot()
		body = frappe.db.get_value("Course Lesson", self.b.name, "content")
		frappe.set_user(self.author.name)
		first = delete_lesson(self.b.name, self.chapter.name)
		second = delete_lesson(self.b.name, self.chapter.name)
		self.assertEqual(first["archived_on"], second["archived_on"])
		delete_chapter(self.chapter.name)
		self.assertEqual(self.snapshot(), before)
		self.assertEqual(frappe.db.get_value("Course Lesson", self.b.name, "content"), body)
		self.assertEqual(frappe.db.get_value("Lesson Reference", self.b_ref.name, "idx"), 2)
		self.assertTrue(frappe.db.exists("Course Chapter", self.chapter.name))

	def test_hierarchical_restore_preserves_history_and_leaves_children_archived(self):
		archive_chapter(self.chapter.name)
		before = self.snapshot()
		with self.assertRaises(frappe.PermissionError):
			restore_lesson(self.b.name)
		restore_chapter(self.chapter.name)
		self.assertEqual(frappe.db.get_value("Course Lesson", self.b.name, "is_archived"), 1)
		restore_lesson(self.b.name)
		self.assertEqual(self.snapshot(), before)
		self.assertEqual(frappe.db.get_value("Course Lesson", self.b.name, "name"), self.b.name)

	def test_actor_wrong_parent_flags_and_generic_delete_cannot_bypass(self):
		for actor in (self.old.name, self.new.name, self.other.name, "Guest"):
			frappe.set_user(actor)
			for operation in (
				lambda: archive_lesson(self.b.name),
				lambda: restore_lesson(self.b.name),
				lambda: archive_chapter(self.chapter.name),
				lambda: restore_chapter(self.chapter.name),
			):
				with self.subTest(actor=actor), self.assertRaises(frappe.PermissionError):
					operation()
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.PermissionError):
			delete_lesson(self.b.name, "qc11-foreign-chapter")
		for doctype, name in (
			("Course Lesson", self.b.name),
			("Course Chapter", self.chapter.name),
			("Lesson Reference", self.b_ref.name),
			("Chapter Reference", self.chapter_ref.name),
		):
			for operation in (
				lambda: client_delete(doctype, name),
				lambda: frappe.delete_doc(
					doctype,
					name,
					force=True,
					ignore_permissions=True,
					flags={"allow_purge": True, "in_test": True},
				),
			):
				with self.subTest(doctype=doctype), self.assertRaises(frappe.PermissionError):
					operation()

	def test_generic_state_and_reference_table_removal_are_denied(self):
		for doctype, name, field, value in (
			("Course Lesson", self.a.name, "is_archived", 1),
			("Course Lesson", self.a.name, "archived_on", self.cutoff),
			("Course Chapter", self.chapter.name, "is_archived", 1),
		):
			doc = frappe.get_doc(doctype, name)
			doc.set(field, value)
			with self.assertRaises(frappe.PermissionError):
				doc.save(ignore_permissions=True)
		for doctype, name, field in (
			("Course Chapter", self.chapter.name, "lessons"),
			("LMS Course", self.course.name, "chapters"),
		):
			doc = frappe.get_doc(doctype, name)
			doc.set(field, [])
			with self.assertRaises(frappe.PermissionError):
				doc.save(ignore_permissions=True)

	def test_archive_and_insert_rollback_preserves_cutoffs_and_enrollment_creation(self):
		frappe.db.savepoint("qc11_rollback")
		archive_chapter(self.chapter.name)
		frappe.db.rollback(save_point="qc11_rollback")
		self.assertFalse(frappe.db.get_value("Course Chapter", self.chapter.name, "is_archived"))
		doc = frappe.get_doc("LMS Enrollment", self.new_enrollment.name)
		doc.creation = self.cutoff - timedelta(days=100)
		doc.flags.ignore_permissions = True
		with self.assertRaises(frappe.PermissionError):
			doc.save()
		self.assertGreater(
			get_datetime(frappe.db.get_value("LMS Enrollment", doc.name, "creation")), self.cutoff
		)

	def test_no_cutoff_does_not_grant_learner_access(self):
		frappe.db.set_value("Course Lesson", self.b.name, "archived_on", None)
		self.assertFalse(can_access_lesson(self.b.name, user=self.old.name))
		with self.assertRaises(frappe.ValidationError):
			archive_lesson(self.b.name)
		restore_lesson(self.b.name)
		self.assertTrue(can_access_lesson(self.b.name, user=self.old.name))

	def test_sequence_and_generic_progress_watchtime_keep_real_authority(self):
		frappe.db.set_value("LMS Course", self.course.name, "enforce_lesson_completion", 1)
		self.assertFalse(can_access_lesson(self.b.name, user=self.old.name))
		for doctype in ("LMS Course Progress", "LMS Video Watch Duration"):
			payload = {
				"doctype": doctype,
				"member": self.old.name,
				"course": self.course.name,
				"lesson": self.b.name,
				"status": "Complete",
				"source": "QC11",
				"watch_time": "10",
			}
			frappe.set_user(self.old.name)
			with self.assertRaises(frappe.PermissionError):
				client_insert(payload)
		frappe.set_user("Administrator")
		self.complete(self.old.name, self.a.name)
		self.assertTrue(can_access_lesson(self.b.name, user=self.old.name))
		self.complete(self.old.name, self.b.name)
		self.assertEqual(get_course_progress(self.course.name, self.old.name), 100)
		frappe.set_user(self.other.name)
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc(
				{"doctype": "LMS Course Progress", "lesson": self.a.name, "member": self.new.name}
			).insert(ignore_permissions=True)
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc(
				{
					"doctype": "LMS Course Progress",
					"lesson": self.a.name,
					"member": self.new.name,
					"course": "qc11-forged",
				}
			).insert(ignore_permissions=True)

	def test_archived_edits_moves_and_scorm_replacement_fail_before_extraction(self):
		frappe.set_user(self.author.name)
		with self.assertRaises(frappe.PermissionError):
			update_lesson_index(self.b.name, self.chapter.name, self.chapter.name, 0)
		archive_chapter(self.chapter.name)
		with patch("lms.lms.api.extract_package") as extract:
			with self.assertRaises(frappe.PermissionError):
				upsert_chapter(
					title="QC11 replacement",
					course=self.course.name,
					name=self.chapter.name,
					is_scorm_package=True,
					scorm_package={"name": "qc11-file"},
				)
			extract.assert_not_called()

	def test_legitimate_move_keeps_reference_id_and_cross_course_history_stays(self):
		frappe.set_user(self.author.name)
		update_lesson_index(self.a.name, self.chapter.name, self.chapter.name, 0)
		self.assertEqual(frappe.db.get_value("Lesson Reference", self.a_ref.name, "lesson"), self.a.name)
		other = self._create_course("QC11 target " + frappe.generate_hash(length=12), self.author.name)
		chapter = self._create_chapter("QC11 target chapter " + frappe.generate_hash(length=12), other.name)
		with self.assertRaises(frappe.ValidationError):
			update_lesson_index(self.a.name, self.chapter.name, chapter.name, 0)

	def test_course_purge_is_the_only_native_child_purge_context(self):
		# Only synthetic fixtures, through real01 reauthentication and impact token.
		purge_course_fixture(self.course.name)
		for doctype, name in (
			("Course Lesson", self.b.name),
			("Course Chapter", self.chapter.name),
			("Lesson Reference", self.b_ref.name),
			("LMS Enrollment", self.old_enrollment.name),
		):
			self.assertFalse(frappe.db.exists(doctype, name))

	def test_restore_cannot_award_from_cache100_or_zero_and_issued_certificate_survives(self):
		frappe.db.set_value("LMS Course", self.course.name, "enable_certification", 1)
		self.complete(self.new.name, self.a.name)
		with (
			patch("frappe.sendmail"),
			patch("lms.lms.doctype.lms_certificate.lms_certificate.LMSCertificate.send_certification_email"),
		):
			frappe.set_user(self.new.name)
			issued = create_certificate(self.course.name)
		frappe.set_user("Administrator")
		restore_lesson(self.b.name)
		self.assertEqual(frappe.db.get_value("LMS Enrollment", self.new_enrollment.name, "progress"), 100)
		self.assertEqual(get_course_progress(self.course.name, self.new.name), 50)
		issued.reload()
		issued.expiry_date = "2099-01-01"
		issued.save(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("LMS Certificate", issued.name))
		for actor, member in ((self.old.name, self.old.name), ("Administrator", self.old.name)):
			frappe.set_user(actor)
			frappe.db.set_value("LMS Enrollment", self.old_enrollment.name, "progress", 100)
			with self.assertRaises(frappe.ValidationError):
				if actor == "Administrator":
					frappe.get_doc(
						{"doctype": "LMS Certificate", "course": self.course.name, "member": member}
					).insert(ignore_permissions=True)
				else:
					create_certificate(self.course.name)
		frappe.set_user("Administrator")
		archive_chapter(self.chapter.name)
		frappe.db.set_value(
			"LMS Enrollment", self.old_enrollment.name, "creation", now_datetime() + timedelta(seconds=1)
		)
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc(
				{"doctype": "LMS Certificate", "course": self.course.name, "member": self.old.name}
			).insert(ignore_permissions=True)

	def test_course_dashboard_list_detail_kpi_and_export_use_member_denominator(self):
		self.complete(self.old.name, self.a.name)
		self.complete(self.new.name, self.a.name)
		frappe.set_user(self.author.name)
		listing = get_course_students(self.course.name, sort="progress", direction="desc", page_length=1)
		self.assertEqual(listing["rows"][0]["member"], self.new.name)
		self.assertEqual(listing["rows"][0]["total_lessons"], 1)
		rows = get_course_students(self.course.name)["rows"]
		self.assertEqual(
			{row["member"]: row["progress"] for row in rows}, {self.old.name: 50, self.new.name: 100}
		)
		detail = get_course_student_detail(self.course.name, self.old_enrollment.name)
		self.assertEqual(detail["total_lessons"], 2)
		self.assertEqual(get_course_dashboard_stats(self.course.name)["completed_not_certified"], 1)
		facts = curriculum_progress_query([self.course.name]).run(as_dict=True)
		self.assertEqual(
			{row.member: row.total_lessons for row in facts}, {self.old.name: 2, self.new.name: 1}
		)
		for row in rows:
			sheet = _course_sheet_row(row, 999)
			self.assertEqual(sheet[4], row["total_lessons"])
		# Actual report endpoint shares this query; its own shape is maintained by05.
		with patch("lms.lms.dashboard.course._analytics_report", side_effect=lambda **kwargs: kwargs):
			report = _course_analytics(self.course.name, (None, None))
		self.assertEqual(len(report["table_rows"]), 2)

	def test_editor_flags_include_archived_parent_and_student_outline_is_not_ui_filtered(self):
		frappe.set_user(self.old.name)
		outline = get_course_outline(self.course.name, progress=True)
		self.assertIn(self.b.name, [lesson.name for chapter in outline for lesson in chapter.lessons])
		frappe.set_user(self.new.name)
		outline = get_course_outline(self.course.name, progress=True)
		self.assertNotIn(self.b.name, [lesson.name for chapter in outline for lesson in chapter.lessons])

	def test_generic_enrollment_update_locks_real_course_after_permission(self):
		from lms.lms.doctype.lms_enrollment.lms_enrollment import LMSEnrollment

		doc = frappe.get_doc("LMS Enrollment", self.new_enrollment.name)
		calls = []
		original_get = frappe.db.get_value
		original_permission = LMSEnrollment.check_permission

		def get_value(doctype, *args, **kwargs):
			if kwargs.get("for_update"):
				calls.append((doctype, args[0] if args else None))
			return original_get(doctype, *args, **kwargs)

		def permission(instance, *args, **kwargs):
			calls.append(("permission", None))
			return original_permission(instance, *args, **kwargs)

		with (
			patch.object(frappe.db, "get_value", side_effect=get_value),
			patch.object(LMSEnrollment, "check_permission", permission),
		):
			doc.save()
		self.assertEqual(calls[0][0], "permission")
		self.assertEqual(next(row for row in calls if row[0] == "LMS Course")[1], self.course.name)
		# A forged course may be refused later, but must never choose the first lock.
		doc = frappe.get_doc("LMS Enrollment", self.new_enrollment.name)
		doc.course = "qc11-forged"
		calls.clear()
		with (
			patch.object(frappe.db, "get_value", side_effect=get_value),
			self.assertRaises(frappe.ValidationError),
		):
			doc.save()
		self.assertEqual(next(row for row in calls if row[0] == "LMS Course")[1], self.course.name)

	def test_batch_readers_use_the_same_percentages_before_pagination(self):
		from lms.lms.dashboard.batch import (
			get_batch_dashboard_stats,
			get_batch_student_detail,
			get_batch_students,
		)

		self._create_evaluator(self.author.name)
		batch = self._create_batch(
			self.course.name,
			instructor=self.author.name,
			evaluator=self.author.name,
			title="QC11 Batch " + frappe.generate_hash(length=12),
		)
		old = self._create_batch_enrollment(self.old.name, batch.name)
		self._create_batch_enrollment(self.new.name, batch.name)
		self.complete(self.old.name, self.a.name)
		self.complete(self.new.name, self.a.name)
		frappe.set_user(self.author.name)
		rows = get_batch_students(batch.name, sort="progress", direction="desc", page_length=1)["rows"]
		self.assertEqual(rows[0]["member"], self.new.name)
		self.assertEqual(rows[0]["progress"], 100)
		detail = get_batch_student_detail(batch.name, old.name)
		self.assertEqual(detail["courses"][0]["lessons"], 2)
		self.assertEqual(detail["courses"][0]["progress"], 50)
		stats = get_batch_dashboard_stats(batch.name)
		self.assertEqual(stats["courses"][0]["average_progress"], 75)
		self.assertEqual(stats["courses"][0]["completed"], 1)

	def test_statistics_population_changes_on_restore_without_overwriting_cache(self):
		from lms.lms.report_period import report_window
		from lms.lms.statistics import _completion_count, _records

		self.complete(self.old.name, self.a.name)
		self.complete(self.new.name, self.a.name)
		window = report_window("", "")
		before = _completion_count(window)
		rows, total = _records("completions", window, search=self.new.name)
		self.assertEqual(total, 1)
		self.assertEqual([row.member for row in rows], [self.new.name])
		restore_lesson(self.b.name)
		self.assertEqual(_completion_count(window), before - 1)
		export_rows, export_total = _records("completions", window, search=self.new.name, page_length=0)
		self.assertEqual((export_rows, export_total), ([], 0))
		self.assertEqual(frappe.db.get_value("LMS Enrollment", self.new_enrollment.name, "progress"), 100)

	def test_scorm_archive_cutoff_keeps_old_sequence_and_denies_new_cohort(self):
		from lms.lms.doctype.course_chapter.course_chapter import resolve_scorm_access
		from lms.page_renderers import SCORMRenderer

		restore_lesson(self.b.name)
		chapter = self._create_chapter("QC11 SCORM " + frappe.generate_hash(length=12), self.course.name)
		self._create_chapter_reference(self.course.name, chapter.name, idx=2)
		update_lesson_index(self.b.name, self.chapter.name, chapter.name, 0)
		package = f"/scorm/{self.course.name}/{chapter.name}"
		frappe.db.set_value(
			"Course Chapter", chapter.name, {"is_scorm_package": 1, "scorm_package_path": package}
		)
		frappe.db.set_value("LMS Course", self.course.name, "enforce_lesson_completion", 1)
		with patch("lms.lms.child_content.now_datetime", return_value=self.cutoff):
			archive_chapter(chapter.name)
		frappe.set_user(self.old.name)
		access = resolve_scorm_access(self.course.name, self.b.name, chapter=chapter.name)
		self.assertEqual((access.can_access, access.locked), (True, True))
		with self.assertRaises(frappe.PermissionError):
			SCORMRenderer(path=package.lstrip("/") + "/index.html")._check_permission(
				self.course.name, chapter.name
			)
		self.complete(self.old.name, self.a.name)
		frappe.set_user(self.old.name)
		self.assertEqual(
			resolve_scorm_access(self.course.name, self.b.name, chapter=chapter.name),
			{"can_access": True, "locked": False},
		)
		for user in (self.new.name, self.other.name, "Guest"):
			frappe.set_user(user)
			self.assertFalse(
				resolve_scorm_access(self.course.name, self.b.name, chapter=chapter.name).can_access
			)
			with self.assertRaises(frappe.PermissionError):
				SCORMRenderer(path=package.lstrip("/") + "/index.html")._check_permission(
					self.course.name, chapter.name
				)

	def test_lifecycle_endpoints_are_native_post_only(self):
		for endpoint in (
			archive_lesson,
			restore_lesson,
			archive_chapter,
			restore_chapter,
			delete_lesson,
			delete_chapter,
		):
			self.assertEqual(tuple(frappe.allowed_http_methods_for_whitelisted_func[endpoint]), ("POST",))
