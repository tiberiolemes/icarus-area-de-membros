"""Run selected native tests on a separate synthetic site, preserving product settings."""
import json
import subprocess
from pathlib import Path

SITE = "test_tiberio.localhost"
secrets = json.loads(Path("/run/tiberio/secrets.json").read_text())


def bench(*args):
    result = subprocess.run(["bench", *args])
    if result.returncode:
        raise SystemExit(f"Native test command failed (exit {result.returncode})")


if not Path(f"sites/{SITE}/site_config.json").exists():
    bench("new-site", SITE, "--db-root-username", "root", "--db-root-password", secrets["db_root"],
          "--admin-password", secrets["admin"], "--mariadb-user-host-login-scope", "%")
installed = subprocess.check_output(["bench", "--site", SITE, "list-apps"], text=True)
for app in ("payments", "lms"):
    if app not in installed.split():
        bench("--site", SITE, "install-app", app)
bench("--site", SITE, "set-config", "-p", "mute_emails", "True")
bench("--site", SITE, "set-config", "-p", "enable_telemetry", "False")
bench("--site", SITE, "set-config", "-p", "allow_tests", "True")
for module in ("lms.tests.security.test_progress_access", "lms.tests.security.test_serve_resource",
               "lms.tests.test_lesson_locking", "lms.tests.api.test_pwa_manifest"):
    bench("--site", SITE, "run-tests", "--module", module)
print("Selected native tests passed on isolated test_tiberio.localhost.")
