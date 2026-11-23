// Read-only source planning; run with the pinned image's Vue/Babel compilers.
const fs = require('node:fs')
const path = require('node:path')
const root = '/home/frappe/frappe-bench/apps/frappe'
const compiler = require(root + '/studio/frontend/node_modules/@vue/compiler-sfc')
const { baseParse } = require(root + '/studio/frontend/node_modules/@vue/compiler-dom')
const { parse: babelParse } = require(root + '/studio/frontend/node_modules/@babel/parser')
const roots = ['studio/frontend/src', 'ui/src', 'flow/frontend/src', 'flow/harness/ui/core/src', 'flow/harness/ui/app/src', 'studio/frontend/node_modules/frappe-ui/src', 'flow/node_modules/frappe-ui/src']
const records = []
const files = {}
const displayFields = new Set(['label','title','subtitle','caption','badge','description','detail','placeholder','message','tooltip','helperText','help','text','emptyText','emptyMessage','confirmLabel','cancelLabel','buttonLabel','aria-label','alt'])
const excluded = /\/(?:tests?|__tests__|stories|docs|scripts)\/|(?:\.test|\.spec|\.story)\./
function list(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? list(path.join(dir,e.name)) : [path.join(dir,e.name)]) : [] }
function add(file, text, start, end, kind, encoding='js', args=[]) {
  if (typeof text !== 'string' || !text.trim() || !/[A-Za-z]/.test(text)) return
  const unicodeStart=Array.from(files[file].slice(0,start)).length
  const unicodeEnd=Array.from(files[file].slice(0,end)).length
  records.push({path:file, source:text.trim(), leading:text.match(/^\s*/)[0],trailing:text.match(/\s*$/)[0],start:unicodeStart,end:unicodeEnd,kind,encoding,args,line:files[file].slice(0,start).split('\n').length})
}
function concatenate(node, source) {
  const args=[]
  const hasString=n=>['StringLiteral','TemplateLiteral'].includes(n?.type)||n?.type==='BinaryExpression'&&n.operator==='+'&&(hasString(n.left)||hasString(n.right))
  function build(n){
    if(n.type==='StringLiteral')return n.value
    if(n.type==='TemplateLiteral')return n.quasis.map((q,i)=>q.value.cooked+(i<n.expressions.length?build(n.expressions[i]):'')).join('')
    if(n.type==='BinaryExpression'&&n.operator==='+'&&hasString(n))return build(n.left)+build(n.right)
    args.push(source.slice(n.start,n.end));return `{${args.length-1}}`
  }
  return {text:build(node),args}
}
function expression(text, offset, file, kind, encoding) {
  let ast
  try { ast=babelParse(text,{plugins:['typescript'],sourceType:'module'}) } catch { return }
  function walk(n,p) {
    if (!n || typeof n!=='object') return
    if (n.type==='CallExpression' && ['__','__pt','translate'].includes(n.callee?.name)) return
    if(n.type==='BinaryExpression'&&n.operator==='+'&&p?.type!=='BinaryExpression'){
      const value=concatenate(n,text);add(file,value.text,offset+n.start,offset+n.end,kind,encoding,value.args);return
    }
    if (n.type==='StringLiteral' && !['BinaryExpression','MemberExpression','ObjectProperty','CallExpression'].includes(p?.type)) add(file,n.value,offset+n.start,offset+n.end,kind,encoding)
    if(n.type==='TemplateLiteral') {
      add(file,n.quasis.map((q,i)=>q.value.cooked+(i<n.expressions.length?`{${i}}`:'')).join(''),offset+n.start,offset+n.end,kind,encoding,n.expressions.map(e=>text.slice(e.start,e.end)))
      return
    }
    for(const [k,c]of Object.entries(n)) { if(['loc','extra','comments'].includes(k))continue; if(Array.isArray(c))c.forEach(x=>walk(x,n));else if(c&&typeof c==='object')walk(c,n) }
  }
  walk(ast,null)
}
for(const base of roots)for(const absolute of list(path.join(root,base))) {
  const file=path.relative(root,absolute)
  if(excluded.test('/'+file)||!(/\.(vue|ts|js)$/.test(file)))continue
  const source=fs.readFileSync(absolute,'utf8');files[file]=source
  let scripts=[{content:source,offset:0}],descriptor
  if(file.endsWith('.vue')) {
    const parsed=compiler.parse(source,{filename:file}); if(parsed.errors.length)throw new Error(file+': '+parsed.errors)
    descriptor=parsed.descriptor;scripts=[descriptor.script,descriptor.scriptSetup].filter(Boolean).map(s=>({content:s.content,offset:s.loc.start.offset}))
    if(descriptor.template) {
      const t=descriptor.template,offset=t.loc.start.offset
      function walk(n,code=false){
        code=code||['code','pre','kbd'].includes(n.tag)
        if(n.type===2)add(file,n.content,offset+n.loc.start.offset,offset+n.loc.end.offset,code?'template-code':'template-text','text')
        if(n.type===5)expression(n.content.content,offset+n.content.loc.start.offset,file,'interpolation','js')
        for(const a of n.props||[]) {
          if(a.type===6&&a.value&&displayFields.has(a.name))add(file,a.value.content,offset+a.loc.start.offset,offset+a.loc.end.offset,'attribute:'+a.name,'attribute')
          if(a.type===7&&a.name==='bind'&&displayFields.has(a.arg?.content)&&a.exp)expression(a.exp.content,offset+a.exp.loc.start.offset,file,'binding:'+a.arg.content,'attribute-expression')
        }
        for(const child of n.children||[])walk(child,code)
      }
      walk(baseParse(t.content))
    }
  }
  for(const script of scripts){
    let ast;try{ast=babelParse(script.content,{sourceType:'module',plugins:['typescript']})}catch(e){throw new Error(file+': '+e.message)}
    function walk(n,p,display=false){
      if(!n||typeof n!=='object')return
      if(n.type==='ImportDeclaration'||n.type==='ExportNamedDeclaration'&&n.source)return
      if(n.type==='CallExpression'&&['__','translate','__pt'].includes(n.callee?.name))return
      const property=n.type==='ObjectProperty'&&displayFields.has(n.key?.name||n.key?.value)
      const directError=(p?.type==='NewExpression'&&['Error','UploadError'].includes(p.callee?.name))||(p?.type==='CallExpression'&&(['alert','confirm','createToast','ask'].includes(p.callee?.name)||['toast','toasts'].includes(p.callee?.object?.name)||['errors','warnings'].includes(p.callee?.object?.name)&&p.callee?.property?.name==='push'||file.endsWith('/ExportAppDialog.vue')&&p.callee?.object?.name==='segments'))
      const presentation=display||directError
      const codeArgument=['CallExpression','OptionalCallExpression'].includes(p?.type)&&!directError&&!['ref','shallowRef','computed','String'].includes(p.callee?.name)||file.includes('/utils/completions/')&&p?.type==='ObjectProperty'&&p.key?.name==='label'
      if(n.type==='StringLiteral'&&!['BinaryExpression','MemberExpression'].includes(p?.type)&&presentation)add(file,n.value,script.offset+n.start,script.offset+n.end,codeArgument?'script-code-argument':display?'script-presentation':'error-message')
      if(n.type==='BinaryExpression'&&n.operator==='+'&&presentation&&p?.type!=='BinaryExpression'){
        const value=concatenate(n,script.content);add(file,value.text,script.offset+n.start,script.offset+n.end,codeArgument?'script-code-argument':'script-presentation','js',value.args);return
      }
      if(n.type==='TemplateLiteral'&&presentation) {
        add(file,n.quasis.map((q,i)=>q.value.cooked+(i<n.expressions.length?`{${i}}`:'')).join(''),script.offset+n.start,script.offset+n.end,codeArgument?'script-code-argument':'script-presentation','js',n.expressions.map(e=>script.content.slice(e.start,e.end)))
        return
      }
      for(const[k,c]of Object.entries(n)){
        if(['loc','extra','comments','leadingComments','trailingComments','key'].includes(k))continue
        const variable=n.type==='VariableDeclarator'&&/(?:Title|Label|Message|Text|Placeholder|Tooltip|Error|_ADVICE|_MESSAGE|_LABEL|_TITLE|_TEXT)$/.test(n.id?.name||'')&&k==='init'
        const explicitVariable=n.type==='VariableDeclarator'&&k==='init'&&(file.endsWith('/ExportAppDialog.vue')&&n.id?.name==='segments'||file.endsWith('/AgentPanel.vue')&&['skill','preview','lines'].includes(n.id?.name))
        const assignment=n.type==='AssignmentExpression'&&k==='right'&&(n.left?.object?.name==='document'&&n.left?.property?.name==='title'||/^(error|warning|message|caption|label|title|tooltip)$/.test(n.left?.object?.name||n.left?.name||''))
        const childDisplay=property&&k==='value'||variable||explicitVariable||assignment||display&&n.type!=='ObjectProperty'
        if(Array.isArray(c))c.forEach(x=>walk(x,n,childDisplay));else if(c&&typeof c==='object')walk(c,n,childDisplay)
      }
    }
    walk(ast,null)
  }
}
process.stdout.write(JSON.stringify({records,files}))
