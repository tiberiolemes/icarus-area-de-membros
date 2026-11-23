"""Source functions at explicit boundaries, no runtime/schema or persisted data."""

import ast
import re
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from zoneinfo import ZoneInfo


class Row(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__


class Denied(Exception):
	pass


def throw(message, exception=Denied):
	raise exception(message)


def load(module, names, env):
	tree = ast.parse((Path(__file__).parents[1] / "lms" / module).read_text())

	class BoundaryImports(ast.NodeTransformer):
		def visit_ImportFrom(self, node):
			return None

	nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
	assert {n.name for n in nodes} == set(names)
	for node in nodes:
		node.decorator_list = []
		BoundaryImports().visit(node)
	exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])), module, "exec"), env)
	return env


NOW = datetime(2026, 11, 21, 15)


class TestAnnualWindow(unittest.TestCase):
	def setUp(self):
		self.frappe = SimpleNamespace(
			session=Row(user="alice"), db=Mock(), throw=throw, PermissionError=Denied
		)
		self.frappe.db.get_value.return_value = 1
		self.frappe.db.exists.side_effect = [True, True]
		self.env = load(
			"community.py",
			{"grant_state", "can_access_community", "require_admin"},
			dict(
				frappe=self.frappe,
				_=lambda s: s,
				get_datetime=lambda v: v,
				now_datetime=lambda: NOW,
				utc_now=lambda: NOW,
				is_community_admin=lambda user=None: (user or self.frappe.session.user) == "admin",
			),
		)

	def test_half_open_window_and_neutral_states(self):
		state = self.env["grant_state"]
		grant = Row(starts_on=NOW, ends_on=NOW + timedelta(days=365))
		self.assertEqual(state(grant, NOW - timedelta(microseconds=1)), "Scheduled")
		self.assertEqual(state(grant, NOW), "Active")
		self.assertEqual(state(grant, grant.ends_on), "Expired")
		grant.revoked_on = NOW
		self.assertEqual(state(grant), "Revoked")

	def test_ownership_is_session_derived_and_query_has_both_bounds_and_revocation(self):
		self.assertTrue(self.env["can_access_community"]("community"))
		query = self.frappe.db.exists.call_args.args[1]
		self.assertEqual(query["member"], "alice")
		self.assertEqual(query["starts_on"], ("<=", NOW))
		self.assertEqual(query["ends_on"], (">", NOW))
		self.assertEqual(query["revoked_on"], ("is", "not set"))

	def test_guest_disabled_and_absent_community_fail_closed(self):
		self.assertFalse(self.env["can_access_community"]("community", "Guest"))
		self.frappe.db.get_value.return_value = 0
		self.assertFalse(self.env["can_access_community"]("community"))
		self.frappe.db.get_value.return_value = 1
		self.frappe.db.exists.side_effect = [False]
		self.assertFalse(self.env["can_access_community"]("community"))
		with self.assertRaises(Denied):
			self.env["require_admin"]()

	def test_storage_failure_never_grants_access(self):
		self.frappe.db.exists.side_effect = RuntimeError("unavailable")
		with self.assertRaises(RuntimeError):
			self.env["can_access_community"]("community")

	def test_inputs_use_explicit_site_zone_and_store_absolute_utc(self):
		self.frappe.utils = SimpleNamespace(get_system_timezone=lambda: "America/Sao_Paulo")
		env = load(
			"community.py",
			{"access_datetime"},
			dict(
				frappe=self.frappe,
				_=lambda s: s,
				get_datetime=datetime.fromisoformat,
				timezone=timezone,
				ZoneInfo=ZoneInfo,
			),
		)
		self.assertEqual(env["access_datetime"]("2026-11-21T12:00:00"), NOW)
		self.assertEqual(env["access_datetime"]("2026-11-21T15:00:00+00:00"), NOW)
		self.frappe.utils.get_system_timezone = lambda: "America/New_York"
		with self.assertRaises(Denied):
			env["access_datetime"]("2026-11-01T01:30:00")


