"""Run only in a disposable, network-disabled container; never migrate a site."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SOURCE = Path("/source")
BENCH = Path("/home/frappe/frappe-bench")
APP = BENCH / "apps/lms"
PYTHON = BENCH / "env/bin/python"


def run(*command, cwd=BENCH):
	return subprocess.run([str(value) for value in command], cwd=cwd, check=True)


if not Path("/.dockerenv").exists() or os.environ.get("AUTH04_ISOLATED") != "1" or not SOURCE.is_dir():
	raise SystemExit("Use the documented disposable container command with source mounted read-only.")

run(
	PYTHON,
	"-m",
	"pip",
	"install",
	"--no-index",
	"--no-deps",
	"/source/.local/quality/auth-wheels/argon2_cffi-25.1.0-py3-none-any.whl",
	"/source/.local/quality/auth-wheels/argon2_cffi_bindings-25.1.0-cp39-abi3-manylinux_2_26_x86_64.manylinux_2_28_x86_64.whl",
)
shutil.copy2(SOURCE / "lms/lms/account_security.py", APP / "lms/lms/account_security.py")
shutil.copy2(SOURCE / "lms/lms/user.py", APP / "lms/lms/user.py")
sys.path.insert(0, str(SOURCE / "local/i18n"))
from apply_overlay import apply

manifest = json.loads((SOURCE / "local/quality/auth/framework-overlay.json").read_text())
root = BENCH / "apps/frappe/frappe"
print(json.dumps({"applied": apply(root, manifest), "idempotent": apply(root, manifest)}), flush=True)
for row in manifest["patches"]:
	if row["path"].endswith(".py"):
		compile((root / row["path"]).read_text(), row["path"], "exec")
run(PYTHON, SOURCE / "local/quality/auth/test_account_security.py")
run(PYTHON, SOURCE / "local/quality/auth/test_overlay.py")
from jinja2 import Environment, FileSystemLoader

catalog = json.loads((SOURCE / "local/quality/auth/pt-BR.json").read_text())
environment = Environment(loader=FileSystemLoader(root))
script = environment.get_template("templates/includes/login/login.js").render(
	_=lambda text: catalog.get(text, text), ldap_settings=None, disable_signup=True
)
with tempfile.TemporaryDirectory() as temporary:
	filename = Path(temporary) / "login-rendered.js"
	filename.write_text(script)
	run("node", "--check", filename)
print(json.dumps({"native_login_script_rendered_pt_BR_and_parsed": True}), flush=True)
shutil.copytree(SOURCE / "frontend/src", APP / "frontend/src", dirs_exist_ok=True)
shutil.copytree(SOURCE / "local/i18n", APP / "local/i18n", dirs_exist_ok=True)
shutil.copytree(SOURCE / "lms/public/js", APP / "lms/public/js", dirs_exist_ok=True)
for name in ("account_password.js", "password_policy.js", "account_login.js"):
	run("node", "--check", APP / "lms/public/js" / name)
run("node", SOURCE / "local/quality/auth/verify_sfc.mjs", cwd=APP / "frontend")
run(
	"node",
	APP / "frontend/node_modules/.bin/vitest",
	"run",
	"--maxWorkers=2",
	"src/tests/accountPassword.test.ts",
	"src/tests/passwordFieldNative.test.ts",
	"src/tests/sessionInactivity.test.ts",
	"src/tests/sessionInactivityHost.test.ts",
	"src/tests/sessionInactivityNative.test.ts",
	"src/tests/studyActivity.test.ts",
	"src/tests/plyr.test.ts",
	"src/tests/formDraft.test.ts",
	"src/tests/setupPage.test.ts",
	"src/tests/firstPasswordStep.test.ts",
	"src/tests/twoFactorSettings.test.ts",
	cwd=APP / "frontend",
)
