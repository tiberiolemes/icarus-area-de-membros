"""Native synthetic HTTP login in an isolated browser profile; never fills a password UI."""

import argparse
import json
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("actor", choices=("admin", "creator", "instructor", "student", "outsider", "resume", "creator_new"))
parser.add_argument("--revision", required=True)
parser.add_argument("--page", default="69ab3bcf-2bab-4f74-b8ba-23bc256bff8c")
parser.add_argument(
	"--origin",
	choices=("http://quality08.localhost:8090", "http://tiberio.localhost:8090"),
	default="http://tiberio.localhost:8090",
)
args = parser.parse_args()
assert args.revision.startswith("r") and args.revision[1:].isdigit()
root = Path(__file__).resolve().parents[3]
orca = "/Applications/Orca.app/Contents/Resources/bin/orca"
page = args.page
assert page != "f3bdeb5a-e6cd-408f-a158-f8bd68ed2516", "Never target the original human browser page"
fixture = json.loads(
	subprocess.check_output(
		[
			"docker",
			"exec",
			"tiberio-quality08-" + args.revision + "-existing-app",
			"cat",
			"/home/frappe/frappe-bench/sites/tiberio.localhost/private/qc08-ui-fixtures.json",
		]
	)
)
actor = fixture["actors"][args.actor]
expression = (
	"""(async () => {
 if (location.origin !== ORIGIN) throw Error('Wrong isolated origin');
 const result = await fetch('/api/method/login', {method:'POST',headers:{'Content-Type':'application/json','X-Frappe-CSRF-Token':window.csrf_token||''},body:JSON.stringify(CREDENTIALS)});
 const body = await result.json();
 if (result.status !== 200 || body.verification) throw Error('Synthetic native login failed: '+result.status);
 const identity = await (await fetch('/api/method/frappe.auth.get_logged_user')).json();
 if (identity.message !== EXPECTED) throw Error('Native actor differs');
 location.assign('/lms');
 return {native_synthetic_login:true,role:ROLE,password_ui_filled:false};
})()""".replace("CREDENTIALS", json.dumps({"usr": actor["user"], "pwd": actor["password"]}))
	.replace("EXPECTED", json.dumps(actor["user"]))
	.replace("ROLE", json.dumps(args.actor))
	.replace("ORIGIN", json.dumps(args.origin))
)
result = subprocess.run(
	[orca, "eval", "--page", page, "--expression", expression, "--json"], capture_output=True
)
output = (
	root
	/ ".local/quality"
	/ ("08-" + args.revision + "-browser-session-" + args.actor + "-" + str(time.time_ns()) + ".json")
)
assert not output.exists()
output.write_bytes(result.stdout)
payload = json.loads(result.stdout)
if result.returncode or not payload.get("ok"):
	raise RuntimeError("Synthetic browser HTTP login failed; private receipt retained")
print(
	json.dumps(
		{
			"native_synthetic_login": True,
			"actor": args.actor,
			"password_ui_filled": False,
			"isolated_browser_page": page,
		}
	)
)
