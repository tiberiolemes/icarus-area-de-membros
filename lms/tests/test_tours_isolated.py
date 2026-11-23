"""Execute actual tour APIs with isolated persistence/role boundaries, no site."""

import hashlib
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch

ROOT = Path(__file__).parents[2]


class Denied(Exception):
	pass


class Row(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__


class TestTours(unittest.TestCase):
	def setUp(self):
		self.rows = {}
		self.frappe = ModuleType("frappe")
		f = self.frappe
		f._ = lambda value: value
		f.whitelist = lambda **kwargs: lambda fn: fn
		f.PermissionError, f.DuplicateEntryError = Denied, type("Duplicate", (Exception,), {})
		f.throw = lambda message, *args: (_ for _ in ()).throw(Denied(message))
		f.session, f.local = Row(user="alice"), Row(site="synthetic-site")
		f.get_app_path = lambda *parts: str(ROOT.joinpath(*parts))
		f.db = Mock()
		f.db.get_value.return_value = 1
		f.db.exists.side_effect = lambda doctype, name: name in self.rows
		f.get_doc = self.get_doc
		rates = ModuleType("frappe.rate_limiter")
		rates.rate_limit = lambda **kwargs: lambda fn: fn
		permissions = ModuleType("lms.lms.permissions")
		permissions.is_community_admin = lambda: f.session.user == "admin"
		permissions.is_site_administrator = lambda: f.session.user == "admin"
		utils = ModuleType("lms.lms.utils")
		utils.has_course_instructor_role = lambda user: user in {"author", "admin"}
		utils.has_moderator_role = lambda user: user == "admin"
		self.modules = patch.dict(
			sys.modules,
			{
				"frappe": f,
				"frappe.rate_limiter": rates,
				"lms.lms.permissions": permissions,
				"lms.lms.utils": utils,
			},
		)
		self.modules.start()
		self.addCleanup(self.modules.stop)
		spec = importlib.util.spec_from_file_location("tours07", ROOT / "lms/lms/tours.py")
		self.api = importlib.util.module_from_spec(spec)
		spec.loader.exec_module(self.api)
		self.revision = self.api.catalogue()["revision"]

	def get_doc(self, doctype, name=None, **kwargs):
		if isinstance(doctype, dict):
			doc = Row(doctype)

			def insert(**options):
				key = options["set_name"]
				doc.name = key
				self.rows[key] = doc
				doc.save = Mock()
				return doc

			doc.insert = insert
			return doc
		return self.rows[name]

	def event(self, action, **kwargs):
		return self.api.record_event("Courses", self.revision, action, **kwargs)

	def test_start_is_idempotent_completion_requires_monotonic_steps_and_rating_is_explicit(self):
		self.event("start")
		self.event("start")
		with self.assertRaises(Denied):
			self.event("complete")
		with self.assertRaises(Denied):
			self.event("rate", helpful=1)
		with self.assertRaises(Denied):
			self.event("progress", step=9)
		self.event("progress", step=1)
		done = self.event("complete")
		self.event("complete")
		self.assertEqual(done["started_count"], 1)
		self.assertEqual(done["completed_count"], 1)
		self.assertEqual(done["helpful"], "")
		self.assertEqual(self.event("rate", helpful=0)["helpful"], "No")

	def test_closing_pauses_without_skipping_and_resume_preserves_the_frontier(self):
		self.event("start")
		self.event("progress", step=1)
		paused = self.event("pause")
		self.assertEqual(paused["status"], "Paused")
		self.assertEqual(paused["completed_count"], 0)
		self.assertEqual(paused["skipped_count"], 0)
		resumed = self.event("start")
		self.assertEqual(resumed["step"], 1)
		self.assertEqual(resumed["started_count"], 1)

	def test_explicit_skip_and_restart_keep_the_attempt_history(self):
		self.event("start")
		self.event("skip")
		self.event("skip")
		state = self.event("restart")
		self.assertEqual(state["started_count"], 2)
		self.assertEqual(state["skipped_count"], 1)
		self.assertEqual(state["completed_count"], 0)

	def test_actor_is_derived_from_session_and_one_user_cannot_fetch_or_mutate_another(self):
		self.event("start")
		self.event("progress", step=1)
		alice = self.api.record_name("Courses", self.revision)
		self.frappe.session.user = "bob"
		self.assertEqual(self.api.get_state("Courses", self.revision)["status"], "Not Started")
		self.event("start")
		bob = self.api.record_name("Courses", self.revision)
		self.assertNotEqual(alice, bob)
		self.assertEqual(self.rows[alice].step, 1)
		self.assertEqual(self.rows[bob].step, 0)
		self.rows[bob].member = "alice"
		with self.assertRaises(Denied):
			self.event("skip")

	def test_guest_disabled_role_and_stale_revision_are_denied_without_records(self):
		self.frappe.session.user = "Guest"
		with self.assertRaises(Denied):
			self.event("start")
		self.frappe.session.user = "alice"
		with self.assertRaises(Denied):
			self.api.get_state("DeskPrivacySettings", self.revision)
		with self.assertRaises(Denied):
			self.api.get_state("Courses", "stale")
		self.frappe.db.get_value.return_value = 0
		with self.assertRaises(Denied):
			self.event("start")
		self.assertEqual(self.rows, {})

	def test_individual_report_denies_ordinary_user_before_reading_statistics(self):
		with self.assertRaises(Denied):
			self.api.report()
		self.frappe.db.sql.assert_not_called()

	def test_report_uses_native_site_counts_and_declares_its_population(self):
		self.frappe.session.user = "admin"
		self.frappe.db.sql.return_value = [Row(participations=4, completed=2, skipped=1, rated=2, useful=1)]
		self.frappe.get_all = Mock(return_value=[])
		result = self.api.report(page="Courses", page_length=25)
		self.assertEqual(result["site"], "synthetic-site")
		self.assertEqual(result["summary"]["participations"], 4)
		self.assertEqual(self.frappe.db.sql.call_args.args[1]["page"], "Courses")
		self.assertIn("not learning completion", result["denominator"])
		with self.assertRaises(Denied):
			self.api.report(page="<script>")


if __name__ == "__main__":
	unittest.main(verbosity=2)
