import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "local/i18n"))
from apply_overlay import apply
from merge_catalogs import validate
from messages import messages
from overlay import expected_after


class AuthOverlayTests(unittest.TestCase):
	def setUp(self):
		self.manifest = json.loads((HERE / "framework-overlay.json").read_text())
		self.temporary = tempfile.TemporaryDirectory()
		self.addCleanup(self.temporary.cleanup)
		self.root = Path(self.temporary.name)
		self.originals = ROOT / ".local/i18n-apps/frappe/frappe"
		(self.root / "__init__.py").write_text('__version__ = "16.60.2"\n')
		for row in self.manifest["patches"]:
			data = (self.originals / row["path"]).read_bytes()
			self.assertEqual(hashlib.sha256(data).hexdigest(), row["before_sha256"])
			target = self.root / row["path"]
			target.parent.mkdir(parents=True, exist_ok=True)
			target.write_bytes(data)

	def test_version_hashes_atomic_preflight_and_idempotent_application(self):
		last = self.root / self.manifest["patches"][-1]["path"]
		original = last.read_bytes()
		first = self.root / self.manifest["patches"][0]["path"]
		before = first.read_bytes()
		last.write_bytes(original + b"\n// incompatible\n")
		with self.assertRaises(RuntimeError):
			apply(self.root, self.manifest)
		self.assertEqual(first.read_bytes(), before)
		last.write_bytes(original)
		self.assertEqual(apply(self.root, self.manifest), len(self.manifest["patches"]))
		self.assertEqual(apply(self.root, self.manifest), 0)
		(self.root / "__init__.py").write_text('__version__ = "17.0.0"\n')
		with self.assertRaises(RuntimeError):
			apply(self.root, self.manifest)

	def test_i18n_hash_chain_is_exact_and_all_earlier_files_keep_verification(self):
		previous = json.loads((ROOT / "local/i18n/framework-overlay.json").read_text())
		own = {row["path"]: row for row in self.manifest["patches"]}
		for row in previous["patches"]:
			expected = own.get(row["path"], row)["after_sha256"]
			self.assertEqual(expected_after(row["path"], row["after_sha256"]), expected)
		with self.assertRaises(ValueError):
			expected_after("auth.py", "wrong-input-hash")

	def test_catalog_has_every_new_literal_and_preserves_placeholders(self):
		catalog = json.loads((HERE / "pt-BR.json").read_text())
		existing = json.loads((ROOT / "local/i18n/merged-pt-BR.json").read_text())
		for source, translated in catalog.items():
			validate(source, translated)
		self.assertEqual(set(messages()) - existing.keys() - catalog.keys(), set())


if __name__ == "__main__":
	unittest.main(verbosity=2)
