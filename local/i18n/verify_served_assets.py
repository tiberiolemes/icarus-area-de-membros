"""Compare HTTP-served native bundles with the running image, without modifying sites."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "local"))
from verify import Session

RUNNER = r'''
import hashlib,json,re
from pathlib import Path
bench=Path('/home/frappe/frappe-bench')
assets=bench/'sites/assets'
paths=set(json.loads((assets/'assets.json').read_text()).values())
for app,prefix in [('lms','frontend'),('frappe','studio'),('frappe','signup')]:
 root=assets/app/prefix
 if root.exists():
  paths.update('/assets/'+str(p.relative_to(assets)) for p in root.rglob('*') if p.is_file() and p.suffix in ('.js','.css','.html'))
paths.update(['/assets/lms/images/assinatura-tiberio.svg','/assets/lms/frontend/tiberio.png','/assets/lms/images/tiberio-maskable.svg'])
print(json.dumps({p:hashlib.sha256((bench/'sites'/p.lstrip('/')).read_bytes()).hexdigest() for p in sorted(paths)}))
'''
expected = json.loads(subprocess.check_output([
    "docker", "exec", "tiberio-frappe-local-backend-1", "env/bin/python", "-c", RUNNER], text=True))
session = Session()
rows = []
for path, digest in expected.items():
    status, data = session.request(path, headers={"Accept": "*/*", "Accept-Encoding": "identity"})
    actual = hashlib.sha256(data).hexdigest()
    assert status == 200 and actual == digest, (path, status, actual, digest)
    rows.append({"path": path, "sha256": digest, "bytes": len(data), "status": status})
image = json.loads(subprocess.check_output(["docker", "inspect", "tiberio-frappe-local-backend-1"], text=True))[0]["Image"]
print(json.dumps({"running_image": image, "count": len(rows), "all_equal": True, "assets": rows}, ensure_ascii=False, indent=2))