class TestPublication(unittest.TestCase):
	def setUp(self):
		self.frappe = SimpleNamespace(
			session=Row(user="alice"), db=Mock(), throw=throw, PermissionError=Denied
		)
		self.notify = Mock()
		self.env = load(
			"moderation.py",
			{"visible", "notify_once", "decide"},
			dict(
				frappe=self.frappe,
				_=lambda s: s,
				now_datetime=lambda: NOW,
				send_approved_discussion_notifications=self.notify,
				is_community_admin=lambda user=None: (user or self.frappe.session.user) == "admin",
			),
		)
		self.topic = Row(lms_moderation_state="Approved")
		self.doc = Row(name="reply", owner="bob", lms_moderation_state="Pending")

	def test_unknown_pending_and_rejected_are_private(self):
		for state in (None, "", "Pending", "Rejected"):
			self.doc.lms_moderation_state = state
			self.assertFalse(self.env["visible"](self.doc))
			self.assertTrue(self.env["visible"](self.doc, "bob"))
			self.assertTrue(self.env["visible"](self.doc, "admin"))
		self.doc.lms_moderation_state = "Approved"
		self.assertTrue(self.env["visible"](self.doc))

	def test_notification_requires_approved_parent_and_reply_and_is_once(self):
		self.env["notify_once"](self.doc, self.topic)
		self.notify.assert_not_called()
		self.doc.lms_moderation_state = "Approved"
		self.frappe.db.get_value.return_value = Row(lms_notified_on=None, lms_moderation_state="Approved")
		self.env["notify_once"](self.doc, self.topic)
		self.notify.assert_called_once_with(self.doc, self.topic)
		self.frappe.db.get_value.return_value.lms_notified_on = NOW
		self.env["notify_once"](self.doc, self.topic)
		self.assertEqual(self.notify.call_count, 1)
		self.assertTrue(self.frappe.db.get_value.call_args.kwargs["for_update"])

	def test_legacy_and_pending_parent_do_not_notify(self):
		self.doc.lms_moderation_state = "Approved"
		self.doc.lms_legacy = 1
		self.env["notify_once"](self.doc, self.topic)
		self.doc.lms_legacy = 0
		self.topic.lms_moderation_state = "Pending"
		self.env["notify_once"](self.doc, self.topic)
		self.notify.assert_not_called()

	def test_non_admin_cannot_decide(self):
		with self.assertRaises(Denied):
			self.env["decide"]("Discussion Reply", "reply", "Approved")

	def test_failure_does_not_record_notification_as_delivered_outside_transaction(self):
		self.doc.lms_moderation_state = "Approved"
		self.frappe.db.get_value.return_value = Row(lms_notified_on=None, lms_moderation_state="Approved")
		self.notify.side_effect = RuntimeError("notification unavailable")
		with self.assertRaises(RuntimeError):
			self.env["notify_once"](self.doc, self.topic)
		# The exception must reach the caller so Frappe rolls back approval and marker together.
		self.frappe.db.commit.assert_not_called()


class TestDocumentTransitions(unittest.TestCase):
	def setUp(self):
		from contextvars import ContextVar

		class Doc(Row):
			def is_new(self):
				return self.get("new", False)

			def get_doc_before_save(self):
				return self.old

			def has_value_changed(self, key):
				return self.get(key) != self.old.get(key)

			def set(self, key, value):
				self[key] = value

		self.Doc = Doc
		self.topic = Row(name="topic", lms_root_reply="root", owner="alice", lms_moderation_state="Approved")
		self.frappe = SimpleNamespace(
			session=Row(user="alice"),
			db=Mock(),
			throw=throw,
			PermissionError=Denied,
			utils=SimpleNamespace(strip_html=lambda s: s),
		)
		self.env = load(
			"moderation.py",
			{"validate_document"},
			dict(
				frappe=self.frappe,
				_=lambda s: s,
				now_datetime=lambda: NOW,
				sanitize_rich_text=lambda s: s,
				get_topic=lambda name: self.topic,
				require_topic=Mock(),
				_transition=ContextVar("test_transition", default=False),
				CONTROLLED=(
					"lms_moderation_state",
					"lms_notified_on",
					"lms_root_reply",
					"lms_single_thread",
					"lms_legacy",
				),
				REFERENCES=("Course Lesson", "LMS Batch", "LMS Community"),
				re=re,
			),
		)

	def test_new_messages_cannot_forge_author_time_approval_or_legacy_suppression(self):
		doc = self.Doc(
			new=True,
			doctype="Discussion Reply",
			name="reply",
			topic="topic",
			reply="Body",
			owner="victim",
			creation="forged",
			lms_moderation_state="Approved",
			lms_legacy=1,
		)
		self.env["validate_document"](doc)
		self.assertEqual(doc.owner, "alice")
		self.assertEqual(doc.creation, NOW)
		self.assertEqual(doc.lms_moderation_state, "Pending")
		self.assertIsNone(doc.lms_legacy)

	def test_editing_approved_root_resets_topic_but_preserves_notification_marker(self):
		old = Row(
			owner="alice",
			creation=NOW,
			topic="topic",
			reply="Original",
			lms_moderation_state="Approved",
			lms_notified_on=NOW,
		)
		doc = self.Doc(old, old=old, doctype="Discussion Reply", name="root", reply="Edited")
		self.env["validate_document"](doc)
		self.assertEqual(doc.lms_moderation_state, "Pending")
		self.assertEqual(doc.lms_notified_on, NOW)
		self.frappe.db.set_value.assert_called_once_with(
			"Discussion Topic", "topic", "lms_moderation_state", "Pending"
		)

	def test_direct_approval_reparenting_and_author_changes_are_rejected(self):
		old = Row(
			owner="alice", creation=NOW, topic="topic", reply="Original", lms_moderation_state="Pending"
		)
		for field, value in (("lms_moderation_state", "Approved"), ("topic", "elsewhere"), ("owner", "bob")):
			doc = self.Doc(old, old=old, doctype="Discussion Reply", name="reply")
			doc[field] = value
			with self.assertRaises(Denied):
				self.env["validate_document"](doc)

	def test_reviewed_legacy_sanitization_does_not_undo_the_guarded_decision(self):
		old = Row(
			owner="alice",
			creation=NOW,
			topic="topic",
			reply="Unsafe legacy markup",
			lms_moderation_state="Pending",
		)
		doc = self.Doc(old, old=old, doctype="Discussion Reply", name="root", lms_moderation_state="Approved")
		self.env["sanitize_rich_text"] = lambda value: "Reviewed safe markup"
		token = self.env["_transition"].set(True)
		try:
			self.env["validate_document"](doc)
		finally:
			self.env["_transition"].reset(token)
		self.assertEqual(doc.reply, "Reviewed safe markup")
		self.assertEqual(doc.lms_moderation_state, "Approved")


if __name__ == "__main__":
	unittest.main()
