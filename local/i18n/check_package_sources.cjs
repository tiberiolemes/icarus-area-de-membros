// `payload` has original and transformed pinned sources; compile in memory only.
const fs = require('node:fs')
const root='/home/frappe/frappe-bench/apps/frappe/'
const sfc=require(root+'studio/frontend/node_modules/@vue/compiler-sfc')
const dom=require(root+'studio/frontend/node_modules/@vue/compiler-dom')
const babel=require(root+'studio/frontend/node_modules/@babel/parser')
const assert=require('node:assert/strict')
sfc.registerTS(()=>require(root+'studio/frontend/node_modules/typescript'))
const failures=[]
let parsed=0,compiled=0,contracts=0
function scriptContracts(source,file){
  const scripts=file.endsWith('.vue')?Object.values(sfc.parse(source).descriptor).filter(s=>s&&typeof s==='object'&&s.type==='script').map(s=>s.content):[source]
  const result=[]
  const keys=new Set(['name','value','fieldname','doctype','method','route','href','to','path','icon','class','type','componentName','fieldtype'])
  for(const text of scripts){
    const ast=babel.parse(text,{sourceType:'module',plugins:['typescript']})
    function walk(n){
      if(!n||typeof n!=='object')return
      if(n.type==='ObjectProperty'&&keys.has(n.key?.name||n.key?.value)&&n.value?.type==='StringLiteral')result.push([n.key?.name||n.key?.value,n.value.value])
      if(['CallExpression','OptionalCallExpression'].includes(n.type)&&['getProp','setProp','getAttribute','setAttribute'].includes(n.callee?.property?.name)&&n.arguments[0]?.type==='StringLiteral')result.push([n.callee.property.name,n.arguments[0].value])
      for(const[k,c]of Object.entries(n)){if(['loc','extra','comments'].includes(k))continue;if(Array.isArray(c))c.forEach(walk);else if(c&&typeof c==='object')walk(c)}
    }
    walk(ast)
  }
  return result
}
for(const[file,original]of Object.entries(payload.files)){
 const code=payload.patched[file]||original
 try{
  const before=scriptContracts(original,file),after=scriptContracts(code,file)
  assert.deepEqual(after,before,'technical/API contract changed')
  contracts+=before.length
  if(file.endsWith('.vue')){
   const p=sfc.parse(code,{filename:root+file});assert.equal(p.errors.length,0,String(p.errors))
   let bindings={}
   if(p.descriptor.script||p.descriptor.scriptSetup){const script=sfc.compileScript(p.descriptor,{id:'check',fs:{fileExists:f=>fs.existsSync(f)&&fs.statSync(f).isFile(),readFile:f=>fs.readFileSync(f,'utf8')}});bindings=script.bindings}
   if(p.descriptor.template){const t=sfc.compileTemplate({source:p.descriptor.template.content,filename:root+file,id:'check',compilerOptions:{bindingMetadata:bindings}});assert.equal(t.errors.length,0,JSON.stringify(t.errors));compiled++}
  }else babel.parse(code,{sourceType:'module',plugins:['typescript']})
  parsed++
 }catch(error){failures.push({path:file,error:error.message})}
}
process.stdout.write(JSON.stringify({parsed,compiled,contracts,changed:Object.keys(payload.patched).length,failures}))
process.exitCode=failures.length?1:0
