// Compile/render the two JS microtemplates with the version-pinned native engine.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')

const framework = process.argv[2]
const payments = process.argv[3]
if (!framework || !payments) throw new Error('Usage: node check_microtemplates.cjs FRAMEWORK PAYMENTS')
const translations = JSON.parse(fs.readFileSync(path.join(__dirname, 'merged-pt-BR.json'), 'utf8'))
let sequence = 0
const context = vm.createContext({
  frappe: { utils: { get_random: () => `variable${sequence++}`, escape_html: value => String(value) } },
  __: source => translations[source] || source,
  jQuery: { isEmptyObject: value => Object.keys(value).length === 0 },
  console,
})
const engine = fs.readFileSync(path.join(framework, 'public/js/frappe/microtemplate.js'), 'utf8')
vm.runInContext(engine.split('frappe.render =')[0], context)
const templates = [
  [path.join(framework, 'core/doctype/audit_trail/audit_trail.html'),
    { documents: ['A', 'B'], changed: { Campo: ['Antes', 'Depois'] }, row_changed: { Tabela: { 1: { Campo: ['Antes', 'Depois'] } } } }, 'Documentos para comparar:'],
  [path.join(payments, 'payment_gateways/doctype/mpesa_settings/account_balance.html'),
    { data: { 'Conta sintética': { current_balance: 1, available_balance: 1, reserved_balance: 0, uncleared_balance: 0 } } }, 'Saldo'],
]
for (const [filename, fixture, expected] of templates) {
  const compile = context.frappe.template.compile(fs.readFileSync(filename, 'utf8'), filename)
  assert.equal(typeof compile, 'function', filename)
  const rendered = compile(fixture)
  assert.ok(rendered.includes(expected), filename)
  assert.ok(!rendered.includes('{{'), filename)
}
console.log(JSON.stringify({ native_microtemplates_compiled_and_rendered: templates.length }))
