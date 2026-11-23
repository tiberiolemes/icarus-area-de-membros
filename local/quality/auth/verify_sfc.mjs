import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('package.json'))
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
const files = ['App.vue', 'pages/Setup.vue', 'components/SessionInactivity.vue', ...['PasswordField', 'PasswordRequirements', 'ChangePasswordDialog', 'FirstPasswordStep', 'TwoFactorSettings'].map((name) => `components/Profile/${name}.vue`)]
for (const file of files) {
	const filename = path.resolve('src', file)
	const { descriptor, errors } = parse(fs.readFileSync(filename, 'utf8'), { filename })
	assert.equal(errors.length, 0, file)
	const script = compileScript(descriptor, { id: file })
	const template = compileTemplate({ source: descriptor.template.content, filename, id: file, compilerOptions: { bindingMetadata: script.bindings } })
	assert.equal(template.errors.length, 0, `${file}: ${template.errors.join('; ')}`)
}
process.stdout.write(JSON.stringify({ sfc_parsed_and_compiled: files.length }) + '\n')
