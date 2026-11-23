// Run the translated pure helpers with synthetic values; no app/HTTP/site is initialized.
const vm=require('node:vm'),assert=require('node:assert/strict')
const root='/home/frappe/frappe-bench/apps/frappe/studio/frontend/node_modules/'
const ts=require(root+'typescript')
function moduleFrom(file,resolve,extra={}){
 const context={exports:{},module:{exports:{}},location:{hostname:'tiberio.localhost'},Intl,Date,console,require:resolve,...extra}
 vm.runInNewContext(ts.transpileModule(payload.patched[file],{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context)
 return context.exports
}
let checks=0
const native=moduleFrom('ui/src/utils/translate.ts',()=>payload.messages)
assert.equal(native.translate('Batch'),'Turma');checks++
assert.equal(native.translate('Canvas'),'Área de edição');checks++
assert.equal(native.translate("Couldn't connect {0}",['caixa sintética']),'Não foi possível conectar caixa sintética');checks++
assert.equal(native.translate('Conteúdo sintético sem chave'),'Conteúdo sintético sem chave');checks++
const tabs=moduleFrom('ui/src/components/FormLayout/tabIdentity.ts',()=>({translate:native.translate}))
assert.equal(tabs.tabStripLabel('Details',true),'Detalhes');checks++
assert.deepEqual(JSON.parse(JSON.stringify(tabs.identifyTabs([{label:'Details'},{label:'Details'}]))).map(t=>t.identity),['details','details-2']);checks++
const numbers=moduleFrom('ui/src/components/FormLayout/formatNumber.ts',()=>({}))
assert.equal(numbers.formatNumber(1234.56,{precision:2}),'1.234,56');checks++
for(const prefix of ['studio/frontend/node_modules/frappe-ui/src/','flow/node_modules/frappe-ui/src/']){
 const dates=moduleFrom(prefix+'utils/dayjs.ts',path=>{
  if(path==='./config')return {getConfig:()=> 'America/Sao_Paulo'}
  return require(root+path.replace('dayjs/esm','dayjs'))
 })
 assert.equal(dates.dayjs('2026-11-21').format('MMMM'),'novembro');checks++
 assert.equal(dates.dayjs('2026-11-21').format('YYYY-MM-DD'),'2026-11-21');checks++
 const calendar=moduleFrom(prefix+'components/DatePicker/utils.ts',()=>dates)
 assert.equal(calendar.months[1],'fev');checks++
}
const transcript=payload.patched['flow/harness/ui/core/src/transcript.js']
const ast=require(root+'@babel/parser').parse(transcript,{sourceType:'module'})
const selected=ast.program.body.filter(n=>n.type==='ExportNamedDeclaration'&&['formatTime','formatCost','formatTokens'].includes(n.declaration?.id?.name)).map(n=>transcript.slice(n.declaration.start,n.declaration.end)).join('\n')
const context={Intl,Date};vm.runInNewContext(selected,context)
assert.ok(context.formatTime(Date.parse('2020-11-21T18:30:00Z')/1000).includes('15:30'));checks++
assert.ok(context.formatCost(1.23).includes('1,23'));checks++
assert.ok(context.formatTokens(1200).includes('1,2'));checks++
// Integrator's hash-pinned two-line frontend overlay is checked only in memory.
payload.patched['frontend/src/translationMessages.js']=payload.frontend
const frontend=moduleFrom('frontend/src/translationMessages.js',path=>path.includes('context-overrides')?payload.context:payload.frontendMessages,{window:{lang:'pt-BR',translatedMessages:{Batch:'Valor anterior'}},document:{documentElement:{lang:'pt-BR'}}})
assert.equal(frontend.translate('Batch'),'Turma');checks++
assert.equal(frontend.translate('Gateway'),'Provedor de pagamento');checks++
assert.equal(frontend.translate('Canvas'),'Área de edição');checks++
assert.equal(frontend.translate('Welcome to Frappe Learning'),'Boas-vindas à plataforma de Tibério Lemes');checks++
process.stdout.write(JSON.stringify({pure_helper_assertions:checks,no_http_database_or_email:true}))
