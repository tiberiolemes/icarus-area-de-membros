import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import { computed, reactive, ref } from 'vue'
import messages from '../../../local/i18n/merged-pt-BR.json'

// Execute the real pinned component's state functions, without mounting any
// editor, provider, agent, canvas, or network service.
function nativeState(relative: string, names: string[], globals: Record<string, unknown>) {
	const filename = path.resolve(import.meta.dirname, '../../../../frappe', relative)
	const script = parse(fs.readFileSync(filename, 'utf8'), { filename }).descriptor.scriptSetup!.content
	const tree = ts.createSourceFile(filename + '.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const selected = tree.statements.filter(statement => {
		if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(tree)))
		return ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text || '')
	}).map(statement => statement.getText(tree)).join('\n')
	const code = ts.transpileModule(selected + '\nexports.result = {' + names.join(',') + '}', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
	const context: any = { exports: {}, computed, ref, __pt: (message: string) => (messages as any)[message] || message, ...globals }
	vm.runInNewContext(code, context)
	return context.exports.result
}

it('keeps native Studio panel IDs selectable while the presentation is Portuguese', () => {
	const store = reactive({ studioLayout: { showLeftPanel: false, leftPanelActiveTab: 'Add Component' } })
	const state = nativeState('studio/frontend/src/components/StudioLeftPanel.vue', ['sidebarMenu', 'activeTab', 'setActiveTab'], { store })
	expect(state.sidebarMenu.map((entry: any) => entry.label)).toEqual(['Pages', 'Add Component', 'Layers', 'Data', 'Code', 'AI Assistant'])
	for (const panel of state.sidebarMenu) {
		state.setActiveTab(panel.label)
		expect(state.activeTab.value).toBe(panel.label)
		expect(store.studioLayout.leftPanelActiveTab).toBe(panel.label)
		expect(store.studioLayout.showLeftPanel).toBe(true)
	}
	expect((messages as any).Code).toBe('Código')
})

it('preserves the initial free crop selection and its numeric aspect ratios', () => {
	const state = nativeState('ui/src/components/FileUpload/ImageCropper.vue', ['activePreset', 'presets', 'selection', 'setAspect'], {})
	expect(state.activePreset.value).toBe(state.presets[0].label)
	expect(state.presets[0].label).toBe('Free')
	expect(Number.isNaN(state.presets[0].value)).toBe(true)
	expect(state.presets.slice(1).map((preset: any) => preset.value)).toEqual([1, 4 / 3, 16 / 9])
	state.setAspect(state.presets[2].label, state.presets[2].value)
	expect(state.activePreset.value).toBe('4:3')
	expect((messages as any)['Free crop']).toBe('Recorte livre')
})

it('uses the native relative-time message contract for every Portuguese time unit', async () => {
 const { formatTimeAgo } = await import('@vueuse/core')
 const state = nativeState('studio/frontend/src/pages/Home.vue', ['relativeTimeFormatter', 'timeAgoMessages'], {})
 const now = new Date('2026-11-21T12:00:00Z')
 const format = (offset: number) => formatTimeAgo(new Date(+now + offset), { messages: state.timeAgoMessages }, now)
 expect(format(-19 * 60_000)).toBe('há 19 minutos')
 expect(format(19 * 60_000)).toBe('em 19 minutos')
 expect(format(-24 * 3600_000)).toBe('ontem')
 expect(format(24 * 3600_000)).toBe('amanhã')
 expect(format(-10_000)).toBe('agora')
 const future = ['em 2 segundos','em 2 minutos','em 2 horas','depois de amanhã','em 2 semanas','em 2 meses','em 2 anos']
 for (const [index, unit] of ['second','minute','hour','day','week','month','year'].entries()) {
  expect(state.timeAgoMessages[unit](2, true)).not.toMatch(/ago|in |seconds|minutes|hours|days|weeks|months|years/)
  expect(state.timeAgoMessages[unit](2, false)).toBe(future[index])
 }
})

it('localizes native Studio select labels without changing their submitted values', async () => {
 const { baseParse } = await import('@vue/compiler-dom')
 function options(relative: string, contains: string) {
  const file = path.resolve(import.meta.dirname, '../../../../frappe/studio/frontend/src/components', relative)
  const template = parse(fs.readFileSync(file, 'utf8')).descriptor.template!.content
  const found: string[] = []
  function visit(node: any) {
   for (const prop of node.props || []) if (prop.type === 7 && prop.arg?.content === 'options' && prop.exp?.content.includes(contains)) found.push(prop.exp.content)
   for (const child of node.children || []) visit(child)
  }
  visit(baseParse(template))
  expect(found).toHaveLength(1)
  return vm.runInNewContext(found[0], { __pt: (text: string) => (messages as any)[text] || text })
 }
 const variable = options('DataPanel.vue', "'String'")
 expect(variable.map((row: any) => row.value)).toEqual(['String','Number','Boolean','Object'])
 expect(variable.map((row: any) => row.label)).toEqual(['Texto','Número','Lógico','Objeto'])
 const resource = options('ResourceDialog.vue', "'Document List'")
 expect(resource.map((row: any) => row.value)).toEqual(['Document List','Document','API Resource'])
 expect(resource.map((row: any) => row.label)).toEqual(['Lista de documentos','Documento','Recurso de API'])
 const sort = options('ResourceDialog.vue', "'ASC'")
 expect(sort.map((row: any) => row.value)).toEqual(['','ASC','DESC'])
 expect(sort.map((row: any) => row.label)).toEqual(['','Crescente','Decrescente'])
})

it('accepts Portuguese and original range separators in both pinned native UI installations', () => {
 for (const prefix of ['studio/frontend/node_modules/frappe-ui','flow/node_modules/frappe-ui']) {
  const state = nativeState(prefix + '/src/components/DatePicker/DateRangePicker.vue', ['parseRangeInput'], { coerceToDayjs: (value: string) => value || null })
  for (const separator of [' a ', ' to ', ' - ']) expect(state.parseRangeInput('27/10/2026' + separator + '29/10/2026')).toEqual(['27/10/2026','29/10/2026'])
  expect(state.parseRangeInput('')).toEqual([null,null])
 }
})
