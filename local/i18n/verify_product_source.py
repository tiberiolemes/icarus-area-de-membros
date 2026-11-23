"""Compare product sources and pinned build inputs with the running image; no DB/secret reads."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
paths = []
for directory in ('lms', 'frontend/src', 'frontend/build'):
    paths.extend(p for p in (ROOT / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts
                 and p.suffix in ('.py', '.js', '.ts', '.vue', '.json', '.css', '.csv'))
paths.extend(ROOT / name for name in ('frontend/vite.config.js','frontend/vitest.config.ts','frontend/package.json','frontend/yarn.lock','local/Dockerfile','local/bootstrap.py'))
paths.extend(p for p in (ROOT/'local/i18n').glob('*.json'))
expected = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths)) if p.exists()}
runner = '''import json,sys,hashlib
from pathlib import Path
root=Path('/home/frappe/frappe-bench/apps/lms')
expected=json.load(sys.stdin)
mismatch=[]
for relative,digest in expected.items():
 path=root/relative
 actual=hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
 if digest!=actual:mismatch.append(relative)
print(json.dumps({'checked_files':len(expected),'all_equal':not mismatch,'mismatches':mismatch}))
'''
result = subprocess.run(['docker','exec','-i','tiberio-frappe-local-backend-1','env/bin/python','-c',runner],input=json.dumps(expected),text=True,capture_output=True,check=True)
data=json.loads(result.stdout)
assert data['all_equal'],data
print(json.dumps(data,ensure_ascii=False,indent=2))
