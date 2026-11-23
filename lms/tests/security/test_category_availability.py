"""Q09-02: exact native collation/permissions and uniqueness remain authoritative."""

import frappe
from frappe.client import get_list, insert, rename_doc

from lms.lms.test_helpers import BaseTestUtils


class TestCategoryAvailability(BaseTestUtils):
	def setUp(self):
		super().setUp()
		assert frappe.local.site.startswith("test_") and frappe.conf.mute_emails
		frappe.set_user("Administrator")
		self.prefix = "qc09-" + frappe.generate_hash(length=12)
		self.category = insert({"doctype": "LMS Category", "category": self.prefix + "-Café"})
		self.student = self._create_user(
			self.prefix + "@example.test", "QC09", "Category", ["LMS Student"]
		).name

		manager = self._create_user(
			self.prefix + "-manager@example.test", "QC09", "Manager", ["System Manager"]
		).name
		frappe.set_user(manager)

	def lookup(self, value, own=None):
		filters = [["category", "=", value]]
		if own:
			filters.append(["name", "!=", own])
		return get_list("LMS Category", fields=["name"], filters=filters, limit_page_length=1)

	def test_exact_native_unicode_collation_exclude_self_and_duplicate_insert(self):
		for value in (self.prefix + "-Café", self.prefix.upper() + "-CAFÉ", self.prefix + "-cafe"):
			self.assertEqual(self.lookup(value), [{"name": self.category["name"]}])
			with self.assertRaises((frappe.DuplicateEntryError, frappe.UniqueValidationError)):
				insert({"doctype": "LMS Category", "category": value})
		self.assertEqual(self.lookup(self.prefix + "-Café", self.category["name"]), [])
		self.assertEqual(self.lookup(self.prefix + "-New"), [])
		self.assertEqual(frappe.db.count("LMS Category", {"name": self.category["name"]}), 1)

	def test_rename_excludes_own_record_and_colliding_write_is_refused(self):
		other = insert({"doctype": "LMS Category", "category": self.prefix + "-Other"})
		self.assertEqual(self.lookup(self.prefix + "-Other", other["name"]), [])
		self.assertTrue(self.lookup(self.prefix + "-Café", other["name"]))
		with self.assertRaises(frappe.ValidationError):
			rename_doc("LMS Category", other["name"], self.category["name"])
		self.assertEqual(
			frappe.db.get_value("LMS Category", other["name"], "category"), self.prefix + "-Other"
		)

	def test_native_guest_and_non_reader_cannot_enumerate_or_create(self):
		for actor in ("Guest", self.student):
			frappe.set_user(actor)
			with self.assertRaises(frappe.PermissionError):
				self.lookup(self.prefix + "-Café")
			with self.assertRaises(frappe.PermissionError):
				insert({"doctype": "LMS Category", "category": self.prefix + "-Forbidden"})
		frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("LMS Category", self.prefix + "-Forbidden"))

	def test_two_concurrent_native_creates_after_available_read_have_one_winner(self):
		from concurrent.futures import ThreadPoolExecutor
		from threading import Barrier

		site = frappe.local.site
		name = self.prefix + "-Concurrent"
		barrier = Barrier(2, timeout=15)

		def attempt():
			frappe.init(site=site)
			frappe.connect()
			frappe.set_user("Administrator")
			try:
				self.assertEqual(
					get_list(
						"LMS Category", fields=["name"], filters={"category": name}, limit_page_length=1
					),
					[],
				)
				frappe.db.commit()  # Availability and insert are separate native requests.
				barrier.wait()
				try:
					insert({"doctype": "LMS Category", "category": name})
					frappe.db.commit()
					return "created"
				except (frappe.DuplicateEntryError, frappe.UniqueValidationError):
					frappe.db.rollback()
					return "duplicate"
				except frappe.QueryDeadlockError as error:
					from pymysql.constants import ER

					self.assertIsInstance(error.__cause__, frappe.db.OperationalError)
					self.assertEqual(error.__cause__.args[0], ER.CHECKREAD)
					frappe.db.rollback()
					return "native_CHECKREAD_rejected"
			finally:
				frappe.db.rollback()
				frappe.destroy()

		try:
			with ThreadPoolExecutor(max_workers=2) as pool:
				results = list(pool.map(lambda _: attempt(), range(2)))
			self.assertEqual(results.count("created"), 1)
			self.assertEqual(len(results), 2)
			self.assertIn(
				next(value for value in results if value != "created"),
				("duplicate", "native_CHECKREAD_rejected"),
			)
			print("QC09_CATEGORY_CONCURRENT", sorted(results))
		finally:
			# Only the committed row owned by this case; no shared catalogue cleanup.
			def cleanup():
				frappe.init(site=site)
				frappe.connect()
				frappe.set_user("Administrator")
				try:
					self.assertEqual(frappe.db.count("LMS Category", {"name": name}), 1)
					frappe.db.delete("LMS Category", {"name": name})
					frappe.db.commit()
				finally:
					frappe.destroy()

			with ThreadPoolExecutor(max_workers=1) as pool:
				pool.submit(cleanup).result()
