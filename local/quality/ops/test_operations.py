"""Sandbox regression checks; no product container, network, credential or database writes."""

import hashlib
import importlib.util
import io
import json
import multiprocessing
import os
import signal
import sys
import tarfile
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
import mixed_backup
import operations
import site_probe

spec = importlib.util.spec_from_file_location("payments_prepare", ROOT / "local/prepare.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def archive(extra=None, missing=False):
	output = io.BytesIO()
	with tarfile.open(fileobj=output, mode="w:gz") as tar:
		for name in ["pyproject.toml", "license.txt", *([] if missing else ["payments/hooks.py"])]:
			data = (name + "\n").encode()
			item = tarfile.TarInfo(f"payments-{prepare.SHA}/{name}")
			item.size = len(data)
			item.mode = 0o644
			tar.addfile(item, io.BytesIO(data))
		if extra:
			tar.addfile(extra, io.BytesIO(b"x") if extra.isfile() else None)
	return output.getvalue()


def interrupted(target, data, marker):
	def pause(blob, path):
		(path / "pyproject.toml").write_text("interrupted extraction")
		marker.set()
		time.sleep(30)

	prepare.ARCHIVE_SHA256 = hashlib.sha256(data).hexdigest()
	prepare.unpack = pause
	prepare.prepare(Path(target), lambda: data)


class PaymentsTests(unittest.TestCase):
	def setUp(self):
		self.temporary = tempfile.TemporaryDirectory()
		self.addCleanup(self.temporary.cleanup)
		self.target = Path(self.temporary.name) / "payments"
		self.data = archive()
		self.pin = patch.object(prepare, "ARCHIVE_SHA256", hashlib.sha256(self.data).hexdigest())
		self.pin.start()
		self.addCleanup(self.pin.stop)

	def run_prepare(self):
		return prepare.prepare(self.target, lambda: self.data)

	def test_atomic_then_exact_existing_tree(self):
		self.assertEqual(self.run_prepare(), "prepared_atomic")
		self.assertEqual(self.run_prepare(), "verified_existing")

	def test_partial_existing_tree_preserved_and_rejected(self):
		self.target.mkdir()
		(self.target / "pyproject.toml").write_text("partial")
		with self.assertRaisesRegex(ValueError, "preserved unchanged"):
			self.run_prepare()
		self.assertEqual((self.target / "pyproject.toml").read_text(), "partial")

	def test_adulterated_and_extra_files_rejected(self):
		self.run_prepare()
		(self.target / "payments/hooks.py").write_text("altered")
		with self.assertRaises(ValueError):
			self.run_prepare()
		(self.target / "payments/hooks.py").write_text("payments/hooks.py\n")
		(self.target / "extra.txt").write_text("unexpected")
		with self.assertRaises(ValueError):
			self.run_prepare()

	def test_existing_symlink_is_preserved_and_refused(self):
		real = self.target.parent / "real"
		real.mkdir()
		self.target.symlink_to(real, target_is_directory=True)
		with self.assertRaises(ValueError):
			self.run_prepare()
		self.assertTrue(self.target.is_symlink())

	def test_bad_digest_rejected_before_extract(self):
		with self.assertRaisesRegex(ValueError, "integrity"):
			prepare.prepare(self.target, lambda: self.data + b"tamper")
		self.assertFalse(self.target.exists())

	def test_malformed_archive(self):
		data = b"not a tar"
		with patch.object(prepare, "ARCHIVE_SHA256", hashlib.sha256(data).hexdigest()):
			with self.assertRaises(tarfile.ReadError):
				prepare.prepare(self.target, lambda: data)
		self.assertFalse(self.target.exists())

	def test_unsafe_members_and_wrong_origin_root(self):
		for name, kind in [
			("../escape", tarfile.REGTYPE),
			("/absolute", tarfile.REGTYPE),
			(f"payments-{prepare.SHA}/../escape", tarfile.REGTYPE),
			("different-origin/pyproject.toml", tarfile.REGTYPE),
			(f"payments-{prepare.SHA}/link", tarfile.SYMTYPE),
			(f"payments-{prepare.SHA}/hardlink", tarfile.LNKTYPE),
			(f"payments-{prepare.SHA}/fifo", tarfile.FIFOTYPE),
			(f"payments-{prepare.SHA}/pyproject.toml", tarfile.REGTYPE),
		]:
			with self.subTest(name=name, kind=kind):
				extra = tarfile.TarInfo(name)
				extra.type = kind
				extra.linkname = "../../escape"
				extra.size = 1 if kind == tarfile.REGTYPE else 0
				data = archive(extra)
				with patch.object(prepare, "ARCHIVE_SHA256", hashlib.sha256(data).hexdigest()):
					with self.assertRaises(ValueError):
						prepare.prepare(self.target, lambda: data)
				self.assertFalse(self.target.exists())

	def test_download_redirect_refused(self):
		response = unittest.mock.MagicMock()
		response.__enter__.return_value.url = "https://different.example/archive"
		with patch.object(prepare.urllib.request, "urlopen", return_value=response):
			with self.assertRaisesRegex(ValueError, "origin"):
				prepare.download()

	def test_missing_required_tree_refused(self):
		data = archive(missing=True)
		with patch.object(prepare, "ARCHIVE_SHA256", hashlib.sha256(data).hexdigest()):
			with self.assertRaisesRegex(ValueError, "Incomplete"):
				prepare.prepare(self.target, lambda: data)

	def test_interruption_before_promotion_preserves_existing(self):
		self.run_prepare()
		original = prepare.tree(self.target)
		with patch.object(prepare, "unpack", side_effect=KeyboardInterrupt):
			with self.assertRaises(KeyboardInterrupt):
				self.run_prepare()
		self.assertEqual(prepare.tree(self.target), original)

	def test_sigkill_never_publishes_partial_tree_and_retry_recovers(self):
		context = multiprocessing.get_context("fork")
		marker = context.Event()
		process = context.Process(target=interrupted, args=(str(self.target), self.data, marker))
		process.start()
		try:
			self.assertTrue(marker.wait(5))
			os.kill(process.pid, signal.SIGKILL)
			process.join(5)
			self.assertEqual(process.exitcode, -signal.SIGKILL)
			self.assertFalse(self.target.exists())
			self.assertEqual(self.run_prepare(), "prepared_atomic")
		finally:
			if process.is_alive():
				process.kill()
				process.join()


class OperationsTests(unittest.TestCase):
	def test_mixed_capture_requires_integrator_pause_before_any_operation(self):
		with patch.object(operations, "run") as command:
			with self.assertRaisesRegex(ValueError, "Pause/drain"):
				operations.backup_mixed()
			command.assert_not_called()
		with tempfile.TemporaryDirectory() as temporary:
			target = Path(temporary) / "rejected"
			with self.assertRaisesRegex(ValueError, "pause and drain"):
				mixed_backup.capture(target)
			self.assertFalse(target.exists())

	def test_mixed_lock_budget_refused_before_database_connection(self):
		with patch.object(mixed_backup, "connect") as connection:
			for wait, hold in ((0, 5), (31, 5), (5, 0), (5, 121)):
				with self.assertRaises(ValueError), mixed_backup.read_locks({}, wait, hold):
					pass
			connection.assert_not_called()

	def test_nontransactional_data_requires_different_backup_window(self):
		site_probe.assert_snapshot_engine("InnoDB", 20)
		site_probe.assert_snapshot_engine("MyISAM", 0)
		with self.assertRaisesRegex(ValueError, "Nontransactional"):
			site_probe.assert_snapshot_engine("MyISAM", 1)

	def test_budget_reserves_retention_restore_and_planned_work(self):
		self.assertEqual(operations.disk_budget(100, 10, 20, 30, 3)["required_free_bytes"], 100)
		self.assertFalse(operations.disk_budget(99, 10, 20, 30, 3)["ok"])
		with self.assertRaises(ValueError):
			operations.disk_budget(100, 10, -1, 30, 3)

	def test_retention_never_deletes_and_ignores_unowned_or_incomplete(self):
		with tempfile.TemporaryDirectory() as temporary:
			root = Path(temporary)
			for index in range(4):
				path = root / str(index)
				path.mkdir()
				(path / "complete.json").write_text(
					json.dumps({"owner": "tiberio-quality-ops", "site": operations.SITE})
				)
			(root / "incomplete").mkdir()
			(root / "alien").mkdir()
			(root / "alien/complete.json").write_text(json.dumps({"owner": "other", "site": operations.SITE}))
			plan = operations.retention_plan(root, 3)
			self.assertEqual(len(plan["review_only_candidates"]), 1)
			self.assertFalse(plan["deletion_enabled"])
			self.assertEqual(len(list(root.iterdir())), 6)

	def test_site_archive_traversal_refused(self):
		with tempfile.TemporaryDirectory() as temporary:
			with self.assertRaises(ValueError):
				operations.safe_extract(archive(tarfile.TarInfo("../escape")), Path(temporary))

	def test_restore_subnet_rejects_overlap_before_mutation(self):
		network = [{"IPAM": {"Config": [{"Subnet": "10.253.200.0/24"}]}}]
		with patch.object(operations, "run", side_effect=[b"owned-id", json.dumps(network).encode()]) as command, patch.object(operations, "verify_backup") as verify:
			with self.assertRaisesRegex(ValueError, "overlaps"):
				operations.restore(Path("unused"), subnet="10.253.200.0/24")
			verify.assert_not_called()
			self.assertEqual([call.args[0][1:3] for call in command.call_args_list], [["network", "ls"], ["network", "inspect"]])

	def test_restore_subnet_rejects_non_private_or_wrong_size_without_docker(self):
		for subnet in ("8.8.8.0/24", "10.253.200.0/25", "::1/128"):
			with self.subTest(subnet=subnet), patch.object(operations, "run") as command:
				with self.assertRaises(ValueError):
					operations.restore(Path("unused"), subnet=subnet)
				command.assert_not_called()

	def test_free_restore_subnet_keeps_backup_integrity_gate(self):
		with patch.object(operations, "run", side_effect=[b"owned-id", b'[{"IPAM":{"Config":null}}]']) as command, patch.object(operations, "verify_backup", side_effect=ValueError("backup-integrity")) as verify:
			with self.assertRaisesRegex(ValueError, "backup-integrity"):
				operations.restore(Path("unused"), subnet="10.253.200.0/24")
			verify.assert_called_once_with(Path("unused"))
			self.assertEqual(command.call_count, 2)

	def test_restore_refuses_corrupted_backup_before_starting_containers(self):
		with tempfile.TemporaryDirectory() as temporary:
			root = Path(temporary)
			folder = root / "capture"
			folder.mkdir()
			(folder / "database.sql.gz").write_bytes(b"altered")
			(folder / "complete.json").write_text(
				json.dumps(
					{
						"owner": "tiberio-quality-ops",
						"site": operations.SITE,
						"artifacts": {"database.sql.gz": {"sha256": hashlib.sha256(b"original").hexdigest()}},
					}
				)
			)
			with patch.object(operations, "BACKUPS", root), patch.object(operations, "run") as run:
				with self.assertRaisesRegex(ValueError, "integrity"):
					operations.restore(folder)
				run.assert_not_called()

	def test_browser_helper_only_reads_identity_and_preserves_session(self):
		browser_spec = importlib.util.spec_from_file_location(
			"safe_browser_login", ROOT / "local/i18n/browser_login.py"
		)
		browser = importlib.util.module_from_spec(browser_spec)
		with patch.dict(sys.modules, {"browser_matrix": unittest.mock.MagicMock()}):
			browser_spec.loader.exec_module(browser)
		calls = []

		def call(command, *args):
			calls.append((command, args))
			return {"result": json.dumps({"authenticated": True, "user": "Administrator"})}

		with patch.object(browser, "call", side_effect=call):
			browser.login("admin")
		self.assertFalse(any(command in ("fill", "keypress") for command, _ in calls))
		with patch.object(browser, "call", return_value={"result": json.dumps({"authenticated": False})}):
			with self.assertRaises(SystemExit):
				browser.login("admin")


if __name__ == "__main__":
	unittest.main()
