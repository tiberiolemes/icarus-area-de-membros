"""One-time site creation; never overwrites an existing site's database."""
import json
import os
import subprocess
from pathlib import Path

os.umask(0o077)

SITE = "tiberio.localhost"
assets = Path("sites/assets")
if not assets.exists() and not assets.is_symlink():
    assets.symlink_to("/home/frappe/frappe-bench/assets")


def bench(*args):
    result = subprocess.run(["bench", *args])
    if result.returncode:
        raise SystemExit(f"bench {args[0]} failed (exit {result.returncode}); no automatic reset performed")


bench("set-config", "-g", "db_host", "db")
bench("set-config", "-gp", "db_port", "3306")
for key in ("redis_cache", "redis_queue", "redis_socketio"):
    bench("set-config", "-g", key, "redis://redis:6379")
bench("set-config", "-gp", "socketio_port", "9000")
bench("set-config", "-g", "webserver_host", "http://backend")
bench("set-config", "-gp", "webserver_port", "8000")
Path("sites/apps.txt").write_text("\n".join(p.name for p in Path("apps").iterdir() if p.is_dir()) + "\n")
new_site = not Path(f"sites/{SITE}/site_config.json").exists()
if new_site:
    secrets = json.loads(Path("/run/tiberio/secrets.json").read_text())
    bench("new-site", SITE, "--db-root-username", "root", "--db-root-password", secrets["db_root"],
          "--admin-password", secrets["admin"], "--mariadb-user-host-login-scope", "%")
    bench("--site", SITE, "set-config", "host_name", "http://tiberio.localhost:8088")
bench("--site", SITE, "set-config", "-p", "enable_telemetry", "False")
bench("--site", SITE, "set-config", "-p", "mute_emails", "True")
installed = subprocess.check_output(["bench", "--site", SITE, "list-apps"], text=True)
for app in ("payments", "lms"):
    if app not in installed.split():
        bench("--site", SITE, "install-app", app)
bench("--site", SITE, "migrate")
if new_site:
    bench("--site", SITE, "execute", "lms.tiberio_local.seed")
bench("--site", SITE, "execute", "lms.tiberio_i18n.apply_and_commit",
      "--kwargs", json.dumps({"catalog_path": str(Path("apps/lms/local/i18n/merged-pt-BR.json").resolve(strict=True))}))
bench("use", SITE)
print("Site ready; existing databases were preserved.")
