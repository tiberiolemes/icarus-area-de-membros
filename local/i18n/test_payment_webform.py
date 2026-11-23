"""Source-boundary checks; native HTTP authorization is a separate acceptance gate."""

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from apply_overlay import apply, sha

HERE = Path(__file__).parent


class Data(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__


class Denied(Exception):
	pass


class PaymentWebFormTests(unittest.TestCase):
	def setUp(self):
		self.row = next(
			row
			for row in json.loads((HERE / "payments-overlay.json").read_text())["patches"]
			if row["path"] == "overrides/payment_webform.py"
		)
		self.source = self.row["replacements"][0][1]
		self.events = []
		parent = self

		class NativeWebForm:
			def validate_submission(self, doc, uploaded_fields=None):
				parent.events.append(("native validation", doc, uploaded_fields))

		frappe = types.ModuleType("frappe")
		frappe.whitelist = lambda **kw: lambda fn: fn
		frappe._dict = Data
		frappe._ = lambda value: value
		frappe.PermissionError = Denied
		frappe.parse_json = lambda value: json.loads(value) if isinstance(value, str) else value
		frappe.throw = Mock(side_effect=Denied)
		self.form = Data(doc_type="Personal Data Deletion Request", accept_payment=False)
		self.form.get_payment_gateway_url = Mock(return_value="synthetic-gateway-double")
		frappe.get_lazy_doc = Mock(return_value=self.form)
		native = types.ModuleType("frappe.website.doctype.web_form.web_form")
		native.WebForm = NativeWebForm
		self.doc = Mock()
		native.accept = Mock(return_value=self.doc)
		rate = types.ModuleType("frappe.rate_limiter")
		rate.rate_limit = lambda **kw: lambda fn: fn
		utils = types.ModuleType("frappe.utils")
		utils.flt = float
		payments = types.ModuleType("payments.utils")
		payments.get_payment_gateway_controller = Mock()
		scope = {}
		with patch.dict(
			sys.modules,
			{
				"frappe": frappe,
				"frappe.website.doctype.web_form.web_form": native,
				"frappe.rate_limiter": rate,
				"frappe.utils": utils,
				"payments.utils": payments,
			},
		):
			exec(compile(self.source, self.row["path"], "exec"), scope)
		self.accept = scope["accept"]
		self.payment_class = scope["PaymentWebForm"]
		self.core = native.accept
		self.frappe = frappe

	def test_hash_pinned_preimage_and_result_are_idempotent_and_refuse_drift(self):
		self.assertEqual(sha(self.row["replacements"][0][0].encode()), self.row["before_sha256"])
		self.assertEqual(sha(self.source.encode()), self.row["after_sha256"])
		with tempfile.TemporaryDirectory() as folder:
			root = Path(folder)
			(root / "__init__.py").write_text('__version__ = "16.0.1"')
			target = root / self.row["path"]
			target.parent.mkdir()
			target.write_text(self.row["replacements"][0][0])
			manifest = {"payments_version": "16.0.1", "patches": [self.row]}
			self.assertEqual(apply(root, manifest), 1)
			self.assertEqual(apply(root, manifest), 0)
			target.write_text(self.source + "# drift")
			with self.assertRaises(RuntimeError):
				apply(root, manifest)

	def test_native_protocol_receives_request_key_declared_data_and_docname_alias(self):
		result = self.accept(
			"configured-form",
			json.dumps({"email": "synthetic@example.test"}),
			docname="owned-document",
			web_form_request_key="synthetic-key",
		)
		self.assertIs(result, self.doc)
		args, kwargs = self.core.call_args
		self.assertEqual(args[0], "configured-form")
		self.assertEqual(json.loads(args[1]), {"email": "synthetic@example.test", "name": "owned-document"})
		self.assertEqual(kwargs, {"web_form_request_key": "synthetic-key"})
		self.form.get_payment_gateway_url.assert_not_called()

	def test_client_type_and_payment_flag_cannot_select_foreign_writer_or_gateway(self):
		for server_payment in (False, True):
			self.form.accept_payment = server_payment
			for flag in (False, True, "false", "true"):
				with self.subTest(server_payment=server_payment, flag=flag):
					with self.assertRaises(Denied):
						self.accept(
							"configured-form",
							json.dumps({"doctype": "Error Log", "name": "foreign"}),
							for_payment=flag,
						)
		self.core.assert_not_called()
		self.form.get_payment_gateway_url.assert_not_called()

	def test_conflicting_alias_and_payment_request_on_nonfinancial_form_fail_before_core(self):
		for kwargs in ({"docname": "foreign"}, {"for_payment": True}):
			with self.assertRaises(Denied):
				self.accept("configured-form", json.dumps({"name": "owned"}), **kwargs)
		self.core.assert_not_called()
		self.form.get_payment_gateway_url.assert_not_called()

	def test_core_permission_key_publication_and_validation_errors_are_never_caught(self):
		self.form.accept_payment = True
		for cause in (
			"unpublished",
			"login required",
			"invalid request key",
			"foreign reference",
			"undeclared value invalid",
		):
			error = Denied(cause)
			self.core.side_effect = error
			with self.assertRaises(Denied) as raised:
				self.accept("configured-form", json.dumps({"doctype": self.form.doc_type}), for_payment=True)
			self.assertIs(raised.exception, error)
		self.form.get_payment_gateway_url.assert_not_called()

	def test_financial_validation_is_server_selected_even_without_client_payment_flag(self):
		form = self.payment_class()
		form.accept_payment = True
		form.validate_mandatory = Mock(
			side_effect=lambda *args, **kw: self.events.append(("mandatory", args, kw))
		)
		self.doc.run_method.side_effect = lambda method: self.events.append(method)
		form.validate_submission(self.doc, uploaded_fields={"attachment"})
		self.assertEqual(self.events[0], ("native validation", self.doc, {"attachment"}))
		form.validate_mandatory.assert_called_once_with(self.doc, uploaded_fields={"attachment"})
		self.assertEqual(self.events[-1], "validate_payment")

	def test_gateway_double_is_reached_only_after_core_accepts_configured_financial_document(self):
		self.form.accept_payment = True
		self.assertEqual(
			self.accept(
				"configured-form",
				{"doctype": self.form.doc_type},
				for_payment="true",
				web_form_request_key="synthetic-key",
			),
			"synthetic-gateway-double",
		)
		self.core.assert_called_once()
		self.form.get_payment_gateway_url.assert_called_once_with(self.doc)


if __name__ == "__main__":
	unittest.main(verbosity=2)
