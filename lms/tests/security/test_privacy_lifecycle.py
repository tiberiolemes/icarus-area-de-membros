"""Native fixture checks for08. No real person, policy approval or SMTP is used."""

import json
from unittest.mock import patch

import frappe

from lms.lms.privacy import get_deletion_preview, require_public_registration, safe_export
from lms.lms.test_helpers import BaseTestUtils


class TestPrivacyLifecycle(BaseTestUtils):
	def setUp(self):
		super().setUp()
		mail = patch("frappe.sendmail")
		mail.start()
		self.addCleanup(mail.stop)
		frappe.set_user("Administrator")
		self.student = self._create_user(
			f"qc07-{frappe.generate_hash(length=10)}@example.com", "QC07", "Student", ["LMS Student"]
		)
		self.other = self._create_user(
			f"qc07-other-{frappe.generate_hash(length=10)}@example.com", "QC07", "Other", ["LMS Student"]
		)

	def test_single_settings_are_manager_only_and_do_not_approve_themselves(self):
		meta = frappe.get_meta("LMS Privacy Settings")
		self.assertTrue(meta.issingle)
		self.assertEqual({p.role for p in meta.permissions}, {"System Manager"})
		frappe.set_user(self.student.name)
		self.assertFalse(frappe.has_permission("LMS Privacy Settings", "write"))

	def test_generic_rest_insert_cannot_bypass_public_registration_context(self):
		frappe.set_user("Guest")
		with patch("lms.lms.privacy.policy_state", return_value={"ready": True, "revision": "synthetic"}):
			with self.assertRaises(frappe.PermissionError):
				frappe.get_doc(
					{
						"doctype": "User",
						"email": f"qc07-bypass-{frappe.generate_hash(length=8)}@example.com",
						"first_name": "QC07",
						"verify_terms": 1,
						"send_welcome_email": 0,
					}
				).insert(ignore_permissions=True)

	def test_native_download_hook_excludes_account_secrets_and_other_members(self):
		data = json.loads(safe_export(self.student.name))
		self.assertEqual([row["name"] for row in data["User"]], [self.student.name])
		self.assertNotIn(self.other.name, json.dumps(data))
		self.assertFalse(set(data["User"][0]) & {"api_key", "api_secret", "reset_password_key", "password"})
		with patch("frappe.enqueue_doc") as queued:
			frappe.get_doc({"doctype": "Personal Data Download Request", "user": self.student.name}).insert()
		self.assertEqual(queued.call_args.args[2], "generate_file_and_send_mail")
		self.assertNotIn("api_secret", queued.call_args.kwargs["personal_data"])

	def test_unverified_request_and_legacy_delete_method_cannot_destroy_data(self):
		with patch("frappe.sendmail"):
			request = frappe.get_doc(
				{"doctype": "Personal Data Deletion Request", "email": self.student.name}
			).insert()
		preview = get_deletion_preview(request.name)
		self.assertFalse(preview["ready"])
		with self.assertRaises(frappe.ValidationError):
			request.trigger_data_deletion()
		self.assertTrue(frappe.db.exists("User", self.student.name))

	def test_preview_denies_nonmanager_and_generic_user_delete_preserves_enrollment(self):
		course = self._create_course(f"QC07 {frappe.generate_hash(length=6)}", self.other.name)
		frappe.get_doc(
			{"doctype": "LMS Enrollment", "course": course.name, "member": self.student.name}
		).insert(ignore_permissions=True)
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("User", self.student.name, force=True, ignore_permissions=True)
		self.assertTrue(
			frappe.db.exists("LMS Enrollment", {"member": self.student.name, "course": course.name})
		)
		frappe.set_user(self.student.name)
		with self.assertRaises(frappe.PermissionError):
			get_deletion_preview("unknown")

	def test_terms_false_strings_never_authorize_registration(self):
		with patch("lms.lms.privacy.policy_state", return_value={"ready": True, "revision": "synthetic"}):
			for value in (False, "false", "0", 0, None):
				with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
					require_public_registration(value)
