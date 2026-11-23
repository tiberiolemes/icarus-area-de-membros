"""Regression for the real Babel/Vue extractor, using installed parsers without executing source."""
import json
import subprocess
from pathlib import Path

HERE=Path(__file__).parent
payload={
 'regression.js':r'''__("Couldn\'t connect"); __('C:\\tmp'); __('Hello ' + 'world');
 const example="__('not a translation call')";
 function minified(__) { return __("document.F=Object") }
 { const _ = value => value; _("not native either") }
 ''',
 'regression.vue':r'''<template><p :title="__('That isn\'t {0}', [name])">{{ __('Hello ' + 'again') }}</p></template><script setup>import { __ } from '../translate.js'; __('Complete sentence')</script>''',
 'app/templates/login.js':r'''const x={{ config|tojson }}; const y={{ _("Password is required.")|tojson }}; __("Normal JS");''',
}
# JS escaping below intentionally distinguishes apostrophe escaping from a literal backslash.
expected={
 'regression.js':["Couldn't connect",r'C:\tmp','Hello world'],
 'regression.vue':['Complete sentence',"That isn't {0}",'Hello again'],
 'app/templates/login.js':['Password is required.','Normal JS'],
}
runner='const payload='+json.dumps(payload)+';\n'+(HERE/'extract_native_js.cjs').read_text()
done=subprocess.run(['docker','exec','-i','tiberio-frappe-local-backend-1','node'],input=runner,text=True,capture_output=True,check=True)
result=json.loads(done.stdout)
assert not result['errors'], result['errors']
for file,messages in result['messages'].items():
    assert sorted(row['source'] for row in messages)==sorted(expected[file]),(file,messages,expected[file])
print(json.dumps({'files':len(payload),'exact_messages':sum(map(len,expected.values())),'errors':0}))
