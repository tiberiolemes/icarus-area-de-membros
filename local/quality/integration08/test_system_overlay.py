import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from system_overlay import apply


class NativeStartupOverlayTests(unittest.TestCase):
	def setUp(self):
		self.temp = tempfile.TemporaryDirectory()
		self.addCleanup(self.temp.cleanup)
		self.root = Path(self.temp.name)
		self.manifest = json.loads(Path(__file__).with_name("system-overlay.json").read_text())
		for row in self.manifest["patches"]:
			path = self.root / row["path"]
			path.parent.mkdir(parents=True, exist_ok=True)
			before = "\n".join(old * count for old, new, count in row["replacements"])
			after = before
			for old, new, count in row["replacements"]:
				after = after.replace(old, new)
			row["before_sha256"] = hashlib.sha256(before.encode()).hexdigest()
			row["after_sha256"] = hashlib.sha256(after.encode()).hexdigest()
			path.write_text(before)

	def test_apply_verify_and_repeat_no_op(self):
		self.assertEqual(apply(self.root, self.manifest), 3)
		self.assertEqual(apply(self.root, self.manifest), 0)
		self.assertEqual(apply(self.root, self.manifest, verify_only=True), 0)

	def test_drift_and_unapplied_verify_are_rejected(self):
		with self.assertRaises(AssertionError):
			apply(self.root, self.manifest, verify_only=True)
		(self.root / self.manifest["patches"][0]["path"]).write_text("unknown native source")
		with self.assertRaises(AssertionError):
			apply(self.root, self.manifest)

	def test_duplicate_and_redirected_targets_are_rejected(self):
		duplicate = copy.deepcopy(self.manifest)
		duplicate["patches"].append(duplicate["patches"][0])
		with self.assertRaises(AssertionError):
			apply(self.root, duplicate)
		path = self.root / self.manifest["patches"][0]["path"]
		path.unlink()
		path.symlink_to(Path(__file__).resolve())
		with self.assertRaises(AssertionError):
			apply(self.root, self.manifest)


if __name__ == "__main__":
	unittest.main()
