import copy
import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location("backup_window", Path(__file__).parents[1] / "backup_window.py")
window = importlib.util.module_from_spec(spec)
spec.loader.exec_module(window)


class BackupWindowTests(unittest.TestCase):
	def test_failure_restores_full_policy_and_only_previously_active(self):
		infos = {}
		for name in ("frontend", "websocket", "scheduler", "worker", "backend"):
			infos[name] = {
				"Id": name,
				"Image": "pinned",
				"State": {"Running": name == "worker", "ExitCode": 0},
				"HostConfig": {"RestartPolicy": {"Name": "on-failure", "MaximumRetryCount": 7}},
			}

		def execute(command, **kwargs):
			if command[1] == "stop":
				infos[command[-1]]["State"]["Running"] = False
			if command[1] == "start":
				infos[command[-1]]["State"]["Running"] = True

		with (
			patch.object(window, "service", side_effect=lambda name, **kw: name),
			patch.object(window, "inspect", side_effect=lambda name: copy.deepcopy(infos[name])),
			patch.object(window.subprocess, "run", side_effect=execute) as run,
			patch.object(window, "backup_mixed", side_effect=RuntimeError("dump failed")),
		):
			with self.assertRaisesRegex(RuntimeError, "dump failed"):
				window.capture()
		commands = [call.args[0] for call in run.call_args_list]
		self.assertIn(["docker", "start", "worker"], commands)
		self.assertFalse(
			any(command[:2] == ["docker", "start"] and command[2] != "worker" for command in commands)
		)
		self.assertTrue(any("--restart=on-failure:7" in command for command in commands))


if __name__ == "__main__":
	unittest.main()
