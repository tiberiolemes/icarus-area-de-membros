"""Publish only the owned lab frontend on loopback, using the same immutable image."""

import argparse
import ipaddress
import json
import subprocess
import time
import urllib.request

BENCH = "/home/frappe/frappe-bench"
BENCH_PYTHON = BENCH + "/env/bin/python"
parser = argparse.ArgumentParser()
parser.add_argument("revision")
parser.add_argument("--web-subnet", help="An explicitly verified free private QA subnet when default pools are exhausted")
args = parser.parse_args()
assert args.revision.startswith("r") and args.revision[1:].isdigit()
owner = "tiberio-quality08-" + args.revision + "-existing"
app = json.loads(subprocess.check_output(["docker", "inspect", owner + "-app"]))[0]
assert app["Config"]["Labels"]["tiberio.quality.owner"] == owner and app["State"]["Running"]
name = owner + "-frontend"
managed = int(args.revision[1:]) >= 9
assert subprocess.run(["docker", "inspect", name], capture_output=True).returncode != 0
network = owner + "-web"
network_options = []
if args.web_subnet:
	requested = ipaddress.ip_network(args.web_subnet, strict=True)
	assert requested.version == 4 and requested.is_private and requested.prefixlen == 24
	ids = subprocess.check_output(["docker", "network", "ls", "-q"], text=True).split()
	allocated = json.loads(subprocess.check_output(["docker", "network", "inspect", *ids]))
	assert all(
		not requested.overlaps(ipaddress.ip_network(config["Subnet"]))
		for row in allocated
		for config in (row.get("IPAM", {}).get("Config") or [])
		if config.get("Subnet") and ":" not in config["Subnet"]
	)
	network_options = ["--subnet", str(requested)]
subprocess.run(
	["docker", "network", "create", *network_options, "--label", "tiberio.quality.owner=" + owner, network],
	check=True,
	capture_output=True,
)
subprocess.run(
	[
		"docker",
		"run",
		"-d",
		"--pull=never",
		"--platform",
		"linux/amd64",
		"--init",
		"--name",
		name,
		"--label",
		"tiberio.quality.owner=" + owner,
		"--network",
		owner,
		"--entrypoint",
		BENCH_PYTHON if managed else "nginx-entrypoint.sh",
		"-v",
		owner + "-sites:/home/frappe/frappe-bench/sites:ro",
		"-p",
		"127.0.0.1:8090:8080",
		"-e",
		"BACKEND=" + owner + "-app:8000",
		"-e",
		"SOCKETIO=" + owner + "-app:9000",
		"-e",
		"FRAPPE_SITE_NAME_HEADER=tiberio.localhost",
		"-e",
		"NGINX_LISTEN_PORT=8080",
		app["Image"],
		*([BENCH + "/apps/lms/local/quality/integration08/safe_process.py", "nginx"] if managed else []),
	],
	check=True,
	capture_output=True,
)
subprocess.run(["docker", "network", "connect", network, name], check=True)
deadline = time.monotonic() + 45
while True:
	try:
		with urllib.request.urlopen("http://127.0.0.1:8090/lms", timeout=3) as response:
			assert response.status == 200
		break
	except (OSError, AssertionError):
		if time.monotonic() >= deadline:
			raise RuntimeError("Owned frontend HTTP readiness failed")
		time.sleep(0.3)
info = json.loads(subprocess.check_output(["docker", "inspect", name]))[0]
assert info["Image"] == app["Image"]
assert info["HostConfig"]["PortBindings"] == {"8080/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8090"}]}
print(
	json.dumps(
		{
			"image_id": info["Image"],
			"frontend": name,
			"http_status": 200,
			"loopback_only": True,
			"application_source_overlay": False,
		}
	)
)
