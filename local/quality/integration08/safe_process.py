"""Forward native process signals/status while sanitizing before stdout/stderr persist."""

import signal
import subprocess
import sys
import json
from pathlib import Path

from lms.lms.log_sanitizer import sanitize_log_line


def run(command):
	child = subprocess.Popen(
		command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace", bufsize=1
	)
	previous = {}

	def forward(signum, frame):
		if child.poll() is None:
			child.send_signal(signum)

	for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGQUIT, signal.SIGHUP):
		previous[signum] = signal.signal(signum, forward)
	failed = False
	try:
		for line in child.stdout:
			try:
				clean = sanitize_log_line(line)
			except Exception:
				failed = True
				sys.stderr.write("ERROR local log sanitizer failed; stopping native process\n")
				child.send_signal(signal.SIGQUIT)
				break
			print(clean, end="", flush=True)
		code = child.wait(timeout=30)
	finally:
		try:
			if child.poll() is None:
				child.send_signal(signal.SIGQUIT)
				child.wait(timeout=30)
		finally:
			child.stdout.close()
			for signum, handler in previous.items():
				signal.signal(signum, handler)
	return 1 if failed else code if code >= 0 else 128 - code


if __name__ == "__main__":
	assert len(sys.argv) == 2 and sys.argv[1] in {"nginx", "backend"}
	from system_overlay import apply

	apply(
		Path("/"), json.loads(Path(__file__).with_name("system-overlay.json").read_text()), verify_only=True
	)
	if sys.argv[1] == "nginx":
		assert Path("/var/log/nginx/access.log").is_symlink() and Path(
			"/var/log/nginx/access.log"
		).readlink() == Path("/dev/stdout")
		assert Path("/var/log/nginx/error.log").is_symlink() and Path(
			"/var/log/nginx/error.log"
		).readlink() == Path("/dev/stderr")
	command = "/usr/local/bin/nginx-entrypoint.sh" if sys.argv[1] == "nginx" else "/usr/local/bin/start.sh"
	raise SystemExit(run([command]))
