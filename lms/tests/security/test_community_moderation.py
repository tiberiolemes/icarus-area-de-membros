"""Run on integration08's migrated synthetic site; no payment or external message."""

from datetime import timedelta
from unittest.mock import patch

import frappe
from frappe.client import get as client_get
from frappe.utils import now_datetime

from lms.lms.community import can_access_community, get_access, grant_access, revoke_access
from lms.lms.moderation import create_topic, decide, queue, withdraw
from lms.lms.test_helpers import BaseTestUtils
from lms.lms.utils import get_discussion_replies, get_discussion_topics


class TestCommunityModeration(BaseTestUtils):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.mail = patch("frappe.sendmail").start()
		self.addCleanup(patch.stopall)
		self.suffix = frappe.generate_hash(length=12)
		self.a = self._create_user(f"qc06-a-{self.suffix}@example.com", "QC06", "A", ["LMS Student"])
		self.b = self._create_user(f"qc06-b-{self.suffix}@example.com", "QC06", "B", ["LMS Student"])
		self.c = self._create_user(f"qc06-c-{self.suffix}@example.com", "QC06", "C", ["LMS Student"])
		self.community = frappe.get_doc(
			{
				"doctype": "LMS Community",
				"community_key": f"qc06-{self.suffix}",
				"title": "QC06 Synthetic Community",
				"term_months": 12,
				"renewal_policy": "Explicit dates",
				"refund_policy": "Manual revocation",
			}
		).insert(ignore_permissions=True)
		self.grant(self.a.name)
		self.grant(self.b.name)

	def grant(self, member, **kwargs):
		return grant_access(member, frappe.generate_hash(length=24), community=self.community.name, **kwargs)

	def topic(self):
		frappe.set_user(self.a.name)
		return create_topic("LMS Community", self.community.name, "QC06 Question", "<p>Synthetic body</p>")[
			"name"
		]

	def approve(self, doctype, name):
		frappe.set_user("Administrator")
		return decide(
			doctype, name, "Approved", expected_modified=frappe.db.get_value(doctype, name, "modified")
		)

	def test_pending_is_author_only_in_api_rest_and_counts(self):
		name = self.topic()
		self.assertEqual(
			get_discussion_topics("LMS Community", self.community.name)["topics"][0].lms_moderation_state,
			"Pending",
		)
		root = get_discussion_replies(name)["root"]
		self.assertEqual(root.lms_moderation_state, "Pending")
		self.assertEqual(get_discussion_replies(name)["total"], 0)
		for user in (self.b.name, self.c.name, "Guest"):
			frappe.set_user(user)
			with self.assertRaises(frappe.PermissionError):
				get_discussion_replies(name)
			with self.assertRaises(frappe.PermissionError):
				client_get("Discussion Topic", name)
			with self.assertRaises(frappe.PermissionError):
				client_get("Discussion Reply", root.name)
			if user == self.b.name:
				self.assertFalse(frappe.get_list("Discussion Topic", filters={"name": name}))
		self.approve("Discussion Topic", name)
		frappe.set_user(self.b.name)
		self.assertEqual(get_discussion_replies(name)["root"].reply, "<p>Synthetic body</p>")

	def test_approval_records_and_notifies_exactly_once_and_edits_return_to_pending(self):
		name = self.topic()
		with patch("lms.lms.utils.send_approved_discussion_notifications") as notify:
			root = get_discussion_replies(name)["root"]
			notify.assert_not_called()
			self.approve("Discussion Topic", name)
			self.approve("Discussion Topic", name)
			self.assertEqual(notify.call_count, 1)
			frappe.set_user(self.a.name)
			doc = frappe.get_doc("Discussion Reply", root.name)
			doc.reply = '<p>Edited <img src=x onerror="alert(1)"></p>'
			doc.save(ignore_permissions=True)
			self.assertEqual(doc.lms_moderation_state, "Pending")
			self.assertNotIn("onerror", doc.reply)
			self.assertEqual(frappe.db.get_value("Discussion Topic", name, "lms_moderation_state"), "Pending")
			self.approve("Discussion Topic", name)
			self.assertEqual(notify.call_count, 1)
		self.assertTrue(
			frappe.db.exists("LMS Discussion Decision", {"reference_name": name, "actor": "Administrator"})
		)

	def test_cannot_self_approve_reparent_forge_author_or_delete_history(self):
		name = self.topic()
		root = get_discussion_replies(name)["root"]
		with self.assertRaises(frappe.PermissionError):
			decide("Discussion Topic", name, "Approved")
		for field, value in (("lms_moderation_state", "Approved"), ("owner", self.b.name), ("lms_legacy", 1)):
			doc = frappe.get_doc("Discussion Reply", root.name)
			doc.set(field, value)
			with self.assertRaises(frappe.PermissionError):
				doc.save(ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("Discussion Reply", root.name, ignore_permissions=True)
		withdraw(root.name)
		self.assertTrue(frappe.db.exists("Discussion Reply", root.name))
		self.assertEqual(get_discussion_replies(name)["root"].lms_moderation_state, "Rejected")

	def test_annual_windows_idempotency_conflicts_and_individual_revocations(self):
		now = now_datetime()
		for member, start, end, expected in (
			(self.c.name, now - timedelta(days=2), now, False),
			(self.c.name, now + timedelta(days=1), now + timedelta(days=2), False),
			(self.c.name, now - timedelta(days=1), now + timedelta(days=1), True),
		):
			self.grant(member, starts_on=start, ends_on=end)
			self.assertEqual(can_access_community(self.community.name, member), expected)
		key = frappe.generate_hash(length=24)
		first = grant_access(self.c.name, key, self.community.name)
		self.assertEqual(first, grant_access(self.c.name, key, self.community.name))
		with self.assertRaises(frappe.ValidationError):
			grant_access(self.a.name, key, self.community.name)
		revoke_access(first["name"], "QC06 test revocation")
		self.assertTrue(
			can_access_community(self.community.name, self.c.name)
		)  # separate active grant survives
		frappe.set_user(self.c.name)
		self.assertTrue(get_access(self.community.name)["can_access"])
		with self.assertRaises(frappe.PermissionError):
			revoke_access(first["name"], "QC06 unauthorized")
		with self.assertRaises(frappe.PermissionError):
			grant_access(self.c.name, frappe.generate_hash(length=24), self.community.name)

	def test_last_revoked_or_absent_grant_denies_read_and_post(self):
		name = self.topic()
		self.approve("Discussion Topic", name)
		for grant in frappe.get_all(
			"LMS Community Grant", {"community": self.community.name, "member": self.b.name}, pluck="name"
		):
			revoke_access(grant, "QC06 revoked")
		for user in (self.b.name, self.c.name, "Guest"):
			frappe.set_user(user)
			self.assertFalse(can_access_community(self.community.name))
			with self.assertRaises(frappe.PermissionError):
				get_discussion_replies(name)
			with self.assertRaises(frappe.PermissionError):
				create_topic("LMS Community", self.community.name, "QC06 denied", "<p>Denied</p>")
			with self.assertRaises(frappe.PermissionError):
				queue()

	def test_realtime_contains_only_invalidation_and_private_audiences(self):
		with patch("frappe.publish_realtime") as realtime:
			name = self.topic()
			for event in realtime.call_args_list:
				self.assertEqual(event.args[0], "lms_discussion_changed")
				self.assertEqual(set(event.args[1]), {"topic"})
				self.assertEqual(event.kwargs["user"], self.a.name)
			self.approve("Discussion Topic", name)
			self.assertTrue(any(event.kwargs.get("user") == self.b.name for event in realtime.call_args_list))
		self.mail.assert_not_called()

	def test_pagination_counts_exclude_root_and_ineligible_messages(self):
		name = self.topic()
		self.approve("Discussion Topic", name)
		for index in range(12):
			frappe.set_user(self.a.name)
			reply = frappe.get_doc(
				{"doctype": "Discussion Reply", "topic": name, "reply": f"<p>QC06 {index}</p>"}
			).insert(ignore_permissions=True)
			if index < 11:
				self.approve("Discussion Reply", reply.name)
		frappe.set_user(self.b.name)
		first, expanded, last = (
			get_discussion_replies(name),
			get_discussion_replies(name, 1),
			get_discussion_replies(name, 2),
		)
		self.assertEqual(first["total"], 11)
		self.assertEqual(len(first["replies"]), 3)
		self.assertEqual(len(expanded["replies"]), 10)
		self.assertEqual(len(last["replies"]), 1)
		self.assertFalse(
			set(row.name for row in expanded["replies"]) & set(row.name for row in last["replies"])
		)
		self.assertEqual(get_discussion_replies(name, 999)["page"], 2)

	def test_legacy_approval_never_retroactively_notifies(self):
		name = self.topic()
		root = get_discussion_replies(name)["root"]
		frappe.db.set_value("Discussion Reply", root.name, "lms_legacy", 1)
		frappe.db.set_value(
			"Discussion Reply", root.name, "reply", '<p>Legacy <img src=x onerror="alert(1)"></p>'
		)
		self.assertNotIn("onerror", get_discussion_replies(name)["root"].reply)
		with patch("lms.lms.utils.send_approved_discussion_notifications") as notify:
			self.approve("Discussion Topic", name)
			notify.assert_not_called()
		self.assertEqual(
			frappe.db.get_value("Discussion Reply", root.name, "lms_moderation_state"), "Approved"
		)
		self.assertNotIn("onerror", frappe.db.get_value("Discussion Reply", root.name, "reply"))

	def test_community_grant_never_bypasses_archived_lesson_cohort(self):
		from lms.lms.api import archive_lesson

		course = self._create_course(f"QC06 Course {self.suffix}", "Administrator")
		chapter = self._create_chapter(f"QC06 Chapter {self.suffix}", course.name)
		self._create_chapter_reference(course.name, chapter.name)
		lesson = self._create_lesson(f"QC06 Lesson {self.suffix}", chapter.name, course.name)
		self._create_lesson_reference(chapter.name, lesson.name)
		old = self._create_enrollment(self.a.name, course.name)
		cutoff = now_datetime() - timedelta(minutes=5)
		frappe.db.set_value("LMS Enrollment", old.name, "creation", cutoff - timedelta(seconds=1))
		frappe.set_user(self.a.name)
		topic = create_topic("Course Lesson", lesson.name, "QC06 Archived question", "<p>Preserved</p>")[
			"name"
		]
		self.approve("Discussion Topic", topic)
		with patch("lms.lms.child_content.now_datetime", return_value=cutoff):
			archive_lesson(lesson.name)
		self._create_enrollment(self.b.name, course.name)
		frappe.set_user(self.a.name)
		self.assertIsNotNone(get_discussion_replies(topic)["root"])
		frappe.set_user(self.b.name)
		self.assertTrue(can_access_community(self.community.name))
		with self.assertRaises(frappe.PermissionError):
			get_discussion_replies(topic)

	def test_changed_message_cannot_be_approved_using_a_stale_review(self):
		name = self.topic()
		modified = frappe.db.get_value("Discussion Topic", name, "modified")
		root = get_discussion_replies(name)["root"]
		doc = frappe.get_doc("Discussion Reply", root.name)
		doc.reply = "<p>Changed after review</p>"
		doc.save(ignore_permissions=True)
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):
			decide("Discussion Topic", name, "Approved", expected_modified=modified)
		self.assertEqual(frappe.db.get_value("Discussion Topic", name, "lms_moderation_state"), "Pending")

	def test_other_user_cannot_read_an_individual_grant_and_site_timezone_does_not_shift_it(self):
		grant = frappe.db.get_value(
			"LMS Community Grant", {"community": self.community.name, "member": self.a.name}, "name"
		)
		frappe.set_user(self.b.name)
		with self.assertRaises(frappe.PermissionError):
			client_get("LMS Community Grant", grant)
		with patch("frappe.utils.get_system_timezone", return_value="Pacific/Auckland"):
			self.assertTrue(can_access_community(self.community.name))

	def test_default_annual_term_handles_leap_day(self):
		from datetime import datetime

		with patch("lms.lms.community.utc_now", return_value=datetime(2024, 2, 29, 12)):
			grant = self.grant(self.c.name)
		self.assertEqual(
			frappe.db.get_value("LMS Community Grant", grant["name"], "ends_on"), datetime(2025, 2, 28, 12)
		)

	def test_native_client_cannot_inject_flags_to_publish_or_forge_authorship(self):
		from frappe.client import insert

		name = self.topic()
		self.approve("Discussion Topic", name)
		frappe.set_user(self.a.name)
		doc = insert(
			{
				"doctype": "Discussion Reply",
				"topic": name,
				"reply": "<p>Synthetic payload</p>",
				"owner": self.b.name,
				"lms_moderation_state": "Approved",
				"lms_legacy": 1,
				"flags": {"ignore_validate": True, "ignore_permissions": True},
			}
		)
		self.assertEqual(doc.lms_moderation_state, "Pending")
		self.assertEqual(doc.owner, self.a.name)
		self.assertFalse(doc.lms_legacy)

	def test_moderator_can_enable_a_community_only_member_without_granting_staff_roles(self):
		member = self._create_user(f"qc06-only-{self.suffix}@example.com", "QC06", "Only", [])
		moderator = self._create_user(f"qc06-mod-{self.suffix}@example.com", "QC06", "Mod", ["Moderator"])
		frappe.set_user(moderator.name)
		self.grant(member.name)
		self.assertTrue(can_access_community(self.community.name, member.name))
		roles = set(frappe.get_roles(member.name))
		self.assertIn("LMS Student", roles)
		self.assertFalse(roles & {"Moderator", "System Manager", "Course Creator"})
