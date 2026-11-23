import hashlib,http.client,json,os,socket,subprocess,urllib.parse
from pathlib import Path
os.umask(0o077);root=Path.cwd();out=root/'.local/quality/08-recovery-config-commit';assert not out.exists();out.mkdir()
base='sha256:81045a6d8e1db3c49fd7aca81c5d145bdbd9715b4f2454ef4612b66fbaa3ed2c';container='tiberio-quality08-recovery-build'
old=json.loads(subprocess.check_output(['docker','image','inspect',base]))[0];before=json.loads(subprocess.check_output(['docker','image','inspect','tiberio-frappe-local:rollback-compat08-20261122']))[0]
info=json.loads(subprocess.check_output(['docker','inspect',container]))[0];assert info['Image']==base and info['Config']['Labels']['tiberio.quality.owner']==container and not info['State']['Running']
config=old['Config'];config['Labels']=before['Config']['Labels'];config['Labels']['io.tiberio.recovery.config-commit']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
address=subprocess.check_output(['docker','context','inspect','desktop-linux','--format','{{.Endpoints.docker.Host}}'],text=True).strip();assert address.startswith('unix://')
class UnixHTTP(http.client.HTTPConnection):
 def connect(self):self.sock=socket.socket(socket.AF_UNIX);self.sock.connect(address[7:])
conn=UnixHTTP('localhost',timeout=90);query=urllib.parse.urlencode({'container':container,'repo':'tiberio-frappe-local','tag':'rollback-compat08-20261122-exact','pause':'true'})
conn.request('POST','/v1.53/commit?'+query,body=json.dumps(config).encode(),headers={'Content-Type':'application/json'});response=conn.getresponse();body=response.read();(out/'native-api-result.json').write_bytes(body);assert response.status==201
image=json.loads(body)['Id'];final=json.loads(subprocess.check_output(['docker','image','inspect',image]))[0];diff={k:{'before':old['Config'].get(k),'after':final['Config'].get(k)} for k in old['Config'].keys()|final['Config'].keys() if k!='Labels' and old['Config'].get(k)!=final['Config'].get(k)}
proof={'api_status':response.status,'image_id':image,'config_differences':diff,'all_executable_config_equal':not diff,'base_layers_preserved':final['RootFS']['Layers'][:len(old['RootFS']['Layers'])]==old['RootFS']['Layers'],'harness_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()};(out/'receipt.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps(proof))
