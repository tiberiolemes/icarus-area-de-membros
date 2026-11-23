import json
import re

import frappe
from frappe import _
from frappe.model.document import Document


class LMSAccountSecurity(Document):
	def validate(self):
		try:
			codes = json.loads(self.recovery_codes or "[]")
			devices = json.loads(self.trusted_devices or "[]")
			valid_codes = (
				isinstance(codes, list)
				and len(codes) <= 10
				and all(isinstance(code, str) and re.fullmatch(r"[a-f0-9]{64}", code) for code in codes)
			)
			valid_devices = (
				isinstance(devices, list)
				and len(devices) <= 10
				and all(
					isinstance(device, dict)
					and isinstance(device.get("hash"), str)
					and re.fullmatch(r"[a-f0-9]{64}", device["hash"])
					and isinstance(device.get("expires"), (int, float))
					for device in devices
				)
			)
			if not valid_codes or not valid_devices:
				raise ValueError()
		except (ValueError, TypeError):
			frappe.throw(_("Invalid account security record."))
