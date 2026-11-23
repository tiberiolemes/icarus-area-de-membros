import contextlib
import importlib.util
import io
import signal
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
	"qc08_safe_process", Path(__file__).with_name("safe_process.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NativeProcessBoundaryTests(unittest.TestCase):
	def test_nonzero_and_137_remain_failures(self):
		with contextlib.redirect_stdout(io.StringIO()):
			self.assertEqual(module.run([sys.executable, "-c", "raise SystemExit(37)"]), 37)
			self.assertEqual(
				module.run([sys.executable, "-c", "import os,signal;os.kill(os.getpid(),signal.SIGKILL)"]),
				137,
			)

	def test_filter_failure_never_forwards_the_raw_input(self):
		out, err = io.StringIO(), io.StringIO()
		code = "import signal,time;signal.signal(signal.SIGQUIT,lambda *args:exit(7));print('request: \\\"GET /?key=MARKER\\\"',flush=True);time.sleep(20)"
		with (
			patch.object(module, "sanitize_log_line", side_effect=ValueError("synthetic sanitizer failure")),
			contextlib.redirect_stdout(out),
			contextlib.redirect_stderr(err),
		):
			self.assertEqual(module.run([sys.executable, "-c", code]), 1)
		self.assertNotIn("MARKER", out.getvalue() + err.getvalue())
		self.assertIn("sanitizer failed", err.getvalue())

	def test_signal_reaches_native_child_and_its_status_is_preserved(self):
		child = "import signal,time;signal.signal(signal.SIGTERM,lambda *args:exit(23));print('ready',flush=True);time.sleep(20)"
		program = f"import importlib.util,sys;spec=importlib.util.spec_from_file_location('safe',{str(Path(__file__).with_name('safe_process.py'))!r});m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);sys.exit(m.run([sys.executable,'-c',{child!r}]))"
		process = subprocess.Popen(
			[sys.executable, "-c", program], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
		)
		try:
			self.assertEqual(process.stdout.readline().strip(), "ready")
			process.send_signal(signal.SIGTERM)
			self.assertEqual(process.wait(timeout=5), 23)
		finally:
			if process.poll() is None:
				process.terminate()
				process.wait(timeout=5)
			process.communicate()


if __name__ == "__main__":
	unittest.main()
