// `payload` is a map of pinned source paths to source; no source is executed.
const root = '/home/frappe/frappe-bench/apps/frappe/studio/frontend'
const { parse } = require(root + '/node_modules/@babel/parser')
const sfc = require(root + '/node_modules/@vue/compiler-sfc')
const dom = require(root + '/node_modules/@vue/compiler-dom')
const result = {}
const errors = []
function literal(node) {
  if(node?.type==='StringLiteral')return node.value
  if(node?.type==='TemplateLiteral'&&!node.expressions.length)return node.quasis[0].value.cooked
  if(node?.type==='BinaryExpression'&&node.operator==='+') {
    const a=literal(node.left),b=literal(node.right)
    if(a!==undefined&&b!==undefined)return a+b
  }
}
function extract(source, file, base=0) {
  let ast
  const options={sourceType:'unambiguous',plugins:['typescript'],allowReturnOutsideFunction:true,allowAwaitOutsideFunction:true}
  if(file.includes('/boilerplate/')) source=source.replaceAll('{{','{').replaceAll('}}','}')
  else if((file.includes('/templates/')||file.includes('/www/'))&&(source.includes('{%')||source.includes('{{'))) {
    const original=source
    source=source.replace(/\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g,'')
    source=source.replace(/\{\{([\s\S]*?)\}\}/g,(_,expression)=>{
      const native=expression.match(/(?:__|_)\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\)/g)||[]
      for(const call of native)extract(call,file,base)
      return 'null'
    })
  }
  try { ast=parse(source,options) }
  catch(error){try{ast=parse('('+source+')',options)}catch{errors.push({path:file,error:error.message});return}}
  const native=new Set(['__','_','_lt','N_','translate','__pt'])
  const scopes=new WeakMap()
  const boundaries=new Set(['Program','BlockStatement','FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','CatchClause'])
  function bind(pattern,scope,value=false){
    if(!pattern)return
    if(pattern.type==='Identifier')scope.bindings.set(pattern.name,value)
    else if(pattern.type==='RestElement')bind(pattern.argument,scope,value)
    else if(pattern.type==='AssignmentPattern')bind(pattern.left,scope,value)
    else if(pattern.type==='ObjectPattern')for(const p of pattern.properties)bind(p.value||p.argument,scope,value)
    else if(pattern.type==='ArrayPattern')for(const p of pattern.elements)bind(p,scope,value)
  }
  function children(n,fn){for(const[k,c]of Object.entries(n)){if(['loc','extra','comments'].includes(k))continue;if(Array.isArray(c))c.forEach(v=>v&&typeof v==='object'&&fn(v));else if(c&&typeof c==='object')fn(c)}}
  function declare(n,parent){
    let scope=parent
    if(n.type==='FunctionDeclaration'&&n.id)bind(n.id,parent)
    if(boundaries.has(n.type)){scope={parent,bindings:new Map()};scopes.set(n,scope);for(const p of n.params||[])bind(p,scope);if(n.type==='CatchClause')bind(n.param,scope)}
    if(n.type==='VariableDeclarator')bind(n.id,scope)
    if(n.type==='ImportDeclaration')for(const p of n.specifiers||[])bind(p.local,scope,/translate|framework\/ui/.test(n.source.value))
    children(n,c=>declare(c,scope))
  }
  const rootScope={bindings:new Map()};declare(ast,rootScope)
  function lookup(name,scope){for(let p=scope;p;p=p.parent)if(p.bindings.has(name))return p.bindings.get(name);return true}
  function walk(n,parent){
    const scope=scopes.get(n)||parent
    if(n.type==='CallExpression'&&native.has(n.callee?.name)&&lookup(n.callee.name,scope)) {
      const text=literal(n.arguments[0])
      if(typeof text==='string'&&text.trim())result[file].push({source:text.trim(),offset:base+n.start})
    }
    children(n,c=>walk(c,scope))
  }
  walk(ast,rootScope)
}
for(const[file,source]of Object.entries(payload)) {
  result[file]=[]
  if(file.endsWith('.vue')) {
    const p=sfc.parse(source,{filename:file});if(p.errors.length){errors.push({path:file,error:String(p.errors)});continue}
    for(const script of [p.descriptor.script,p.descriptor.scriptSetup].filter(Boolean))extract(script.content,file,script.loc.start.offset)
    const template=p.descriptor.template
    if(template){
      function walk(n){
        if(n.type===5)extract(n.content.content,file,template.loc.start.offset+n.content.loc.start.offset)
        for(const a of n.props||[])if(a.type===7&&a.exp&&a.name!=='for')extract(a.exp.content,file,template.loc.start.offset+a.exp.loc.start.offset)
        for(const c of n.children||[])walk(c)
      }
      walk(dom.baseParse(template.content))
    }
  }else extract(source,file)
}
process.stdout.write(JSON.stringify({messages:result,errors}))
