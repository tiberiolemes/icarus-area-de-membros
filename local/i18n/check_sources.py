"""Compile/check pinned overlays in memory, using only read-only dependency parsers."""
import argparse
import ast
import hashlib
import json
import subprocess
from pathlib import Path

from merge_catalogs import catalog_paths, merge

HERE=Path(__file__).parent

def patched_source(root, row):
    text=(root/row['path']).read_text()
    digest=lambda text:hashlib.sha256(text.encode()).hexdigest()
    if digest(text)==row['after_sha256']:return text
    if digest(text)!=row['before_sha256']:raise ValueError('Source drift: '+row['path'])
    for item in row['replacements']:
        if text.count(item[0])!=(item[2] if len(item)>2 else 1):raise ValueError('Target drift: '+row['path'])
        text=text.replace(item[0],item[1],item[2] if len(item)>2 else 1)
    assert digest(text)==row['after_sha256'],row['path']
    return text

def run(args):
    manifest=json.loads((HERE/'framework-package-overlay.json').read_text())
    patched={r['path']:patched_source(args.packages,r) for r in manifest['patches'] if Path(r['path']).suffix in ('.js','.ts','.vue')}
    dependency=json.loads((HERE/'framework-dependency-overlay.json').read_text())
    patched.update({r['path']:patched_source(args.packages,r) for r in dependency['patches']})
    files={r['path']:(args.packages/r['path']).read_text() for r in dependency['patches']}
    for relative in ['studio/frontend/src','ui/src','flow/frontend/src','flow/harness/ui/core/src','flow/harness/ui/app/src','studio/frontend/node_modules/frappe-ui/src','flow/node_modules/frappe-ui/src']:
        for path in (args.packages/relative).rglob('*'):
            if path.suffix not in ('.js','.ts','.vue') or not path.is_file():continue
            if any(p in ('tests','test','__tests__','stories','cypress') for p in path.parts) or any(s in path.name for s in ('.test.','.spec.','.stories.','.story.')):continue
            files[str(path.relative_to(args.packages))]=path.read_text()
    assert files,'No package source found'
    result={}
    context_manifest=json.loads((HERE/'frontend-context-overlay.json').read_text())
    frontend=patched_source(HERE.parents[1], context_manifest['patches'][0])
    payload={'files':files,'patched':patched,'messages':merge(catalog_paths(HERE)), 'frontend':frontend, 'frontendMessages':json.loads((HERE/'lms-pt-BR.json').read_text()), 'context':json.loads((HERE/'context-overrides-pt-BR.json').read_text())}
    for check in ('check_package_sources.cjs','check_package_runtime.cjs'):
        script='const payload='+json.dumps(payload)+';\n'+(HERE/check).read_text()
        done=subprocess.run(['docker','exec','-i',args.container,'node','--max-old-space-size=4096'],input=script,text=True,capture_output=True,check=True)
        result[check]=json.loads(done.stdout)
    syntax=0
    for root,name in [(args.framework,'framework-overlay.json'),(args.payments,'payments-overlay.json')]:
        for row in json.loads((HERE/name).read_text())['patches']:
            # Generated HTML is checked against its built assets by verify_applied;
            # this loop only parses Python and JSON source.
            if Path(row['path']).suffix not in ('.py', '.json'):
                continue
            text=patched_source(root,row)
            if row['path'].endswith('.py'):ast.parse(text);syntax+=1
            if row['path'].endswith('.json'):json.loads(text);syntax+=1
    result['python_json_syntax']=syntax
    print(json.dumps(result))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--packages',type=Path,required=True);p.add_argument('--framework',type=Path,required=True);p.add_argument('--payments',type=Path,required=True);p.add_argument('--container',default='tiberio-frappe-local-backend-1');run(p.parse_args())
