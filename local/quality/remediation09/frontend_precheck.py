"""Test selected current frontend sources in /tmp; immutable application files stay untouched."""

import argparse
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("label")
parser.add_argument("tests", nargs="+")
parser.add_argument("--container", default="tiberio-quality08-r6-existing-app")
parser.add_argument("--framework-package-overlay", action="store_true")
args = parser.parse_args()
assert args.label.replace("-", "").isalnum() and all(
	name.startswith("src/tests/") and name.endswith((".test.ts", ".test.js")) for name in args.tests
)
root = Path(__file__).resolve().parents[3]
assert all((root / "frontend" / name).is_file() for name in args.tests), (
	"Every requested test file must exist"
)
archive = io.BytesIO()
hashes = {}
with tarfile.open(fileobj=archive, mode="w") as tar:
	paths = [path for folder in ("frontend", "local/i18n") for path in (root / folder).rglob("*")]
	paths += [
		root / name
		for name in (
			"local/quality/auth/pt-BR.json",
			"docs/audit/quality/evidence/02-new-messages.json",
			"docs/audit/quality/evidence/11-child-content-pt-BR.json",
			"lms/public/tours/quality07.json",
			"lms/www/new-sign-up.html",
			"lms/public/js/privacy_request.js",
			"lms/public/js/password_policy.js",
		)
	]
	for path in sorted(paths):
		rel = path.relative_to(root)
		if (
			any(part in {"node_modules", "dist", ".vite", "__pycache__"} for part in rel.parts)
			or path.name.startswith(".env")
			or not path.is_file()
		):
			continue
		data = path.read_bytes()
		hashes[str(rel)] = hashlib.sha256(data).hexdigest()
		info = tarfile.TarInfo(str(rel))
		info.size = len(data)
		tar.addfile(info, io.BytesIO(data))
target = "/tmp/qc09-precheck-" + args.label + "/bench/apps/lms"
prepare = (
	"import sys,tarfile,json;from pathlib import Path;p=Path("
	+ repr(target)
	+ ");assert not p.exists();p.mkdir(parents=True);site=p.parents[1]/'sites';site.mkdir();(site/'common_site_config.json').write_text(json.dumps(dict(socketio_port=9000)));t=tarfile.open(fileobj=sys.stdin.buffer,mode='r|');t.extractall(p,filter='data');(p/'frontend/node_modules').symlink_to('/home/frappe/frappe-bench/apps/lms/frontend/node_modules',target_is_directory=True)"
)
info = json.loads(subprocess.check_output(["docker", "inspect", args.container], text=True))[0]
assert args.container.startswith("tiberio-quality08-") and not info["HostConfig"]["Privileged"]
assert not any(mount["Destination"].startswith("/home/frappe/frappe-bench/apps") for mount in info["Mounts"])
prefix = ["docker", "exec", "-i", args.container]
subprocess.run(
	prefix + ["/home/frappe/frappe-bench/env/bin/python", "-c", prepare], input=archive.getvalue(), check=True
)
if args.framework_package_overlay:
	# Only the disposable QA tree changes; the running application's source stays immutable.
	prepare_framework = """
import hashlib,json,shutil,sys
from pathlib import Path
root=Path(sys.argv[1]); native=Path('/home/frappe/frappe-bench/apps/frappe')
ui=root.parent/'frappe/ui'; ui.mkdir(parents=True)
shutil.copytree(native/'ui/src',ui/'src'); shutil.copy2(native/'ui/package.json',ui/'package.json')
old=json.loads(Path('/home/frappe/frappe-bench/apps/lms/local/i18n/framework-package-overlay.json').read_text())
new=json.loads((root/'local/i18n/framework-package-overlay.json').read_text())
for row in new['patches']:
 if not row['path'].startswith('ui/src/'): continue
 p=ui.parent/row['path']; text=p.read_text()
 if hashlib.sha256(text.encode()).hexdigest()==row['after_sha256']: continue
 previous=next(r for r in old['patches'] if r['path']==row['path'])
 assert hashlib.sha256(text.encode()).hexdigest()==previous['after_sha256']
 for before,after in reversed(previous['replacements']):
  assert text.count(after)==1; text=text.replace(after,before)
 assert hashlib.sha256(text.encode()).hexdigest()==row['before_sha256']==previous['before_sha256']
 for before,after in row['replacements']:
  assert text.count(before)==1; text=text.replace(before,after)
 assert hashlib.sha256(text.encode()).hexdigest()==row['after_sha256']; p.write_text(text)
deps=root/'frontend/node_modules'; deps.unlink(); deps.mkdir()
native_deps=Path('/home/frappe/frappe-bench/apps/lms/frontend/node_modules')
for dep in native_deps.iterdir():
 if dep.name=='@framework':
  scope=deps/dep.name; scope.mkdir()
  for child in dep.iterdir(): (scope/child.name).symlink_to(ui if child.name=='ui' else child,target_is_directory=True)
 else: (deps/dep.name).symlink_to(dep,target_is_directory=dep.is_dir())
"""
	subprocess.run(
		prefix + ["/home/frappe/frappe-bench/env/bin/python", "-c", prepare_framework, target], check=True
	)
log = root / ".local/quality" / ("09-frontend-precheck-" + args.label + ".log")
assert not log.exists()
with log.open("wb") as output:
	r = subprocess.run(
		[
			"docker",
			"exec",
			"-e",
			"NODE_OPTIONS=--max-old-space-size=768",
			"-w",
			target + "/frontend",
			args.container,
			"node",
			"node_modules/vitest/vitest.mjs",
			"run",
			"--maxWorkers=1",
			*args.tests,
		],
		stdout=output,
		stderr=subprocess.STDOUT,
	)
receipt = {
	"exit_code": r.returncode,
	"source_sha256": hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest(),
	"files": hashes,
	"tests": args.tests,
	"application_files_modified": False,
	"development_only": True,
	"framework_package_overlay_in_disposable_tree": args.framework_package_overlay,
	"target": target,
	"container_image_id": info["Image"],
}
log.with_suffix(".json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({key: receipt[key] for key in ("exit_code", "source_sha256", "tests", "development_only")}))
raise SystemExit(r.returncode)
