from pathlib import Path

import frappe

from lms.lms.api import get_branding
from lms.lms.test_helpers import BaseTestUtils
from lms.tiberio_i18n import LOGO


class TestBundledBranding(BaseTestUtils):
	def test_configured_public_signature_does_not_require_a_file_record(self):
		frappe.set_user("Administrator")
		url = LOGO
		self.assertTrue(
			Path(frappe.get_app_path("lms", "public", "images", "assinatura-tiberio.svg")).is_file()
		)
		self.assertFalse(frappe.db.exists("File", {"file_url": url}))
		frappe.db.set_single_value("Website Settings", "banner_image", url)
		frappe.clear_document_cache("Website Settings", "Website Settings")
		frappe.set_user("Guest")
		self.assertEqual(get_branding()["banner_image"], {"file_url": url})

	def test_missing_arbitrary_or_private_urls_do_not_gain_static_asset_fallback(self):
		frappe.set_user("Administrator")
		for url in ("/assets/unknown/logo.svg", "/private/files/qc08-missing.svg", "javascript:alert(1)"):
			frappe.db.set_single_value("Website Settings", "banner_image", url)
			frappe.clear_document_cache("Website Settings", "Website Settings")
			frappe.set_user("Guest")
			self.assertFalse(get_branding()["banner_image"])
			frappe.set_user("Administrator")
