"""The real shared price function with explicit boundaries; no geolocation/network."""

import ast
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock


class TestLocalCountryPrices(unittest.TestCase):
	def setUp(self):
		path = Path(__file__).parents[1] / "lms/utils.py"
		tree = ast.parse(path.read_text())
		fn = next(
			node
			for node in tree.body
			if isinstance(node, ast.FunctionDef) and node.name == "check_multicurrency"
		)
		self.settings = SimpleNamespace(show_usd_equivalent=1, exception_country=[], apply_rounding=0)
		self.db = Mock()
		self.db.get_value.return_value = None
		self.network = Mock(side_effect=AssertionError("No IP lookup is allowed"))
		self.rate = Mock(return_value=0.2)
		env = {
			"frappe": SimpleNamespace(
				get_single=lambda _: self.settings, session=SimpleNamespace(user="synthetic"), db=self.db
			),
			"get_current_exchange_rate": self.rate,
			"flt": lambda value, places: round(value, places),
			"rounded": round,
			"requests": SimpleNamespace(get=self.network),
		}
		exec(compile(ast.Module(body=[fn], type_ignores=[]), str(path), "exec"), env)
		self.price = env["check_multicurrency"]

	def test_unknown_country_preserves_original_price_even_with_explicit_usd_price(self):
		self.assertEqual(self.price(120, "BRL", amount_usd=50), (120, "BRL"))
		self.network.assert_not_called()
		self.rate.assert_not_called()

	def test_explicit_country_converts_without_reading_user_country(self):
		self.assertEqual(self.price(120, "BRL", country="Portugal"), (24, "USD"))
		self.db.get_value.assert_not_called()
		self.network.assert_not_called()

	def test_local_address_then_user_fallback_are_preserved(self):
		self.db.get_value.side_effect = ["Brazil"]
		self.assertEqual(self.price(120, "BRL"), (24, "USD"))
		self.assertEqual(self.db.get_value.call_count, 1)
		self.db.get_value.reset_mock()
		self.db.get_value.side_effect = [None, "Brazil"]
		self.assertEqual(self.price(120, "BRL"), (24, "USD"))
		self.assertEqual(self.db.get_value.call_count, 2)

	def test_disabled_conversion_and_usd_and_exception_keep_price(self):
		self.settings.show_usd_equivalent = 0
		self.assertEqual(self.price(120, "BRL", "Brazil", 50), (120, "BRL"))
		self.settings.show_usd_equivalent = 1
		self.assertEqual(self.price(120, "USD", "Brazil", 50), (120, "USD"))
		self.settings.exception_country = [SimpleNamespace(country="Brazil")]
		self.assertEqual(self.price(120, "BRL", "Brazil", 50), (120, "BRL"))
		self.rate.assert_not_called()

	def test_explicit_usd_price_and_rounding_keep_existing_semantics(self):
		self.assertEqual(self.price(120, "BRL", "Portugal", 50), (50, "USD"))
		self.rate.assert_not_called()
		self.settings.apply_rounding = 1
		self.assertEqual(self.price(120, "BRL", "Portugal"), (100, "USD"))


if __name__ == "__main__":
	unittest.main(verbosity=2)
