"""Q09-01: bounded native MariaDB reads, private totals and stable page identity."""

from collections import Counter
from unittest.mock import patch

import frappe
from frappe.client import get_list

from lms.lms.moderation import topics
from lms.lms.test_helpers import BaseTestUtils
from lms.lms.utils import get_discussion_topics


class TestDiscussionTopicPagination(BaseTestUtils):
	def setUp(self):
		super().setUp()
		assert frappe.local.site.startswith("test_") and frappe.conf.mute_emails
		frappe.set_user("Administrator")
		self.prefix = "qc09-" + frappe.generate_hash(length=12)
		self.community = frappe.get_doc(
			{
				"doctype": "LMS Community",
				"community_key": self.prefix,
				"title": "QC09 Topics",
				"term_months": 12,
				"renewal_policy": "Explicit dates",
				"refund_policy": "Manual revocation",
			}
		).insert(ignore_permissions=True)
		self.a = self._create_user(self.prefix + "-a@example.test", "QC09", "A", ["LMS Student"]).name
		self.b = self._create_user(self.prefix + "-b@example.test", "QC09", "B", ["LMS Student"]).name
		from lms.lms.community import grant_access

		for user in (self.a, self.b):
			grant_access(user, frappe.generate_hash(length=24), community=self.community.name)
		self.names = []
		for index in range(100):
			name = self.prefix + f"-{index:03}"
			self.insert(
				"Discussion Topic",
				name,
				title=name,
				owner=self.a,
				reference_doctype="LMS Community",
				reference_docname=self.community.name,
				lms_moderation_state="Approved",
				lms_root_reply=name + "-root",
			)
			for suffix, state, owner in (
				("-root", "Approved", self.a),
				("-public", "Approved", self.b),
				("-private", "Pending", self.b),
			):
				self.insert(
					"Discussion Reply",
					name + suffix,
					topic=name,
					reply="<p>Fixture</p>",
					owner=owner,
					lms_moderation_state=state,
				)
			self.names.append(name)

	def insert(self, kind, name, **values):
		doc = frappe.get_doc({"doctype": kind, "creation": "2026-01-01 12:00:00", **values})
		doc.name = name
		doc.db_insert()

	def read(self, **kwargs):
		return get_discussion_topics("LMS Community", self.community.name, **kwargs)

	def test_hundred_topics_stable_five_pages_fixed_limit_and_root_excluded(self):
		frappe.set_user(self.a)
		seen = []
		for page in range(1, 6):
			data = self.read(page=page)
			self.assertEqual((data["total"], data["page"], data["page_size"]), (100, page, 20))
			self.assertEqual(len(data["topics"]), 20)
			self.assertTrue(
				all(
					row.reply_count == 1 and row.get("owner") == self.a and "name" not in row.user
					for row in data["topics"]
				)
			)
			seen.extend(row.name for row in data["topics"])
		self.assertEqual(seen, sorted(self.names, reverse=True))
		self.assertEqual(len(set(seen)), 100)
		for invalid in (-100, 0):
			self.assertEqual(self.read(page=invalid)["page"], 1)
		for invalid in ("bad", None):
			with self.assertRaises(frappe.exceptions.FrappeTypeError):
				self.read(page=invalid)
		self.assertEqual(self.read(page=10**80)["page"], 5)
		frappe.set_user(self.b)
		self.assertTrue(
			all(
				row.reply_count == 2 and "owner" not in row and "name" not in row.user
				for row in self.read()["topics"]
			)
		)

	def test_filtered_total_before_page_clamping_and_off_page_selection(self):
		for name in self.names[:21]:
			frappe.db.set_value("Discussion Topic", name, "lms_moderation_state", "Pending")
		frappe.set_user(self.b)
		data = self.read(page=5, discussion=self.names[-1])
		self.assertEqual((data["total"], data["page"], len(data["topics"])), (79, 4, 19))
		self.assertEqual(data["selected_topic"].name, self.names[-1])
		self.assertNotIn(data["selected_topic"].name, [r.name for r in data["topics"]])
		foreign = self.prefix + "-foreign"
		self.insert(
			"Discussion Topic",
			foreign,
			title="Other context",
			owner=self.a,
			reference_doctype="LMS Community",
			reference_docname=self.prefix + "-other",
			lms_moderation_state="Approved",
		)
		for denied in (self.names[0], "missing-qc09", foreign):
			data = self.read(discussion=denied)
			self.assertIsNone(data["selected_topic"])
			self.assertTrue(data["selected_unavailable"])
			self.assertEqual(data["total"], 79)
		frappe.set_user(self.a)
		self.assertEqual(self.read()["total"], 100)
		frappe.set_user("Administrator")
		self.assertEqual(self.read()["total"], 100)

	def test_context_permissions_empty_clamp_and_single_thread_protocol(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			self.read()
		frappe.set_user(self.b)
		with self.assertRaises(frappe.PermissionError):
			get_discussion_topics("LMS Community", "missing-qc09")
		frappe.set_user("Administrator")
		other = self._create_course(title=self.prefix + "course", instructor=self.a)
		chapter = self._create_chapter("Chapter", other.name)
		lesson = self._create_lesson("Lesson", chapter.name, other.name)
		frappe.set_user(self.b)
		with self.assertRaises(frappe.PermissionError):
			get_discussion_topics("Course Lesson", lesson.name)
		frappe.set_user("Administrator")
		self._create_evaluator(self.a)
		batch = self._create_batch(
			other.name, instructor=self.a, evaluator=self.a, title=self.prefix + "batch"
		)
		first = get_discussion_topics("LMS Batch", batch.name, True)
		second = get_discussion_topics("LMS Batch", batch.name, True, page=999)
		self.assertEqual(first, second)
		self.assertEqual(set(first), {"name"})
		self.assertEqual(
			frappe.db.count(
				"Discussion Topic",
				{"reference_doctype": "LMS Batch", "reference_docname": batch.name, "lms_single_thread": 1},
			),
			1,
		)
		frappe.set_user(self.b)
		for name in self.names:
			frappe.db.set_value("Discussion Topic", name, "lms_moderation_state", "Rejected")
		data = self.read(page=99)
		self.assertEqual(
			(data["total"], data["page"], data["start"], data["end"], data["topics"]), (0, 1, 0, 0, [])
		)

	def test_constant_page_queries_with_profiles_counts_and_latest_reasons(self):
		frappe.set_user("Administrator")
		for name in self.names:
			frappe.db.set_value("Discussion Topic", name, "lms_moderation_state", "Rejected")
			for index in range(2):
				self.insert(
					"LMS Discussion Decision",
					name + f"-decision{index}",
					reference_doctype="Discussion Topic",
					reference_name=name,
					reason=f"Reason {index}",
					actor="Administrator",
					state="Rejected",
				)
		self.read()
		original = frappe.db.sql
		counts = Counter()

		def measured(query, *args, **kwargs):
			counts["total"] += 1
			for table in (
				"tabDiscussion Topic",
				"tabDiscussion Reply",
				"tabUser",
				"tabLMS Discussion Decision",
			):
				if table in str(query):
					counts[table] += 1
			return original(query, *args, **kwargs)

		with patch.object(frappe.db, "sql", side_effect=measured):
			data = self.read(page=2, discussion=self.names[-1])
		self.assertLessEqual(counts["total"], 9)
		self.assertEqual(counts["tabDiscussion Reply"], 1)
		self.assertLessEqual(counts["tabUser"], 2)
		self.assertEqual(counts["tabLMS Discussion Decision"], 1)
		self.assertTrue(all(row.moderation_reason == "Reason 1" for row in data["topics"]))
		self.assertEqual(len(data["topics"]), 20)
		print("QC09_QUERY_COUNTS", dict(counts))
