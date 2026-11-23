"""Execute the actual policy functions with isolated boundary doubles, without Frappe/DB.

python3 -m unittest lms.tests.test_backend_integrity_isolated -v
Native persistence and real HTTP are separately covered by the integration modules.
"""

import ast
import hashlib
import json
import re
import secrets
import sys
import time
import unittest
from contextvars import ContextVar
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]


def source_functions(relative, names, environment):
	parsed = ast.parse((ROOT / relative).read_text())
	nodes = [node for node in parsed.body if isinstance(node, ast.FunctionDef) and node.name in names]
	assert {node.name for node in nodes} == set(names)
	for node in nodes:
		node.decorator_list = []
	exec(compile(ast.Module(body=nodes, type_ignores=[]), relative, "exec"), environment)
	return environment


class Values(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__


class Denied(Exception):
	pass


def throw(message, exception=Denied):
	raise exception(message)


class TestMediaPolicyIsolated(unittest.TestCase):
	def setUp(self):
		boundary = patch.dict(
			sys.modules,
			{"lms.lms.child_content": SimpleNamespace(lesson_is_eligible=lambda *args, **kwargs: True)},
		)
		boundary.start()
		self.addCleanup(boundary.stop)
		self.session = Values(user="student")
		self.completed = set()
		self.course = "course"
		self.references = [("future", False)]
		self.preview = False
		self.archived = False
		self.published = True
		self.owner = "author"
		self.enrolled = True
		self.env = {
			"__builtins__": __builtins__,
			"json": json,
			"re": re,
			"unquote": unquote,
			"_": lambda value: value,
			"frappe": SimpleNamespace(
				session=self.session,
				db=SimpleNamespace(
					exists=lambda *a: True,
					get_value=self.value,
					get_all=lambda *a, **kw: [
						Values(file_url="/private/files/future.mp4", file_name="future.mp4")
					],
				),
				throw=throw,
				PermissionError=Denied,
			),
			"resolve_lesson_course": lambda lesson: self.course,
			"can_modify_course": lambda course: self.session.user in ("author", "moderator"),
			"get_membership": lambda course, user: self.enrolled and user == "student",
			"enforces_lesson_completion": lambda course: True,
			"guest_access_allowed": lambda: True,
			"_resolve_lesson_references": lambda url: self.references,
			"_references_vouched_by_owner": lambda refs: refs,
			"_deny": lambda *a: None,
			"_serve_private_file": lambda *a: "bytes",
			"_download_name": lambda name, path: name,
		}
		compute = source_functions("lms/utils.py", ["compute_locked_lessons"], {})["compute_locked_lessons"]
		self.env["_lock_state"] = lambda course: (
			compute(["first", "future"], self.completed),
			["first", "future"],
			self.completed,
		)
		source_functions("lms/permissions.py", ["resolve_lesson_access", "can_access_lesson"], self.env)
		source_functions(
			"lms/doctype/course_lesson/course_lesson.py",
			["serve_resource", "_contains_resource_url"],
			self.env,
		)

	def value(self, doctype, name, field, **kwargs):
		return {
			"include_in_preview": self.preview,
			"published": self.published,
			"is_archived": self.archived,
		}.get(field)

	def serve(self):
		return self.env["serve_resource"]("/private/files/future.mp4")

	def test_future_bytes_deny_then_allow_after_real_completion_rule(self):
		with self.assertRaises(Denied):
			self.serve()
		self.completed.add("first")
		self.assertEqual(self.serve(), "bytes")

	def test_one_open_reference_is_enough_but_only_locked_references_are_not(self):
		self.references.append(("first", False))
		self.assertEqual(self.serve(), "bytes")
		self.references = [("future", False)]
		with self.assertRaises(Denied):
			self.serve()

	def test_instructor_only_open_reference_does_not_open_student_bytes(self):
		self.references.append(("first", True))
		with self.assertRaises(Denied):
			self.serve()

	def test_preview_does_not_bypass_member_sequence(self):
		self.preview = True
		with self.assertRaises(Denied):
			self.serve()
		self.session.user = "Guest"
		self.assertEqual(self.serve(), "bytes")
		self.archived = True
		with self.assertRaises(Denied):
			self.serve()

	def test_author_and_moderator_bypass_sequence_but_unrelated_creator_cannot(self):
		for user in ("author", "moderator"):
			self.session.user = user
			self.assertEqual(self.serve(), "bytes")
		self.session.user = "other-creator"
		with self.assertRaises(Denied):
			self.serve()

	def test_explicit_user_restores_original_session_even_when_denied(self):
		self.assertFalse(self.env["can_access_lesson"]("future", user="other-creator"))
		self.assertEqual(self.session.user, "student")

	def test_mapping_and_unknown_lesson_fail_closed(self):
		self.assertFalse(self.env["can_access_lesson"]({"name": "future"}))
		self.course = None
		self.assertFalse(self.env["can_access_lesson"]("future"))

	def test_complete_url_is_required_for_content_reference(self):
		contains = self.env["_contains_resource_url"]
		url = "/private/files/report_50%.pdf"
		for value in (json.dumps({"file": {"url": url}}), f'<a href="{url}">file</a>', f"[file]({url})"):
			self.assertTrue(contains(value, url))
		self.assertFalse(contains(json.dumps({"url": url + ".other"}), url))
		self.assertFalse(contains("/elsewhere" + url, url))

	def test_traversal_and_nonprivate_paths_never_reach_file_service(self):
		for path in (
			"/files/public.mp4",
			"/private/files/../secret",
			"/private/files/%2e%2e/secret",
			"/private/files/a\\b",
			"/private/files/a%00b",
		):
			with self.subTest(path=path), self.assertRaises(Denied):
				self.env["serve_resource"](path)


class TestPurgePolicyIsolated(unittest.TestCase):
	def setUp(self):
		self.session = Values(user="author", sid="synthetic-session")
		self.doc = Values(name="course", is_archived=1)
		self.approval = None
		self.digest = "reviewed-impact"
		self.user_modified = "version1"
		self.deleted = []
		self.cache = {}
		self.context = ContextVar("qc01-purge", default=None)
		self.env = {
			"hashlib": hashlib,
			"json": json,
			"re": re,
			"time": time,
			"_": lambda value: value,
			"frappe": SimpleNamespace(
				session=self.session,
				throw=throw,
				PermissionError=Denied,
				cache=SimpleNamespace(make_key=lambda key: key, getdel=self.getdel),
				delete_doc=self.delete,
			),
			"_require_author": lambda course: self.doc,
			"_authorizer": lambda identifier: Values(name=identifier, modified=self.user_modified),
			"_impact_snapshot": lambda doc: ({"counts": {"LMS Enrollment": 1}}, self.digest),
			"_audit": lambda *a, **kw: None,
			"_purge_context": self.context,
		}
		source_functions(
			"lms/course_lifecycle.py",
			[
				"_deny",
				"_session_fingerprint",
				"_approval_key",
				"purge_course",
				"is_course_purge_authorized",
				"require_course_purge_context",
			],
			self.env,
		)
		self.token = secrets.token_urlsafe(32)
		approval = {
			"course": "course",
			"actor": "author",
			"authorizer": "approver",
			"authorizer_modified": "version1",
			"session": self.env["_session_fingerprint"](),
			"digest": self.digest,
			"expires_at": time.time() + 300,
		}
		self.cache[self.env["_approval_key"](self.token)] = json.dumps(approval)

	def getdel(self, key):
		return self.cache.pop(key, None)

	def delete(self, doctype, course, **kwargs):
		self.env["require_course_purge_context"](course)
		self.deleted.append(course)

	def purge(self):
		return self.env["purge_course"]("course", "course", self.token)

	def test_valid_approval_consumed_once_and_context_cleared(self):
		self.assertEqual(self.purge(), {"course": "course", "purged": True})
		self.assertEqual(self.deleted, ["course"])
		self.assertIsNone(self.context.get())
		with self.assertRaises(Denied):
			self.purge()

	def test_generic_delete_has_no_capability(self):
		with self.assertRaises(Denied):
			self.delete("LMS Course", "course", force=True, ignore_permissions=True)

	def test_session_or_actor_change_refuses_approval(self):
		for field in ("sid", "user"):
			with self.subTest(field=field):
				self.setUp()
				self.session[field] = "another"
				with self.assertRaises(Denied):
					self.purge()
				self.assertEqual(self.deleted, [])

	def test_changed_impact_or_authorizer_requires_new_confirmation(self):
		for field in ("digest", "user_modified"):
			with self.subTest(field=field):
				self.setUp()
				setattr(self, field, "changed")
				with self.assertRaises(Denied):
					self.purge()
				self.assertEqual(self.deleted, [])

	def test_expired_token_refused(self):
		key = self.env["_approval_key"](self.token)
		approval = json.loads(self.cache[key])
		approval["expires_at"] = time.time() - 1
		self.cache[key] = json.dumps(approval)
		with self.assertRaises(Denied):
			self.purge()

	def test_unarchived_course_or_wrong_confirmation_cannot_delete(self):
		self.doc.is_archived = 0
		with self.assertRaises(Denied):
			self.purge()
		self.doc.is_archived = 1
		with self.assertRaises(Denied):
			self.env["purge_course"]("course", "wrong course", self.token)
		self.assertEqual(self.deleted, [])


class TestArchivePolicyIsolated(unittest.TestCase):
	def setUp(self):
		self.session = Values(user="author")
		self.doc = Values(name="course", is_archived=0, published=1)
		self.context = ContextVar("qc01-archive", default=None)
		self.saved = []
		self.env = {
			"_archive_transition": self.context,
			"_require_author": lambda course: self.doc,
			"_audit": lambda *a, **kw: None,
			"cint": int,
			"frappe": SimpleNamespace(
				session=self.session,
				db=SimpleNamespace(get_value=lambda *a, **kw: self.doc.is_archived),
				throw=throw,
				PermissionError=Denied,
			),
			"_": lambda value: value,
		}
		self.doc.save = lambda: self.saved.append(dict(self.doc))
		source_functions(
			"lms/course_lifecycle.py",
			["set_course_archived", "is_archive_transition_authorized", "validate_new_enrollment"],
			self.env,
		)

	def test_archive_and_restore_do_not_republish(self):
		self.assertEqual(
			self.env["set_course_archived"]("course", True),
			{"course": "course", "is_archived": 1, "published": 0},
		)
		self.assertEqual(
			self.env["set_course_archived"]("course", False),
			{"course": "course", "is_archived": 0, "published": 0},
		)
		self.assertIsNone(self.context.get())

	def test_archive_is_idempotent(self):
		self.env["set_course_archived"]("course", True)
		self.env["set_course_archived"]("course", True)
		self.assertEqual(len(self.saved), 1)

	def test_archived_enrollment_has_no_role_or_client_flag_bypass(self):
		self.doc.is_archived = 1
		for user in ("student", "author", "Administrator"):
			self.session.user = user
			with self.assertRaises(Denied):
				self.env["validate_new_enrollment"](
					Values(course="course", flags={"via_batch_enrollment": True})
				)


class TestNativeFileExtensionIsolated(unittest.TestCase):
	def setUp(self):
		self.access = False
		self.request = Values(path="/private/files/future.mp4")
		environment = {
			"frappe": SimpleNamespace(
				local=Values(request=self.request),
				session=Values(user="student"),
				logger=lambda *a: SimpleNamespace(warning=lambda *a: None),
			),
			"lesson_file_access": lambda url: self.access,
		}
		tree = ast.parse((ROOT / "lms/lesson_files.py").read_text())
		selected = [
			node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "LessonFileAccess"
		]
		exec(compile(ast.Module(body=selected, type_ignores=[]), "lesson_files.py", "exec"), environment)

		class NativeFile:
			native_allowed = True
			file_url = "/private/files/future.mp4"
			name = "synthetic-file"

			def is_downloadable(self):
				return self.native_allowed

		self.doc = type("ExtendedFile", (environment["LessonFileAccess"], NativeFile), {})()

	def test_native_ownership_does_not_override_lesson_denial(self):
		self.assertFalse(self.doc.is_downloadable())

	def test_canonical_authorized_lesson_bytes_use_the_explicit_media_grant(self):
		# Contract08: the native downloader's generic File denial does not negate proven lesson access.
		self.access = True
		self.doc.native_allowed = False
		self.assertTrue(self.doc.is_downloadable())
		self.doc.native_allowed = True
		self.assertTrue(self.doc.is_downloadable())

	def test_non_lms_files_keep_the_native_policy(self):
		self.access = None
		self.assertTrue(self.doc.is_downloadable())
		self.doc.native_allowed = False
		self.assertFalse(self.doc.is_downloadable())

	def test_case_variant_does_not_authorize_different_bytes(self):
		self.access = True
		self.request.path = "/private/files/FUTURE.mp4"
		self.assertFalse(self.doc.is_downloadable())


if __name__ == "__main__":
	unittest.main()
