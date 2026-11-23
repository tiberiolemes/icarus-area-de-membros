"""Pause only this project's writers, capture, and always resume exact containers."""

import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "ops"))
from operations import backup_mixed, inspect, service


def capture():
	order = ["frontend", "websocket", "scheduler", "worker", "backend"]
	before = {name: inspect(service(name, require_running=False)) for name in order}
	stopped = []
	paused = []
	try:
		for name, info in before.items():
			if not info["State"]["Running"]:
				continue
			if name == "websocket":
				# Existing Node PID1 ignores default signals. Freeze it; drain HTTP below.
				paused.append(info["Id"])
				subprocess.run(["docker", "pause", info["Id"]], check=True, capture_output=True)
				continue
			stopped.append(info["Id"])
			subprocess.run(["docker", "update", "--restart=no", info["Id"]], check=True, capture_output=True)
			if name == "frontend":
				# Upstream bash PID1 does not forward TERM; ask nginx to drain itself.
				subprocess.run(["docker", "exec", info["Id"], "nginx", "-s", "quit"], check=True, capture_output=True)
				deadline = time.monotonic() + 30
				while inspect(info["Id"])["State"]["Running"] and time.monotonic() < deadline:
					time.sleep(0.2)
				if inspect(info["Id"])["State"]["Running"]:
					raise RuntimeError("Nginx did not drain")
			command = ["docker", "stop", "--time", "30"]
			if name == "scheduler":
				command.append("--signal=SIGINT")
			command.append(info["Id"])
			subprocess.run(command, check=True, capture_output=True)
			state = inspect(info["Id"])["State"]
			if state["Running"] or state["ExitCode"] == 137:
				raise RuntimeError("Writer did not drain gracefully: " + name)
		return backup_mixed(writers_paused=True, wait_seconds=5, hold_seconds=60)
	finally:
		failures = []
		for container in reversed(stopped):
			try:
				subprocess.run(["docker", "start", container], check=True, capture_output=True)
			except Exception as error:
				failures.append(type(error).__name__)
		for container in paused:
			try:
				subprocess.run(["docker", "unpause", container], check=True, capture_output=True)
			except Exception as error:
				failures.append(type(error).__name__)
		for info in before.values():
			policy = info["HostConfig"]["RestartPolicy"]
			value = policy["Name"] + (":" + str(policy["MaximumRetryCount"]) if policy["Name"] == "on-failure" else "")
			try:
				subprocess.run(["docker", "update", "--restart=" + value, info["Id"]], check=True, capture_output=True)
			except Exception as error:
				failures.append(type(error).__name__)
		for name, info in before.items():
			after = inspect(info["Id"])
			assert after["State"]["Running"] == info["State"]["Running"] and after["Image"] == info["Image"], name
			assert after["HostConfig"]["RestartPolicy"] == info["HostConfig"]["RestartPolicy"], name
		deadline = time.monotonic() + 45
		while before["frontend"]["State"]["Running"]:
			try:
				request = urllib.request.Request("http://127.0.0.1:8088/api/method/ping", headers={"Host": "tiberio.localhost"})
				with urllib.request.urlopen(request, timeout=3) as response:
					assert response.status == 200 and json.load(response)["message"] == "pong"
				break
			except Exception:
				if time.monotonic() >= deadline:
					raise RuntimeError("Readiness failed after backup window")
				time.sleep(0.5)
		if failures:
			raise RuntimeError("Resume commands failed: " + ",".join(failures))


if __name__ == "__main__":
	print(json.dumps(capture(), indent=2))
