"""Observe a real delayed metadata event on an empty QA profile; restore only its nginx in finally."""

import argparse
import hashlib
import json
import subprocess
import time
import urllib.request
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('revision')
parser.add_argument('--page',required=True)
parser.add_argument('--profile',required=True)
parser.add_argument('--lesson-url',required=True)
parser.add_argument('--expected-time',type=float,required=True)
args=parser.parse_args()
assert args.revision.startswith('r') and args.revision[1:].isdigit()
assert args.page!='f3bdeb5a-e6cd-408f-a158-f8bd68ed2516'
assert args.lesson_url.startswith('http://tiberio.localhost:8090/lms/courses/')
assert 0<args.expected_time<8
root=Path(__file__).resolve().parents[3]
out=root/'.local/quality'/('08-'+args.revision+'-cold-delayed')
assert not out.exists()
out.mkdir(mode=0o700)
orca='/Applications/Orca.app/Contents/Resources/bin/orca'
owner='tiberio-quality08-'+args.revision+'-existing'
front=owner+'-frontend'
python='/home/frappe/frappe-bench/env/bin/python'
def docker(*items):return subprocess.run(['docker',*items],capture_output=True,check=True)
info=json.loads(docker('inspect',front).stdout)[0]
build=json.loads((root/'docs/audit/quality/evidence'/('08-build-'+args.revision+'.json')).read_text())
assert info['Config']['Labels']['tiberio.quality.owner']==owner and info['Image']==build['image_id']
assert not any(m['Destination'].startswith('/home/frappe/frappe-bench/apps') for m in info['Mounts'])
originals=['tiberio-frappe-local-'+s+'-1' for s in ('frontend','backend','websocket','worker','scheduler','db','redis')]
def projection(rows):return [(r['Id'],r['Image'],r['State']['StartedAt'],r['State']['Running'],r['State']['Paused'],r['State']['OOMKilled'],r['HostConfig']['RestartPolicy']) for r in rows]
original_before=projection(json.loads(docker('inspect',*originals).stdout))
before=docker('exec',front,'cat','/etc/nginx/conf.d/frappe.conf').stdout
(out/'nginx-before.conf').write_bytes(before)
needle=b'location ~ ^/protected/(.*) {\n'
assert before.count(needle)==1
modified=before.replace(needle,needle+b'        limit_rate 4096;\n')
receipt={'exit_code':1,'image_id':info['Image'],'application_source_overlay':False,'page':args.page,'profile':args.profile,'temporary_network_fixture':'4096 bytes/s for owned protected media only','deadline_seconds':45,'commands':[]}
def browser(items,label):
 command=[orca,*items,'--json']
 result=subprocess.run(command,capture_output=True,timeout=25)
 (out/(label+'.json')).write_bytes(result.stdout+result.stderr)
 receipt['commands'].append({'command':command,'exit_code':result.returncode})
 assert result.returncode==0,label
 return json.loads(result.stdout)
def eval_js(js,label):
 payload=browser(['eval','--page',args.page,'--expression',js],label)
 return json.loads(payload['result']['result'])
def config(data):
 docker('exec',front,python,'-c',"from pathlib import Path;Path('/etc/nginx/conf.d/frappe.conf').write_bytes("+repr(data)+")")
 docker('exec',front,'nginx','-t')
 docker('kill','--signal','SIGHUP',front)
try:
 profile=browser(['tab','profile','show','--page',args.page],'profile')
 receipt['profile_binding']=profile['result']
 prior=eval_js('({noVideo:!document.querySelector("video"),videoResources:performance.getEntriesByType("resource").filter(e=>e.initiatorType==="video").length})','before')
 assert prior['noVideo'] and prior['videoResources']==0
 receipt['before']=prior
 config(modified)
 browser(['goto','--page',args.page,'--url',args.lesson_url],'open')
 initial=eval_js("""(async()=>{const end=performance.now()+5000;let v;while(!(v=document.querySelector('video'))){if(performance.now()>end)throw Error('No video');await new Promise(r=>setTimeout(r,25))};const p=window.__qc08Cold={initial:{ready:v.readyState,duration:Number.isFinite(v.duration)?v.duration:null,time:v.currentTime},started:performance.now(),metadata:null};v.addEventListener('loadedmetadata',event=>{p.metadata={trusted:event.isTrusted,wait_ms:performance.now()-p.started,duration:v.duration};},{once:true});return p.initial})()""",'initial')
 assert initial['ready']==0 and initial['duration'] is None,'The delayed case must actually precede metadata'
 deadline=time.monotonic()+45
 count=0
 while True:
  state=eval_js("""(()=>{const v=document.querySelector('video'),p=window.__qc08Cold;return {initial:p.initial,metadata:p.metadata,current:{time:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:null,ready:v.readyState,paused:v.paused}}})()""",'poll-'+str(count))
  count+=1
  if state['metadata'] and abs(state['current']['time']-args.expected_time)<.01:
   assert state['metadata']['trusted'] and state['metadata']['wait_ms']>0 and state['current']['duration']==8 and state['current']['paused']
   receipt['observation']=state
   break
  assert time.monotonic()<deadline,'Native delayed resume did not reach the saved partial position'
  time.sleep(.3)
 receipt['exit_code']=0
finally:
 config(before)
 assert docker('exec',front,'cat','/etc/nginx/conf.d/frappe.conf').stdout==before
 deadline=time.monotonic()+20
 while True:
  try:
   with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8090/api/method/ping',headers={'Host':'tiberio.localhost'}),timeout=3) as response:assert response.status==200
   break
  except (OSError,AssertionError):
   if time.monotonic()>deadline:raise
   time.sleep(.2)
 with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8088/lms',headers={'Host':'tiberio.localhost'}),timeout=5) as response:assert response.status==200
 assert projection(json.loads(docker('inspect',*originals).stdout))==original_before
 receipt.update(config_restored_byte_equal=True,exact_owned_frontend_ready=True,original_http200=True,original_seven_unchanged=True,nginx_config_sha256=hashlib.sha256(before).hexdigest(),harness_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
 (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ('commands','profile_binding')}))
