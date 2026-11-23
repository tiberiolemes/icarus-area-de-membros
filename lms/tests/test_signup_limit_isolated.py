"""Versioned Website Settings must not make the public registration limiter unusable."""

import ast
import unittest
from pathlib import Path
from unittest.mock import Mock


def load_limit():
	tree = ast.parse((Path(__file__).parents[1] / "lms/user.py").read_text())
	function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "get_signup_limit")
	frappe = Mock()
	scope = {"frappe": frappe, "cint": lambda value: int(value or 0)}
	exec(compile(ast.Module(body=[function], type_ignores=[]), "<native signup limit>", "exec"), scope)
	return scope["get_signup_limit"], frappe


class TestSignupLimit(unittest.TestCase):
	def test_version16_without_field_keeps_the_documented_default_without_querying_missing_metadata(self):
		limit, frappe = load_limit()
		frappe.get_meta.return_value.has_field.return_value = False
		frappe.db.get_single_value.side_effect = AssertionError("Missing schema field must not be queried")
		self.assertEqual(limit(), 500)
		frappe.db.get_single_value.assert_not_called()

	def test_version_with_field_uses_the_real_configured_cap(self):
		limit, frappe = load_limit()
		frappe.get_meta.return_value.has_field.return_value = True
		frappe.db.get_single_value.return_value = 2
		self.assertEqual(limit(), 2)
		frappe.db.get_single_value.assert_called_once_with("Website Settings", "max_signups_per_minute")

	def test_empty_configured_cap_keeps_the_documented_default(self):
		limit, frappe = load_limit()
		frappe.get_meta.return_value.has_field.return_value = True
		frappe.db.get_single_value.return_value = None
		self.assertEqual(limit(), 500)


if __name__ == "__main__":
	unittest.main()
