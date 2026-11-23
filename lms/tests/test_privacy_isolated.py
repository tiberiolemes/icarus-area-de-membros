"""Exercise the source with isolated framework boundaries, never a site or SMTP."""

import html
import hashlib
import importlib.util
import json
import sys
import traceback
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

ROOT = Path(__file__).parents[2]


class Row(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__


class Denied(Exception):
	pass


class Callbacks:
	def __init__(self):
		self.functions = []

	def add(self, function):
		self.functions.append(function)

	def run(self):
		while self.functions:
			self.functions.pop(0)()


def deny(message, *args, **kwargs):
	raise Denied(message)


def source_module():
	frappe = ModuleType("frappe")
	frappe._ = lambda text: text
	frappe.whitelist = lambda *args, **kwargs: lambda fn: fn
	frappe.throw = deny
	frappe.PermissionError = Denied
	frappe.ValidationError = Denied
	frappe.DuplicateEntryError = type("Duplicate", (Exception,), {})
	frappe.QueryDeadlockError = type("QueryDeadlockError", (Exception,), {})
	frappe.session = Row(user="manager")
	frappe.db = Mock()
	frappe.db.OperationalError = type("OperationalError", (Exception,), {})
	frappe.db.get_value.return_value = "2026-11-21"
	frappe.db.exists.return_value = False
	frappe.get_single = Mock()
	frappe.get_doc = Mock()
	frappe.get_all = Mock(return_value=[])
	frappe.enqueue_doc = Mock()
	frappe.only_for = Mock()
	frappe.in_test = False
	utils = ModuleType("frappe.utils")
	utils.escape_html = html.escape
	rate_limiter = ModuleType("frappe.rate_limiter")
	rate_limiter.rate_limit = lambda **kwargs: lambda fn: fn
	spec = importlib.util.spec_from_file_location("privacy07", ROOT / "lms/lms/privacy.py")
	module = importlib.util.module_from_spec(spec)
	with patch.dict(
		sys.modules, {"frappe": frappe, "frappe.rate_limiter": rate_limiter, "frappe.utils": utils}
	):
		spec.loader.exec_module(module)
	return module, frappe


class PrivacyFixture(unittest.TestCase):
	def setUp(self):
		self.api, self.frappe = source_module()
		self.settings = Row({field: "Texto sintético de teste" for field in self.api.REQUIRED})
		self.settings.update(publication_approved=1, approved_revision="")
		self.frappe.get_single.return_value = self.settings
		self.frappe.db.get_single_value.return_value = "Termos sintéticos"
		self.settings.approved_revision = self.api.policy_state()["revision"]
		self.lock = MagicMock()
		self.synchronization = ModuleType("frappe.utils.synchronization")
		self.synchronization.filelock = Mock(return_value=self.lock)
		self.file_lock = ModuleType("frappe.utils.file_lock")
		self.file_lock.LockTimeoutError = type("LockTimeoutError", (Exception,), {})
		self.enterContext(
			patch.dict(
				sys.modules,
				{
					"frappe.utils.synchronization": self.synchronization,
					"frappe.utils.file_lock": self.file_lock,
				},
			)
		)

	def invitation_proof(self):
		self.frappe.utils = SimpleNamespace(
			sha256_hash=lambda value: hashlib.sha256(value.encode()).hexdigest()
		)
		self.frappe.local = SimpleNamespace(response={}, request=SimpleNamespace(after_response=Callbacks()))
		self.frappe.clear_messages = Mock()
		self.frappe.db.after_commit = Callbacks()
		self.frappe.db.after_rollback = Callbacks()
		self.frappe.db.get_value.reset_mock()
		self.frappe.db.get_value.side_effect = lambda doctype, filters, *args, **kwargs: (
			"owned-invitation"
			if isinstance(filters, dict)
			else Row(
				email="owned@example.test",
				key=self.frappe.utils.sha256_hash("synthetic-token"),
				status="Pending",
			)
		)


class TestPrivacyPolicy(PrivacyFixture):
	def test_feedback_is_bounded_idempotent_and_uses_only_the_session_identity(self):
		self.frappe.session.user = "alice"
		key = "a213d925-d069-4b05-927a-2d2266d5657a"
		self.api.rate_help("aluno", 1, key)
		payload = self.frappe.get_doc.call_args.args[0]
		self.assertEqual(payload["member"], "alice")
		self.assertEqual(payload["help_revision"], self.api.HELP_REVISION)
		self.frappe.get_doc.reset_mock()
		self.frappe.db.exists.return_value = True
		self.assertTrue(self.api.rate_help("aluno", 1, key)["recorded"])
		self.frappe.get_doc.assert_not_called()
		for article, useful, request_key in (
			("not-an-article", 1, key),
			("aluno", 5, key),
			("aluno", 1, "<script>"),
		):
			with self.assertRaises(Denied):
				self.api.rate_help(article, useful, request_key)

	def test_approval_and_content_revision_are_both_required(self):
		self.assertTrue(self.api.policy_state()["ready"])
		self.frappe.db.get_single_value.return_value = "Termos alterados"
		self.assertFalse(self.api.policy_state()["ready"])
		self.settings.approved_revision = self.api.policy_state()["revision"]
		self.assertTrue(self.api.policy_state()["ready"])
		self.settings.publication_approved = 0
		self.assertFalse(self.api.policy_state()["ready"])

	def test_missing_fields_never_become_a_published_policy(self):
		self.settings.controller_name = " "
		self.assertIn("Responsible controller", self.api.policy_state()["missing"])
		with self.assertRaises(Denied):
			self.api.require_public_registration(True)

	def test_boolean_contract_rejects_false_strings_and_objects(self):
		for value in (False, 0, "0", "false", "False", "yes", "true", "", None, [], {}, 1.0):
			with self.subTest(value=value), self.assertRaises(Denied):
				self.api.require_public_registration(value)
		for value in (True, 1, "1"):
			self.assertEqual(self.api.require_public_registration(value), self.settings.approved_revision)

	def test_stale_form_cannot_claim_acceptance_of_the_new_terms(self):
		with self.assertRaises(Denied):
			self.api.require_public_registration(True, "old revision")
		self.assertEqual(
			self.api.require_public_registration(True, self.settings.approved_revision),
			self.settings.approved_revision,
		)

	def test_guest_rest_cannot_forge_registration_context_via_flags(self):
		self.frappe.session.user = "Guest"
		user = Row(verify_terms=True, flags=Row(icarus_registration=self.settings.approved_revision))
		with self.assertRaises(Denied):
			self.api.validate_public_user(user)
		with self.api.public_registration(self.settings.approved_revision):
			self.api.validate_public_user(user)
		with self.assertRaises(Denied):
			self.api.validate_public_user(user)

	def test_admin_invitation_does_not_depend_on_public_signup_configuration(self):
		self.settings.publication_approved = 0
		self.api.validate_public_user(Row(verify_terms=False))

	def test_invitation_context_is_limited_to_the_verified_recipient(self):
		self.frappe.session.user = "Guest"
		self.settings.publication_approved = 0
		token = self.api._invited_registration.set("owned@example.test")
		try:
			self.api.validate_public_user(Row(email="owned@example.test", verify_terms=False))
			for email in (None, "other@example.test"):
				with self.assertRaises(Denied):
					self.api.validate_public_user(Row(email=email, flags=Row(is_invited=True)))
		finally:
			self.api._invited_registration.reset(token)
		with self.assertRaises(Denied):
			self.api.validate_public_user(Row(email="owned@example.test", flags=Row(is_invited=True)))
		self.assertIsNone(self.api._registration.get())

	def test_invitation_context_resets_when_native_acceptance_raises(self):
		native = ModuleType("frappe.core.api.user_invitation")
		native.accept_invitation = Mock(side_effect=ValueError("synthetic native failure"))
		self.invitation_proof()
		with patch.dict(sys.modules, {"frappe.core.api.user_invitation": native}):
			with self.assertRaises(ValueError):
				self.api.accept_native_invitation("synthetic-token")
		self.assertIsNone(self.api._invited_registration.get())
		native.accept_invitation.assert_called_once_with("synthetic-token")
		self.lock.__exit__.assert_not_called()
		self.frappe.db.after_rollback.run()
		self.frappe.local.request.after_response.run()
		self.lock.__exit__.assert_called_once()

	def test_invitation_mutex_waits_for_the_native_commit_and_has_finally_fallback(self):
		native = ModuleType("frappe.core.api.user_invitation")
		native.accept_invitation = Mock(return_value=None)
		self.invitation_proof()
		with patch.dict(sys.modules, {"frappe.core.api.user_invitation": native}):
			self.api.accept_native_invitation("synthetic-token")
		self.synchronization.filelock.assert_called_once_with("lms-accept-invitation", timeout=10)
		self.lock.__exit__.assert_not_called()
		self.frappe.db.after_commit.run()
		self.frappe.local.request.after_response.run()
		self.lock.__exit__.assert_called_once()
		self.frappe.db.commit.assert_not_called()
		self.frappe.db.rollback.assert_not_called()

	def test_invitation_lock_timeout_or_unavailable_is_recoverable_without_lookup_or_context(self):
		native = ModuleType("frappe.core.api.user_invitation")
		native.accept_invitation = Mock()
		for error in (self.file_lock.LockTimeoutError("synthetic timeout"), OSError("synthetic unavailable")):
			with self.subTest(error=type(error).__name__):
				self.invitation_proof()
				self.lock.__enter__.side_effect = error
				with patch.dict(sys.modules, {"frappe.core.api.user_invitation": native}):
					self.api.accept_native_invitation("synthetic-token")
				self.assertEqual(
					self.frappe.local.response,
					{"type": "redirect", "location": "/login?invitation-busy=1#forgot"},
				)
				self.frappe.db.get_value.assert_not_called()
				native.accept_invitation.assert_not_called()
				self.assertIsNone(self.api._invited_registration.get())

	def test_invitation_snapshot_conflict_revokes_context_before_request_rollback(self):
		self._invitation_deadlock_case(1020, handled=True)

	def test_invitation_does_not_hide_unrelated_or_unclassified_sql_errors(self):
		for code in (1213, 1064, None):
			with self.subTest(code=code):
				self._invitation_deadlock_case(code, handled=False)

	def _invitation_deadlock_case(self, code, handled):
		native = ModuleType("frappe.core.api.user_invitation")
		constants = ModuleType("pymysql.constants")
		constants.ER = SimpleNamespace(CHECKREAD=1020)
		operational = type("OperationalError", (Exception,), {})
		self.frappe.db.OperationalError = operational
		error = self.frappe.QueryDeadlockError("synthetic conflict")
		error.__cause__ = operational(*(() if code is None else (code, "synthetic")))
		native.accept_invitation = Mock(side_effect=error)
		self.invitation_proof()
		self.frappe.db.rollback.reset_mock()
		self.frappe.db.rollback.side_effect = lambda: self.assertIsNone(self.api._invited_registration.get())
		with patch.dict(
			sys.modules, {"frappe.core.api.user_invitation": native, "pymysql.constants": constants}
		):
			if handled:
				self.api.accept_native_invitation("synthetic-token")
				self.frappe.db.rollback.assert_called_once_with()
				self.assertEqual(
					self.frappe.local.response,
					{"type": "redirect", "location": "/login?invitation-expired=1#forgot"},
				)
			else:
				with self.assertRaises(self.frappe.QueryDeadlockError) as raised:
					self.api.accept_native_invitation("synthetic-token")
				self.assertIs(raised.exception, error)
				self.frappe.db.rollback.assert_not_called()
				self.assertEqual(self.frappe.local.response, {})
		self.assertIsNone(self.api._invited_registration.get())

	def test_context_is_restored_even_after_a_failed_insert(self):
		with self.assertRaises(ValueError), self.api.public_registration("revision"):
			raise ValueError("synthetic failure")
		self.assertIsNone(self.api._registration.get())

	def test_acceptance_uses_native_comment_and_does_not_invent_consent(self):
		user = Mock()
		self.api.record_terms(user)
		user.add_comment.assert_not_called()
		with self.api.public_registration("revision"):
			self.api.record_terms(user)
		self.assertEqual(user.add_comment.call_args.args[0], "Info")
		self.assertIn("revision", user.add_comment.call_args.kwargs["text"])
		self.assertNotIn("consent", user.add_comment.call_args.kwargs["text"])

	def test_safe_export_filters_by_subject_and_never_selects_star(self):
		self.frappe.get_all.return_value = [Row(name="own-row")]
		data = json.loads(self.api.safe_export("student@example.com"))
		self.assertIn("LMS Course Progress", data)
		for call in self.frappe.get_all.call_args_list:
			filters = call.kwargs["filters"]
			if "parent" in filters:
				self.assertEqual(filters["parent"], "student@example.com")
				self.assertEqual(filters["parenttype"], "User")
				self.assertEqual(filters["parentfield"][0], "in")
			else:
				self.assertEqual(list(filters.values()), ["student@example.com"])
			fields = call.kwargs["fields"]
			self.assertNotIn("*", fields)
			self.assertFalse(
				set(fields)
				& {
					"api_secret",
					"api_key",
					"reset_password_key",
					"password",
					"recovery_codes",
					"trusted_devices",
					"modified_by",
					"member_name",
					"scorm_content",
				}
			)

	def test_export_fields_exist_in_real_metadata_and_security_doc_is_absent(self):
		for spec in self.api.USER_DATA_FIELDS:
			if spec["doctype"] == "User":
				path = ROOT.parent / "frappe/frappe/core/doctype/user/user.json"
				if not path.exists():
					path = ROOT / ".local/i18n-apps/frappe/frappe/core/doctype/user/user.json"
			else:
				slug = spec["doctype"].lower().replace(" ", "_")
				path = ROOT / "lms/lms/doctype" / slug / (slug + ".json")
			fields = {f["fieldname"] for f in json.loads(path.read_text())["fields"]} | {
				"name",
				"creation",
				"owner",
				"verify_terms",
			}
			if spec["doctype"] == "User":
				fields.update(
					f["fieldname"]
					for f in json.loads((ROOT / "lms/install_data/custom_field.json").read_text())["User"]
				)
			self.assertLessEqual(set(spec["export_fields"]) | {spec["filter_by"]}, fields)
		self.assertNotIn("LMS Account Security", str(self.api.USER_DATA_FIELDS))

	def test_profile_export_keeps_nonempty_personal_values_and_excludes_credentials(self):
		profile = {
			field: "SYNTHETIC " + field
			for field in (
				"email",
				"first_name",
				"middle_name",
				"last_name",
				"full_name",
				"username",
				"birth_date",
				"user_image",
				"cover_image",
				"banner_image",
				"bio",
				"headline",
				"open_to",
				"linkedin",
				"github",
				"twitter",
				"gender",
				"location",
				"interest",
				"phone",
				"mobile_no",
				"language",
				"time_zone",
				"desk_theme",
				"email_signature",
				"country",
				"user_category",
				"medium",
				"profession",
				"preferred_location",
				"dream_companies",
				"attire",
				"collaboration",
				"role",
				"location_preference",
				"time",
				"company_type",
				"city",
				"college",
				"branch",
			)
		}
		profile.update(name="student@example.com", api_secret="NOT_A_REAL_SECRET", roles=["System Manager"])
		self.frappe.get_all.side_effect = lambda doctype, filters, fields: (
			[{field: profile[field] for field in fields if field in profile}] if doctype == "User" else []
		)
		exported = json.loads(self.api.safe_export("student@example.com"))["User"][0]
		self.assertEqual(
			{k: exported.get(k) for k in profile if k not in {"api_secret", "roles"}},
			{k: v for k, v in profile.items() if k not in {"api_secret", "roles"}},
		)
		self.assertNotIn("api_secret", exported)
		self.assertNotIn("roles", exported)

	def test_native_private_file_delivery_is_queued_with_only_the_safe_payload(self):
		request = self.api.SafePersonalDataDownload()
		request.name, request.doctype, request.user = "request07", "Personal Data Download Request", "alice"
		request.after_insert()
		call = self.frappe.enqueue_doc.call_args
		self.assertEqual(call.args, (request.doctype, request.name, "generate_file_and_send_mail"))
		self.assertNotIn("api_secret", call.kwargs["personal_data"])


class TestPrivacyDeletion(PrivacyFixture):
	def setUp(self):
		super().setUp()
		self.request = Row(
			name="request07",
			doctype="Personal Data Deletion Request",
			email="alice@example.com",
			status="Pending Approval",
			modified="v1",
			check_permission=Mock(),
		)
		self.frappe.get_doc.return_value = self.request

	def test_preview_requires_manager_and_rejects_standard_user(self):
		self.frappe.only_for.side_effect = Denied("manager required")
		with self.assertRaises(Denied):
			self.api.deletion_preview("request07")
		self.frappe.only_for.side_effect = None
		self.request.email = "Administrator"
		with self.assertRaises(Denied):
			self.api.deletion_preview("request07")

	def test_pending_verification_or_hold_cannot_be_executed(self):
		for status in ("Pending Verification", "On Hold", "Deleted"):
			self.request.status = status
			preview = self.api.deletion_preview("request07")
			self.assertFalse(preview["ready"])
			with self.assertRaises(Denied):
				self.api.confirm_data_deletion(
					"request07",
					"request07",
					preview["digest"],
					True,
					"Synthetic review of retained learning records.",
				)
		self.frappe.enqueue_doc.assert_not_called()

	def test_changed_cv_content_invalidates_preview_even_without_timestamp_change(self):
		row = Row(
			name="cv-own",
			parentfield="work_experience",
			idx=1,
			modified="same-time",
			title="SYNTHETIC BEFORE",
		)
		self.frappe.get_all.side_effect = lambda doctype, **kwargs: (
			[row.copy()] if doctype == "Work Experience" else []
		)
		before = self.api.deletion_preview("request07")
		self.assertEqual(before["profile_records"]["Work Experience"][0]["name"], "cv-own")
		self.assertNotIn("SYNTHETIC BEFORE", json.dumps(before))
		row.title = "SYNTHETIC AFTER"
		after = self.api.deletion_preview("request07")
		self.assertNotEqual(before["digest"], after["digest"])
		with self.assertRaises(Denied):
			self.api.confirm_data_deletion(
				"request07",
				"request07",
				before["digest"],
				True,
				"Synthetic review of retained learning records.",
			)
		self.frappe.enqueue_doc.assert_not_called()

	def test_dependencies_are_blockers_and_not_deleted(self):
		self.frappe.get_all.return_value = [
			Row(name="course07", parent="course07", parenttype="LMS Course", modified="v1")
		]
		preview = self.api.deletion_preview("request07")
		self.assertFalse(preview["ready"])
		self.assertTrue(preview["dependencies"])
		with self.assertRaises(Denied):
			self.api.confirm_data_deletion(
				"request07",
				"request07",
				preview["digest"],
				True,
				"Synthetic review of retained learning records.",
			)
		self.frappe.db.delete.assert_not_called()

	def test_explicit_exact_confirmation_and_current_digest(self):
		preview = self.api.deletion_preview("request07")
		self.assertTrue(preview["ready"])
		with self.assertRaises(Denied):
			self.api.confirm_data_deletion(
				"request07", "yes", preview["digest"], True, "Synthetic review of retained learning records."
			)
		self.request.modified = "v2"
		with self.assertRaises(Denied):
			self.api.confirm_data_deletion(
				"request07",
				"request07",
				preview["digest"],
				True,
				"Synthetic review of retained learning records.",
			)
		fresh = self.api.deletion_preview("request07")
		self.api.confirm_data_deletion(
			"request07", "request07", fresh["digest"], True, "Synthetic review of retained learning records."
		)
		self.assertTrue(self.frappe.enqueue_doc.call_args.kwargs["enqueue_after_commit"])

	def test_native_automatic_and_direct_deletion_are_guarded(self):
		doc = self.api.SafePersonalDataDeletion()
		doc.name = "request07"
		with self.assertRaises(Denied):
			doc.trigger_data_deletion()
		with self.assertRaises(Denied):
			doc._anonymize_data(email="another-user")

	def test_retention_review_cannot_be_replaced_by_false_string_or_empty_note(self):
		preview = self.api.deletion_preview("request07")
		for reviewed, note in (
			("false", "A sufficiently long synthetic review"),
			(False, "A sufficiently long synthetic review"),
			(True, ""),
		):
			with self.assertRaises(Denied):
				self.api.confirm_data_deletion("request07", "request07", preview["digest"], reviewed, note)
		self.frappe.enqueue_doc.assert_not_called()

	def test_transfer_uses_native_document_save_preserves_collaborators_and_is_idempotent(self):
		doc = Row(
			owner="departing",
			instructors=[Row(instructor="departing"), Row(instructor="collaborator")],
			check_permission=Mock(),
			save=Mock(),
			add_comment=Mock(),
		)
		doc.set = lambda field, rows: doc.update({field: rows})
		doc.append = lambda field, row: doc[field].append(Row(row))
		self.frappe.get_doc.return_value = doc
		utils = ModuleType("lms.lms.utils")
		utils.has_course_instructor_role = lambda _: True
		utils.has_moderator_role = lambda _: False
		with patch.dict(sys.modules, {"lms.lms.utils": utils}):
			self.api.transfer_authoring("LMS Course", "course07", "departing", "successor", "course07")
			self.assertEqual([row.instructor for row in doc.instructors], ["collaborator", "successor"])
			self.assertEqual(doc.owner, "departing")
			self.api.transfer_authoring("LMS Course", "course07", "departing", "successor", "course07")
		doc.save.assert_called_once()
		doc.check_permission.assert_called_with("write")

	def test_transfer_refuses_unrelated_document_wrong_confirmation_or_inactive_successor(self):
		utils = ModuleType("lms.lms.utils")
		utils.has_course_instructor_role = lambda _: True
		utils.has_moderator_role = lambda _: False
		with patch.dict(sys.modules, {"lms.lms.utils": utils}):
			for doctype, confirmation in (("User", "course07"), ("LMS Course", "yes")):
				with self.assertRaises(Denied):
					self.api.transfer_authoring(doctype, "course07", "departing", "successor", confirmation)
			self.frappe.db.get_value.return_value = 0
			with self.assertRaises(Denied):
				self.api.transfer_authoring("LMS Course", "course07", "departing", "successor", "course07")

	def test_generic_user_delete_preserves_learning_history(self):
		class NativeUser:
			def on_trash(self):
				return "native deletion of unrelated user"

		class ProtectedUser(self.api.PreserveLearningUser, NativeUser):
			name = "alice@example.com"

		self.assertEqual(ProtectedUser().on_trash(), "native deletion of unrelated user")
		self.frappe.db.exists.return_value = True
		with self.assertRaises(Denied):
			ProtectedUser().on_trash()

	def test_job_rechecks_actor_policy_and_changed_dependencies_before_mutation(self):
		doc = self.api.SafePersonalDataDeletion()
		doc.name, doc.email, doc.doctype = "request07", self.request.email, "Personal Data Deletion Request"
		doc.reload, doc.disable_user = Mock(), Mock()
		preview = self.api.deletion_preview("request07")
		with self.assertRaises(Denied):
			doc.icarus_anonymize(preview["digest"], "other-manager", "review record")
		self.settings.publication_approved = 0
		with self.assertRaises(Denied):
			doc.icarus_anonymize(preview["digest"], "manager", "review record")
		doc.disable_user.assert_not_called()

	def test_native_redaction_targets_only_profile_cv_and_notifies_only_after_success(self):
		trace = []

		class NativeRequest:
			def _anonymize_data(self):
				trace.append("native user anonymization")
				self.test.assertEqual(self.partial_privacy_docs, [])
				self.test.assertEqual(
					[spec["doctype"] for spec in self.full_match_privacy_docs],
					[
						"User",
						"Education Detail",
						"Work Experience",
						"Certification",
						"Skills",
						"Preferred Function",
						"Preferred Industry",
					],
				)

		class ProtectedRequest(self.api.SafePersonalDataDeletion, NativeRequest):
			name, email, doctype = "request07", "alice@example.com", "Personal Data Deletion Request"
			test = self
			reload = Mock()

			def disable_user(self):
				trace.append("disable")

			def add_comment(self, *args, **kwargs):
				trace.append("audit")

			def notify_user_after_deletion(self):
				trace.append("mail")

		preview = self.api.deletion_preview("request07")
		ProtectedRequest().icarus_anonymize(preview["digest"], "manager", "review record")
		self.assertEqual(trace, ["disable", "native user anonymization", "audit", "mail"])
		self.assertIsNone(self.api._deletion.get())

	def test_profile_nullable_fields_do_not_get_invalid_native_link_or_select_placeholders(self):
		class NativeRequest:
			def generate_anonymization_dict(self, ref):
				return {
					"email": "anon@example.test",
					"first_name": "[REDACTED]",
					"birth_date": "1111-01-01",
					"gender": "gender",
					"language": "language",
					"open_to": "open_to",
					"bio": "bio",
				}

		class Request(self.api.SafePersonalDataDeletion, NativeRequest):
			pass

		result = Request().generate_anonymization_dict({"doctype": "User"})
		self.assertEqual(
			{key: result[key] for key in ("email", "first_name", "birth_date")},
			{"email": "anon@example.test", "first_name": "[REDACTED]", "birth_date": "1111-01-01"},
		)
		for key in (
			"gender",
			"language",
			"open_to",
			"bio",
			"headline",
			"user_image",
			"cover_image",
			"banner_image",
			"linkedin",
			"github",
			"twitter",
			"email_signature",
			"profession",
			"college",
		):
			self.assertIsNone(result[key])

	def test_cv_redaction_uses_native_row_writes_with_exact_user_parent_scope(self):
		trace = []

		class NativeRequest:
			def redact_full_match_data(self, ref, email):
				trace.append(("native", ref, email))

			def generate_anonymization_dict(self, ref):
				return {"title": "[REDACTED]", "description": "description", "current": "current"}

			def redact_doc(self, doc, ref):
				trace.append((doc, ref, self.anonymize_fields_dict.copy()))

		class Request(self.api.SafePersonalDataDeletion, NativeRequest):
			pass

		self.frappe.get_meta = Mock(
			return_value=SimpleNamespace(
				get_field=lambda field: SimpleNamespace(
					fieldtype={"title": "Data", "description": "Small Text", "current": "Check"}[field]
				)
			)
		)
		self.frappe.get_all.return_value = [Row(name="own-cv-row", parent="alice@example.com")]
		ref = {
			"doctype": "Work Experience",
			"filter_by": "parent",
			"profile_parentfields": ("work_experience", "internship"),
			"redact_fields": ["title", "description", "current"],
		}
		Request().redact_full_match_data(ref, "alice@example.com")
		self.assertEqual(
			self.frappe.get_all.call_args.kwargs["filters"],
			{
				"parent": "alice@example.com",
				"parenttype": "User",
				"parentfield": ["in", ("work_experience", "internship")],
			},
		)
		self.assertEqual(trace[0][2], {"title": "[REDACTED]", "description": None, "current": 0})
		Request().redact_full_match_data({"doctype": "Unrelated"}, "alice@example.com")
		self.assertEqual(trace[-1][0], "native")
		self.frappe.db.delete.assert_not_called()

	def test_required_profile_reference_is_created_natively_and_existing_coherent_row_is_not_written(self):
		self.frappe.get_doc.return_value = Mock()
		for doctype, field in (("User Skill", "skill"), ("Industry", "industry")):
			with self.subTest(doctype=doctype):
				row = Row(name="[REDACTED]", **{field: "[REDACTED]"})
				self.frappe.db.get_value.side_effect = [None, row]
				self.frappe.get_doc.reset_mock()
				self.assertEqual(self.api.redacted_profile_reference(doctype, field), "[REDACTED]")
				self.frappe.get_doc.assert_called_once_with({"doctype": doctype, field: "[REDACTED]"})
				self.frappe.get_doc.return_value.insert.assert_called_with(
					ignore_permissions=True, ignore_if_duplicate=True
				)
				self.frappe.db.get_value.side_effect = [row, row]
				self.frappe.get_doc.reset_mock()
				self.assertEqual(self.api.redacted_profile_reference(doctype, field), "[REDACTED]")
				self.frappe.get_doc.assert_not_called()
		self.frappe.db.commit.assert_not_called()
		self.frappe.db.rollback.assert_not_called()

	def test_incompatible_profile_marker_is_not_overwritten_and_absent_cv_does_not_create_it(self):
		self.frappe.db.get_value.side_effect = [
			Row(name="[REDACTED]", skill="unrelated"),
			Row(name="[REDACTED]", skill="unrelated"),
		]
		with self.assertRaises(Denied):
			self.api.redacted_profile_reference("User Skill", "skill")
		self.frappe.get_doc.assert_not_called()
		self.frappe.db.set_value.assert_not_called()
		with self.assertRaises(ValueError):
			self.api.redacted_profile_reference("Role", "role_name")
		self.frappe.get_all.return_value = []
		self.api.SafePersonalDataDeletion().redact_full_match_data(
			{"doctype": "Skills", "profile_parentfields": ("skill",)}, "alice@example.com"
		)
		self.frappe.get_doc.assert_not_called()

	def test_only_native_concurrency_codes_are_typed_conflicts_without_retry(self):
		for code in (1020, 1213, 1064, 1062, 9999):
			with self.subTest(code=code):
				doc = self.api.SafePersonalDataDeletion()
				doc.name, doc.email, doc.doctype = (
					"request07",
					"alice@example.test",
					"Personal Data Deletion Request",
				)
				doc.reload, doc.disable_user = Mock(), Mock()
				cause = self.frappe.db.OperationalError(code, "PRIVATE_SQL_NONCREDENTIAL_MARKER")
				error = self.frappe.QueryDeadlockError("PRIVATE_SQL_NONCREDENTIAL_MARKER")
				error.__cause__ = cause
				self.frappe.db.get_value.side_effect = error
				try:
					doc.icarus_anonymize("digest", "manager", "review record")
				except Exception as result:
					if code in (1020, 1213):
						self.assertIsInstance(result, self.api.PrivacyImpactConflictError)
						self.assertEqual(result.native_code, code)
						self.assertNotIn(
							"PRIVATE_SQL_NONCREDENTIAL_MARKER", "".join(traceback.format_exception(result))
						)
						self.assertTrue(result.__suppress_context__)
					else:
						self.assertIs(result, error)
				else:
					self.fail("Rejected job returned success")
				doc.reload.assert_not_called()
				doc.disable_user.assert_not_called()
				self.frappe.db.commit.assert_not_called()
				self.frappe.db.rollback.assert_not_called()
				self.assertIsNone(self.api._deletion.get())
		self.frappe.db.get_value.side_effect = None

	def test_wrong_error_class_missing_cause_and_wrong_cause_are_not_converted(self):
		for error in (
			self.frappe.db.OperationalError(1213, "synthetic"),
			self.frappe.QueryDeadlockError("synthetic"),
		):
			for cause in (None, ValueError(1213), self.frappe.db.OperationalError()):
				with self.subTest(error=type(error).__name__, cause=type(cause).__name__):
					error.__cause__ = cause
					doc = self.api.SafePersonalDataDeletion()
					doc.name, doc.email, doc.doctype = (
						"request07",
						"alice@example.test",
						"Personal Data Deletion Request",
					)
					self.frappe.db.get_value.side_effect = error
					with self.assertRaises(type(error)) as raised:
						doc.icarus_anonymize("digest", "manager", "review record")
					self.assertIs(raised.exception, error)
		self.frappe.db.commit.assert_not_called()
		self.frappe.db.rollback.assert_not_called()

	def test_context_is_cleared_on_native_redaction_error_without_hiding_other_sql(self):
		cause = self.frappe.db.OperationalError(1062, "synthetic unrelated SQL")

		class NativeRequest:
			def _anonymize_data(inner):
				self.assertEqual(self.api._deletion.get(), "request07")
				raise cause

		class ProtectedRequest(self.api.SafePersonalDataDeletion, NativeRequest):
			name, email, doctype = "request07", "alice@example.test", "Personal Data Deletion Request"
			reload, disable_user, add_comment, notify_user_after_deletion = Mock(), Mock(), Mock(), Mock()

		with patch.object(self.api, "deletion_preview", return_value={"ready": True, "digest": "current"}):
			with self.assertRaises(self.frappe.db.OperationalError) as raised:
				ProtectedRequest().icarus_anonymize("current", "manager", "review record")
		self.assertIs(raised.exception, cause)
		ProtectedRequest.add_comment.assert_not_called()
		ProtectedRequest.notify_user_after_deletion.assert_not_called()
		self.assertIsNone(self.api._deletion.get())
		self.frappe.db.commit.assert_not_called()
		self.frappe.db.rollback.assert_not_called()

	def test_job_status_checks_site_target_protocol_and_native_permission_without_traceback(self):
		background = ModuleType("frappe.utils.background_jobs")
		job = Mock()
		job.kwargs = {
			"site": "qa.localhost",
			"user": "manager",
			"method": "frappe.utils.background_jobs.run_doc_method",
			"kwargs": {
				"doctype": self.request.doctype,
				"name": self.request.name,
				"doc_method": "icarus_anonymize",
				"actor": "manager",
			},
		}
		job.meta = {"lms_privacy_state": "conflict", "lms_privacy_conflict_code": 1213}
		job.get_status.return_value = SimpleNamespace(value="failed")
		job.exc_info = "PRIVATE_SQL_NONCREDENTIAL_MARKER"
		background.get_job = Mock(return_value=job)
		self.frappe.local = SimpleNamespace(site="qa.localhost")
		self.request.check_permission = Mock()
		job_id = "lms-privacy-" + "a" * 32
		with patch.dict(sys.modules, {"frappe.utils.background_jobs": background}):
			state = self.api.get_anonymization_status(self.request.name, job_id)
			self.assertEqual(state["status"], "conflict")
			self.assertEqual(set(state), {"status", "message"})
			self.assertNotIn("PRIVATE_SQL", str(state))
			self.request.status = "Deleted"
			self.assertEqual(
				self.api.get_anonymization_status(self.request.name, job_id)["status"], "completed"
			)
			for key, bad in (
				("site", "foreign.localhost"),
				("method", "different.method"),
				("user", "outsider"),
			):
				previous = job.kwargs[key]
				job.kwargs[key] = bad
				with self.assertRaises(Denied):
					self.api.get_anonymization_status(self.request.name, job_id)
				job.kwargs[key] = previous
			for key, bad in (
				("name", "other-request"),
				("doctype", "User"),
				("actor", "outsider"),
				("doc_method", "delete"),
			):
				previous = job.kwargs["kwargs"][key]
				job.kwargs["kwargs"][key] = bad
				with self.assertRaises(Denied):
					self.api.get_anonymization_status(self.request.name, job_id)
				job.kwargs["kwargs"][key] = previous
			with self.assertRaises(Denied):
				self.api.get_anonymization_status(self.request.name, "foreign-job")
			self.request.check_permission.side_effect = Denied("no read")
			with self.assertRaises(Denied):
				self.api.get_anonymization_status(self.request.name, job_id)
		self.request.check_permission.assert_called_with("read")

	def test_failure_callback_records_only_business_state_and_preserves_native_retention(self):
		background = ModuleType("frappe.utils.background_jobs")
		background.truncate_failed_registry = Mock()
		job = Mock(meta={})
		with patch.dict(sys.modules, {"frappe.utils.background_jobs": background}):
			coded = self.api.PrivacyImpactConflictError("safe")
			coded.native_code = 1213
			for error, expected in (
				(self.api.PrivacyImpactConflictError("safe"), {"lms_privacy_state": "conflict"}),
				(coded, {"lms_privacy_state": "conflict", "lms_privacy_conflict_code": 1213}),
				(ValueError("synthetic internal cause"), {"lms_privacy_state": "failed"}),
			):
				self.api.privacy_job_failure(job, "redis", type(error), error, None)
				self.assertEqual(job.meta, expected)
				background.truncate_failed_registry.assert_called_with(job, "redis", type(error), error, None)
		self.assertEqual(job.save_meta.call_count, 3)


if __name__ == "__main__":
	unittest.main(verbosity=2)
