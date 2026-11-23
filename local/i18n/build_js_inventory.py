"""Parse source and shipped dependency bundles without evaluating their JavaScript."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

HERE=Path(__file__).parent

def build(roots, destination, container):
    payload={}
    origins={}
    for name,root in roots.items():
        for path in root.rglob('*'):
            if not path.is_file() or path.suffix not in ('.js','.ts','.vue','.mjs'):continue
            relative=path.relative_to(root)
            if any(part in ('tests','test','_test','locale','__pycache__') for part in relative.parts) or path.name.startswith('test_'):continue
            # Actual frappe-ui dependencies are audited explicitly, excluding tests/stories.
            if 'node_modules' in relative.parts and not (('frappe-ui' in relative.parts and 'src' in relative.parts) or ('@vue-flow' in relative.parts and 'core' in relative.parts and path.name=='vue-flow-core.mjs')):continue
            if any(part in ('__tests__','stories') for part in relative.parts) or '.test.' in path.name or '.spec.' in path.name or '.stories.' in path.name:continue
            key=name+'/'+str(relative)
            payload[key]=path.read_text(errors='replace')
            origins[key]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'generated':any(part in ('dist','assets') for part in relative.parts) or path.name.endswith('.min.js')}
            if '@vue-flow' in relative.parts:
                origins[key].update(dependency_build_input=True, dependency_version='1.26.0' if str(relative).startswith('node_modules/') else '1.48.2', source_review='DEPENDENCY-SOURCE-REVIEW.json')
            if origins[key]['generated']:
                source_map=path.with_suffix(path.suffix+'.map')
                if source_map.exists():
                    data=json.loads(source_map.read_text())
                    origins[key]['source_map']={'sha256':hashlib.sha256(source_map.read_bytes()).hexdigest(),'sources':data.get('sources',[]),'embedded_sources':sum(bool(v) for v in data.get('sourcesContent',[]))}
    script='const payload='+json.dumps(payload)+';\n'+(HERE/'extract_native_js.cjs').read_text()
    done=subprocess.run(['docker','exec','-i',container,'node','--max-old-space-size=4096'],input=script,text=True,capture_output=True,check=True)
    result=json.loads(done.stdout)
    result['origins']=origins
    destination.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'files':len(payload),'messages':sum(map(len,result['messages'].values())),'errors':result['errors']}))
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',action='append',required=True,help='name=/source/copy');p.add_argument('--output',type=Path,required=True);p.add_argument('--container',default='tiberio-frappe-local-backend-1')
    a=p.parse_args();build({key:Path(value) for key,value in (v.split('=',1) for v in a.root)},a.output,a.container)
