"""Local-only launcher. Run with Python 3; Docker Compose >= 2.30 required."""
import json
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / ".local"
COMPOSE = ["docker", "compose", "-f", str(ROOT / "local/compose.yaml")]


def run(*args):
    subprocess.run([*COMPOSE, *args], cwd=ROOT, check=True)


def initialize():
    PRIVATE.mkdir(mode=0o700, exist_ok=True)
    os.chmod(PRIVATE, 0o700)
    path = PRIVATE / "secrets.json"
    if not path.exists():
        if shutil.disk_usage(ROOT).free < 7 * 1024**3:
            raise SystemExit("At least 7 GiB free required before first installation.")
        values = {key: secrets.token_urlsafe(30) for key in ("admin", "student", "other", "db_root")}
        path.write_text(json.dumps(values))
        os.chmod(path, 0o600)
        (PRIVATE / "db.env").write_text("MARIADB_ROOT_PASSWORD=" + values["db_root"] + "\n")
        os.chmod(PRIVATE / "db.env", 0o600)
        (PRIVATE / "ACESSOS.md").write_text(
            "# Somente testes locais\nhttp://tiberio.localhost:8088/lms\n\n"
            + "\n".join(f"{user}: {values[key]}" for user, key in [
                ("Administrator", "admin"), ("aluno@example.test", "student"),
                ("outro@example.test", "other")]) + "\n")
        os.chmod(PRIVATE / "ACESSOS.md", 0o600)


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    if action == "start":
        initialize()
        run("up", "-d")
    elif action == "stop":
        run("down")
    elif action == "status":
        run("ps")
    else:
        raise SystemExit("Usage: python3 local/manage.py [start|stop|status]")
