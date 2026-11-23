from unittest.mock import patch

import frappe

from lms.lms.test_helpers import BaseTestUtils
from lms.patches.v2_0.account_security_policy import execute


class TestInstallSecurityPolicy(BaseTestUtils):
	def test_unconfigured_system_settings_require_only_the_bounded_expiry_write(self):
		frappe.set_user("Administrator")
		frappe.db.delete(
			"Singles", {"doctype": "System Settings", "field": ["in", ["language", "time_zone"]]}
		)
		frappe.db.set_single_value("System Settings", "reset_password_link_expiry_duration", 7200)
		# Metadata reload has its own clean-install proof; this transaction tests the
		# policy write against real Singles while the setup wizard is still pending.
		with (
			patch.object(frappe, "reload_doc"),
			patch.object(frappe.db, "set_single_value", wraps=frappe.db.set_single_value) as write,
		):
			execute()
			self.assertEqual(
				int(
					frappe.db.get_single_value(
						"System Settings", "reset_password_link_expiry_duration", cache=False
					)
				),
				3600,
			)
			self.assertEqual(frappe.db.get_single_value("System Settings", "language", cache=False), "")
			self.assertEqual(frappe.db.get_single_value("System Settings", "time_zone", cache=False), "")
			execute()
			write.assert_called_once_with("System Settings", "reset_password_link_expiry_duration", 3600)
		frappe.db.set_single_value("System Settings", "reset_password_link_expiry_duration", 1800)
		with (
			patch.object(frappe, "reload_doc"),
			patch.object(frappe.db, "set_single_value", wraps=frappe.db.set_single_value) as write,
		):
			execute()
			self.assertEqual(
				int(
					frappe.db.get_single_value(
						"System Settings", "reset_password_link_expiry_duration", cache=False
					)
				),
				1800,
			)
			write.assert_not_called()
