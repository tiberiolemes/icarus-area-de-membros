import hashlib
import tarfile
import tempfile
import unittest
from pathlib import Path

from freeze_context import freeze


class FrozenContextTests(unittest.TestCase):
	def test_vendored_code_is_hashed_private_data_excluded_and_archive_frozen(self):
		with tempfile.TemporaryDirectory() as directory:
			base = Path(directory)
			root = base / "source"
			(root / ".local/payments").mkdir(parents=True)
			(root / ".local/payments/source.py").write_text("vendored")
			(root / ".local/db.env").write_text("secret sentinel")
			(root / "source.py").write_text("original")
			(root / "node_modules").mkdir()
			(root / "node_modules/package.js").write_text("installed")
			archive = base / "context.tar"
			proof = freeze(root, archive)
			self.assertEqual(set(proof["files"]), {".local/payments/source.py", "source.py"})
			self.assertEqual(proof["files"][".local/payments/source.py"]["sha256"], hashlib.sha256(b"vendored").hexdigest())
			(root / "source.py").write_text("changed after freeze")
			with tarfile.open(archive) as frozen:
				self.assertEqual(frozen.extractfile("source.py").read(), b"original")
			with self.assertRaises(AssertionError): freeze(root, archive)


if __name__ == "__main__":
	unittest.main()
