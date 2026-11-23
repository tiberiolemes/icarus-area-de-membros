import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

from compose_auth import SUCCESSORS, verify_composed_auth


def sha(text):
	return hashlib.sha256(text.encode()).hexdigest()


class ComposedAuthTests(unittest.TestCase):
	def setUp(self):
		self.temp = tempfile.TemporaryDirectory()
		self.addCleanup(self.temp.cleanup)
		self.root = Path(self.temp.name)
		(self.root / "__init__.py").write_text('__version__ = "16.60.2"')
		self.auth = {"framework_version": "16.60.2", "patches": []}
		self.integration = {"framework_version": "16.60.2", "patches": []}
		for name in sorted(SUCCESSORS | {"auth.py"}):
			path = self.root / name
			path.parent.mkdir(parents=True, exist_ok=True)
			before, after = "auth04 " + name, "integration08 " + name
			self.auth["patches"].append({"path": name, "after_sha256": sha(before)})
			if name in SUCCESSORS:
				self.integration["patches"].append(
					{
						"path": "frappe/" + name,
						"before_sha256": sha(before),
						"after_sha256": sha(after),
						"replacements": [[before, after]],
					}
				)
				path.write_text(after)
			else:
				path.write_text(before)

	def verify(self):
		return verify_composed_auth(self.root, auth_manifest=self.auth, integration_manifest=self.integration)

	def test_complete_chain_and_untouched_auth_are_verified(self):
		self.assertEqual(self.verify(), 4)

	def test_intermediate_auth_output_is_never_final_acceptance(self):
		name = next(iter(SUCCESSORS))
		(self.root / name).write_text("auth04 " + name)
		with self.assertRaises(AssertionError):
			self.verify()

	def test_wrong_bridge_and_untouched_source_drift_are_rejected(self):
		self.integration["patches"][0]["before_sha256"] = sha("wrong bridge")
		with self.assertRaises(AssertionError):
			self.verify()
		self.setUp()
		(self.root / "auth.py").write_text("unreviewed")
		with self.assertRaises(AssertionError):
			self.verify()

	def test_forged_final_hash_without_the_reviewed_transformation_is_rejected(self):
		row = self.integration["patches"][0]
		(self.root / row["path"].removeprefix("frappe/")).write_text("forged final")
		row["after_sha256"] = sha("forged final")
		with self.assertRaises(AssertionError):
			self.verify()

	def test_duplicates_and_missing_successors_are_rejected(self):
		self.auth["patches"].append(copy.deepcopy(self.auth["patches"][0]))
		with self.assertRaises(AssertionError):
			self.verify()
		self.auth["patches"].pop()
		self.integration["patches"].pop()
		with self.assertRaises(AssertionError):
			self.verify()

	def test_an_unreviewed_additional_auth_successor_is_rejected(self):
		self.integration["patches"].append({"path": "frappe/auth.py"})
		with self.assertRaises(AssertionError):
			self.verify()
