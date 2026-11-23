// Read-only checks using an existing compiler installation. Input is JSON with
// sources, dependencySources, catalog, transformer and translator source.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

let input = ''
for await (const chunk of process.stdin) input += chunk
const data = JSON.parse(input)
const require = createRequire(import.meta.url)
const compiler = require(process.env.SFC_COMPILER || '@vue/compiler-sfc')
const { baseParse } = require(process.env.DOM_COMPILER || '@vue/compiler-dom')
const parser = require(process.env.JS_PARSER || '@babel/parser')
const importSource = (source) =>
	import(
		`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
	)
const { localizeUiSource } = await importSource(data.transformer)
const errors = []

function parseSource(source, path) {
	try {
		if (path.endsWith('.vue')) {
			const { descriptor, errors: issues } = compiler.parse(source, {
				filename: path,
			})
			if (issues.length)
				throw new Error(issues.map((issue) => issue.message).join('; '))
			if (descriptor.template) baseParse(descriptor.template.content)
			for (const script of [descriptor.script, descriptor.scriptSetup].filter(
				Boolean
			))
				parser.parse(script.content, {
					sourceType: 'module',
					plugins: ['typescript'],
				})
		} else
			parser.parse(source, { sourceType: 'module', plugins: ['typescript'] })
	} catch (error) {
		errors.push({ path, error: error.message })
	}
}

for (const [path, source] of Object.entries(data.sources))
	parseSource(source, path)
let adapted = 0
for (const [path, source] of Object.entries(data.dependencySources)) {
	try {
		const result = localizeUiSource(
			source,
			path,
			{ ...compiler, baseParse },
			data.catalog
		)
		if (result) {
			adapted++
			parseSource(result.code, path)
		}
	} catch (error) {
		errors.push({ path, error: error.message })
	}
}

globalThis.window = {
	lang: 'pt_BR',
	translatedMessages: { Courses: 'Courses' },
}
globalThis.document = { documentElement: { lang: 'pt-BR' } }
const translator = data.translator.replace(
	/^import portugueseMessages[^\n]*\n/,
	`const portugueseMessages = ${JSON.stringify(data.catalog)}\n`
)
const { translate } = await importSource(translator)
const checks = []
const check = (name, action) => {
	action()
	checks.push(name)
}
check('catalog before server response', () =>
	assert.equal(translate('Courses'), 'Cursos')
)
check('positional array, zero', () =>
	assert.equal(translate('{0} replies', [0]), '0 respostas')
)
check('LMS format API', () =>
	assert.equal(translate('{0} replies').format(2), '2 respostas')
)
check('named media placeholder', () =>
	assert.equal(translate('Player for {title}'), 'Reprodutor de {title}')
)
check('unknown placeholder kept', () =>
	assert.equal(translate('Unknown {0}', []), 'Unknown {0}')
)
check('prototype is not a translation', () =>
	assert.equal(translate('constructor'), 'constructor')
)
check('text stays text', () =>
	assert.equal(
		translate('Unknown {0}', ['<img onerror=alert(1)>']),
		'Unknown <img onerror=alert(1)>'
	)
)
window.lang = 'en'
window.translatedMessages = { 'Row {0}': 'Zeile {0}' }
check('other locales retain native dictionary', () =>
	assert.equal(translate('Row {0}', [7]), 'Zeile 7')
)

const source = `<template><button aria-label="Clear">Today</button><span>{{ user.title }}</span></template><script setup lang="ts">const options = [{label: 'Today', value: 'Today'}]; const props = withDefaults(defineProps<{placeholder?: string}>(), {placeholder: 'Select date'})</script>`
const result = localizeUiSource(
	source,
	'DatePicker.vue',
	{ ...compiler, baseParse },
	data.catalog
)
check('API values unchanged', () =>
	assert.ok(result.code.includes("value: 'Today'"))
)
check('user content unchanged', () =>
	assert.ok(result.code.includes('user.title'))
)
check('shared component compiles', () => {
	const { descriptor } = compiler.parse(result.code)
	compiler.compileScript(descriptor, { id: 'i18n-check' })
	assert.deepEqual(
		compiler.compileTemplate({
			source: descriptor.template.content,
			filename: 'DatePicker.vue',
			id: 'i18n-check',
		}).errors,
		[]
	)
})
const message =
	'export const error = `This file is ${size(file)}; the limit is ${size(max)}.`'
check('dependency interpolation expressions kept', () =>
	assert.ok(
		localizeUiSource(
			message,
			'fileSize.ts',
			{ ...compiler, baseParse },
			data.catalog
		).code.includes('[size(file), size(max)]')
	)
)

const placeholderErrors = []
for (const [key, value] of Object.entries(data.catalog)) {
	const placeholders = (s) =>
		[...s.matchAll(/\{(?:\d+|seektime|currentTime|duration|title)\}/g)]
			.map((m) => m[0])
			.sort()
	if (JSON.stringify(placeholders(key)) !== JSON.stringify(placeholders(value)))
		placeholderErrors.push(key)
	assert.ok(typeof value === 'string' && value.length, key)
}
console.log(
	JSON.stringify(
		{
			sourceFiles: Object.keys(data.sources).length,
			dependencyFiles: Object.keys(data.dependencySources).length,
			adaptedDependencyFiles: adapted,
			checks,
			syntaxErrors: errors,
			placeholderErrors,
		},
		null,
		2
	)
)
if (errors.length || placeholderErrors.length) process.exitCode = 1
