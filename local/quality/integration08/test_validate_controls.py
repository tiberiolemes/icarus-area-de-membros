"""The repeat-application guard must reject changes beyond permission booleans."""

import copy
import json
import unittest
from pathlib import Path

from validate_controls import validate


class ControlGuardTests(unittest.TestCase):
	def setUp(self):
		self.before = {
			"controls": {
				"DocPerm": [{"name": "permission-one", "parent": "Course Lesson", "role": "Course Creator", "idx": 1, "mask": 0, "impersonate": 0, "match": None}],
				"Custom DocPerm": [{"name": "custom-one", "parent": "Discussion Topic", "role": "LMS Student", "modified": "before"}],
				"User Permission": [], "DocShare": [], "Has Role": [],
			},
			"live_link_references": [], "foreign_keys_to_has_role": 0,
			"foreign_keys_by_control": {"Has Role": 0, "DocPerm": 0},
		}
		self.after = copy.deepcopy(self.before)

	def check(self):
		return validate(self.before, self.after, Path(__file__).resolve().parents[3], migrating=False)

	def test_identical_repeat_is_accepted(self):
		self.assertEqual(self.check()["standard_permission_rows_byte_equal"], 1)

	def test_advanced_right_or_matching_change_is_denied(self):
		for field in ("mask", "impersonate", "match"):
			with self.subTest(field=field):
				self.after = copy.deepcopy(self.before)
				self.after["controls"]["DocPerm"][0][field] = 1
				with self.assertRaises(AssertionError): self.check()

	def test_order_or_identity_change_is_denied_on_repeat(self):
		for field, value in (("idx", 2), ("name", "other-id")):
			with self.subTest(field=field):
				self.after = copy.deepcopy(self.before)
				self.after["controls"]["DocPerm"][0][field] = value
				with self.assertRaises(AssertionError): self.check()

	def test_repeated_custom_permission_write_is_denied(self):
		self.after["controls"]["Custom DocPerm"][0]["modified"] = "after"
		with self.assertRaises(AssertionError): self.check()

	def test_foreign_key_or_live_reference_is_denied(self):
		self.after["foreign_keys_by_control"]["DocPerm"] = 1
		with self.assertRaises(AssertionError): self.check()
		self.after = copy.deepcopy(self.before)
		self.after["live_link_references"] = [{"target": "DocPerm", "count": 1}]
		with self.assertRaises(AssertionError): self.check()

	def flow_roles(self):
		return [{"name": "flow-" + str(idx), "creation": "before", "modified": "before", "parenttype": "Workspace", "parent": "Flow", "parentfield": "roles", "role": role, "idx": idx} for idx, role in ((1, "Flow User"), (2, "System Manager"))]

	def test_duplicate_non_user_binding_is_denied(self):
		self.before["controls"]["Has Role"] = self.flow_roles()
		self.after = copy.deepcopy(self.before)
		duplicate = copy.deepcopy(self.after["controls"]["Has Role"][0])
		duplicate["name"] = "duplicate-id"
		self.after["controls"]["Has Role"].append(duplicate)
		with self.assertRaisesRegex(AssertionError, "Duplicate role binding key"): self.check()

	def test_repeat_accepts_only_exact_two_flow_id_timestamp_regenerations(self):
		self.before["controls"]["Has Role"] = self.flow_roles()
		self.after = copy.deepcopy(self.before)
		for row in self.after["controls"]["Has Role"]:
			row.update(name=row["name"] + "-new", creation="after", modified="after")
		self.assertEqual(len(self.check()["workspace_sync_only"]), 2)
		self.assertIn("functional/business", self.check()["repeat_scope"])
		self.after["controls"]["Has Role"][0]["role"] = "Other Role"
		with self.assertRaises(AssertionError): self.check()

	def reviewed_migration(self):
		root = Path(__file__).resolve().parents[3]
		self.before["controls"]["DocPerm"] = [
			{"name": f"old-{parent}-{idx}", "parent": parent, "parenttype": "DocType", "parentfield": "permissions", "role": f"Role-{idx}", "idx": idx, "read": 1, "mask": 0, "impersonate": 0, "match": None, "modified": "before"}
			for parent, count in (("LMS Course", 3), ("Course Chapter", 7), ("Course Lesson", 3), ("LMS Video Watch Duration", 4))
			for idx in range(1, count + 1)
		]
		self.after = copy.deepcopy(self.before)
		for row in self.after["controls"]["DocPerm"]:
			row.update(name=row["name"] + "-new", modified="after")
		for doctype in ("LMS Account Security", "LMS Community", "LMS Community Grant", "LMS Discussion Decision", "LMS Help Feedback", "LMS Privacy Settings", "LMS Tour Progress"):
			path = next((root / "lms/lms/doctype").glob(doctype.lower().replace(" ", "_") + "/*.json"))
			for idx, permission in enumerate(json.loads(path.read_text())["permissions"]):
				self.after["controls"]["DocPerm"].append({"name": f"new-{doctype}-{idx}", "parent": doctype, **permission})
		for parent in ("Discussion Topic", "Discussion Reply"):
			self.after["controls"]["Custom DocPerm"].append({"name": "manager-" + parent, "parent": parent, "role": "System Manager", "permlevel": 0, "read": 1, "write": 1, "create": 1, "export": 1})
		return root

	def test_native_video_reload_is_exact_and_first_pass_only(self):
		root = self.reviewed_migration()
		proof = validate(self.before, self.after, root, migrating=True)
		self.assertEqual(len(proof["standard_reload_regenerations"]), 17)
		self.assertEqual(sum(row["parent"] == "LMS Video Watch Duration" for row in proof["standard_reload_regenerations"]), 4)
		with self.assertRaises(AssertionError):
			validate(self.before, self.after, root, migrating=False)

	def test_video_reload_rejects_permission_order_and_audience_changes(self):
		for field, value in (("mask", 1), ("idx", 99), ("write", 1), ("role", "Other")):
			with self.subTest(field=field):
				root = self.reviewed_migration()
				row = next(row for row in self.after["controls"]["DocPerm"] if row["parent"] == "LMS Video Watch Duration")
				row[field] = value
				with self.assertRaises(AssertionError):
					validate(self.before, self.after, root, migrating=True)


if __name__ == "__main__":
	unittest.main()
