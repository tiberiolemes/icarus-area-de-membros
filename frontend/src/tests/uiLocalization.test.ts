import { describe, expect, it } from 'vitest'
import * as sfcCompiler from '@vue/compiler-sfc'
import { baseParse, compile as compileDOM } from '@vue/compiler-dom'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import { localizeUiSource } from '../../build/localizeUiSource'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import messages from '../../../local/i18n/lms-pt-BR.json'
import review from '../../../local/i18n/UI-EXPERIMENTAL-REVIEW.json'
import keyboard from '../../../local/i18n/UI-CALENDAR-KEYBOARD.json'
import { createHash } from 'node:crypto'
import { translate } from '@/translationMessages'

sfcCompiler.registerTS(() => ts)
const compiler = { ...sfcCompiler, baseParse }

describe('dependency presentation translation', () => {
	it('pins both calendar keyboard preimages and complete translated results', () => {
		expect(keyboard.version).toBe(review.version)
		expect(keyboard.files.map(file => file.path).sort()).toEqual([
			'experimental/Calendar/CalendarMonthEvent.vue',
			'experimental/Calendar/CalendarWeekDayEvent.vue',
		])
		for (const file of keyboard.files) {
			const id = path.resolve(import.meta.dirname, '../../node_modules/frappe-ui', file.path)
			const source = fs.readFileSync(id, 'utf8')
			const hash = (value: string) => createHash('sha256').update(value).digest('hex')
			expect(hash(source)).toBe(file.before_sha256)
			expect(review.files.find(original => original.path === file.path)?.sha256).toBe(file.before_sha256)
			expect(hash(localizeUiSource(source, id, compiler, messages)!.code)).toBe(file.after_sha256)
			expect(() => localizeUiSource(source.replace('} = useEventBase(props)', '} = changed(props)'), id, compiler, messages)).toThrow('Unsupported pinned UI source')
		}
	})
	it('renders interpolated native aria labels in Portuguese and preserves the disabled branch', async () => {
		;(window as any).lang = 'pt-BR'
		const source = '<template><button :aria-label="isSliderMode ? undefined : `${index} of ${starCount}`" /></template><script setup>const index=3, starCount=5, isSliderMode=false</script>'
		const transformed = localizeUiSource(source, '/Rating/Rating.vue', compiler, messages)!
		const { descriptor } = sfcCompiler.parse(transformed.code)
		const compiled = compileDOM(descriptor.template!.content, { mode: 'function' })
		const render = new Function('Vue', compiled.code)(Vue)
		const slider = Vue.ref(false)
		const wrapper = mount({ setup: () => ({ __lmsTranslate: translate, index: 3, starCount: 5, isSliderMode: slider }), render })
		expect(wrapper.find('button').attributes('aria-label')).toBe('3 de 5')
		slider.value = true
		await Vue.nextTick()
		expect(wrapper.find('button').attributes('aria-label')).toBeUndefined()
		wrapper.unmount()
		delete (window as any).lang
	})
	it('localizes the installed experimental calendar without changing ISO dates or mode IDs', () => {
		;(window as any).lang = 'pt-BR'
		const root = path.resolve(import.meta.dirname, '../../node_modules/frappe-ui')
		const id = root + '/experimental/Calendar/calendarUtils.ts'
		const result = localizeUiSource(fs.readFileSync(id, 'utf8'), id, compiler, messages)!
		const compiled = ts.transpileModule(result.code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
		const context: any = { exports: {}, require: () => ({ translate }) }
		vm.runInNewContext(compiled, context)
		expect(context.exports.daysList).toEqual(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'])
		expect(context.exports.monthList[10]).toBe('novembro')
		expect(context.exports.parseDate(new Date(2026, 10, 23))).toBe('2026-11-23')
		expect(context.exports.formatTime('14:30', '24h')).toBe('14:30')
		expect(context.exports.parseDateEventPopupFormat(new Date(2026, 10, 23))).not.toMatch(/Mon|Nov/)
		const calendarId = root + '/experimental/Calendar/Calendar.vue'
		const calendar = localizeUiSource(fs.readFileSync(calendarId, 'utf8'), calendarId, compiler, messages)!.code
		expect(calendar).toContain("timeFormat: '24h'")
		expect(calendar).toContain("value: 'Week'")
		expect(calendar).toContain('__lmsTranslate("Week", [])')
		delete (window as any).lang
	})
	it('compiles all reviewed experimental components and translates complete interpolated empty states', () => {
		const root = path.resolve(import.meta.dirname, '../../node_modules/frappe-ui')
		for (const file of review.files) {
			const id = root + '/' + file.path
			const source = localizeUiSource(fs.readFileSync(id, 'utf8'), id, compiler, messages)?.code || fs.readFileSync(id, 'utf8')
			if (id.endsWith('.vue')) {
				const { descriptor, errors } = sfcCompiler.parse(source, { filename: id })
				expect(errors, file.path).toEqual([])
				if (descriptor.script || descriptor.scriptSetup) expect(() => sfcCompiler.compileScript(descriptor, { id: file.path, fs: { fileExists: fs.existsSync, readFile: filename => fs.readFileSync(filename, 'utf8') } })).not.toThrow()
				if (descriptor.template) expect(sfcCompiler.compileTemplate({ source: descriptor.template.content, filename: id, id: file.path }).errors, file.path).toEqual([])
			}
			if (file.path.endsWith('/IconPicker.vue')) expect(source).toContain('No icons found for "{0}"')
			if (file.path.endsWith('/CalendarAgenda.vue')) expect(source).toContain('Nothing on between {0}.')
		}
	})
	it('names the native combobox trigger in Portuguese without changing its state binding', () => {
		const source = `<template><ComboboxTrigger\n :disabled="disabled" /></template><script setup lang="ts">const disabled = false</script>`
		const result = localizeUiSource(source, '/Combobox/Combobox.vue', compiler, {})!
		expect(result.code).toContain(':aria-label="__lmsTranslate(&quot;Show popup&quot;, [])"')
		expect(result.code).toContain(':disabled="disabled"')
		const { descriptor } = sfcCompiler.parse(result.code)
		expect(() => sfcCompiler.compileScript(descriptor, { id: 'combobox' })).not.toThrow()
	})
	it('localizes the native toast region and close control through Toaster options', () => {
		const source = `<template><Toaster\n    :toast-options="{\n      unstyled: true,\n    }" /></template><script setup lang="ts">import { Toaster } from 'vue-sonner'</script>`
		const result = localizeUiSource(source, '/Toast/ToastProvider.vue', compiler, {})!
		expect(result.code).toContain(':container-aria-label=')
		expect(result.code).toContain("closeButtonAriaLabel: __lmsTranslate('Close notification', [])")
		expect(result.code).toContain('unstyled: true')
		const parsed = sfcCompiler.parse(result.code)
		expect(parsed.errors).toEqual([])
		expect(() => sfcCompiler.compileScript(parsed.descriptor, { id: 'toast' })).not.toThrow()
		expect(sfcCompiler.compileTemplate({ source: parsed.descriptor.template!.content, filename: 'ToastProvider.vue', id: 'toast' }).errors).toEqual([])
	})
	it('translates the whole keyboard hint and its alternative separator', () => {
		const source = `<template><span>{{ ariaLabel }}</span></template><script setup lang="ts">const sequences = ['Command + K']; const ariaLabel = () => { return 'Shortcut ' + sequences.join(', or ') }</script>`
		const result = localizeUiSource(source, '/KeyboardShortcut/KeyboardShortcut.vue', compiler, {})!
		expect(result.code).toContain("__lmsTranslate('Shortcut {0}', [sequences.join(__lmsTranslate(', or', []) + ' ')])")
		const { descriptor } = sfcCompiler.parse(result.code)
		expect(() => sfcCompiler.compileScript(descriptor, { id: 'keyboard' })).not.toThrow()
	})
	it('leaves Vue virtual modules unchanged after the source transform', () => {
		const source = `<script setup lang="ts">const options = [{label: 'Today'}]</script><template><p>Today</p></template>`
		const translated = localizeUiSource(source, 'CalendarPanel.vue', compiler, { Today: 'Hoje' })!
		const { descriptor } = sfcCompiler.parse(translated.code)
		const compiled = sfcCompiler.compileScript(descriptor, { id: 'calendar' }).content
		expect(localizeUiSource(compiled, 'CalendarPanel.vue?vue&type=script&setup=true&lang.ts', compiler, { Today: 'Hoje' })).toBeNull()
		expect(compiled.match(/translate as __lmsTranslate/g)).toHaveLength(1)
	})
	it('translates labels and defaults while keeping API values and user bindings', () => {
		const source = `<template><button aria-label="Clear">Today</button><span>{{ user.title }}</span></template>
<script setup lang="ts">const options = [{label: 'Today', value: 'Today'}]; const props = withDefaults(defineProps<{placeholder?: string}>(), {placeholder: 'Select date'})</script>`
		const result = localizeUiSource(source, 'DatePicker.vue', compiler, {
			Clear: 'Limpar',
			Today: 'Hoje',
			'Select date': 'Selecione a data',
		})!
		expect(result.code).toContain(`value: 'Today'`)
		expect(result.code).toContain('user.title')
		expect(result.code).toContain('__lmsTranslate("Today", [])')
		expect(result.code).toContain('__lmsTranslate("Select date", [])')
		const parsed = sfcCompiler.parse(result.code)
		expect(parsed.errors).toEqual([])
		expect(() =>
			sfcCompiler.compileScript(parsed.descriptor, { id: 'translation-test' })
		).not.toThrow()
		expect(
			sfcCompiler.compileTemplate({
				source: parsed.descriptor.template!.content,
				filename: 'DatePicker.vue',
				id: 'translation-test',
			}).errors
		).toEqual([])
	})

	it('keeps expressions intact when translating an interpolated upload error', () => {
		const source =
			'export const error = `This file is ${size(file)}; the limit is ${size(max)}.`'
		const result = localizeUiSource(source, 'fileSize.ts', compiler, {
			'This file is {0}; the limit is {1}.':
				'Este arquivo tem {0}; o limite é {1}.',
		})!
		expect(result.code).toContain('[size(file), size(max)]')
		expect(result.code).toContain('This file is {0}; the limit is {1}.')
	})
})
