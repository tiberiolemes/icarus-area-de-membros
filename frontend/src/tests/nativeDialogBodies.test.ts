import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { DateRangePicker, FormControl } from 'frappe-ui'
import PeriodFilter from '@/components/PeriodFilter.vue'
import OutlineMoveDialog from '@/components/OutlineMoveDialog.vue'
import CourseDangerZone from '@/components/Courses/CourseDangerZone.vue'
import { testTranslate } from './setup'
import messages from '../../../local/i18n/merged-pt-BR.json'
import capturedImpact from './fixtures/courseImpactCounts.json'

const state = vi.hoisted(() => ({
	calls: [] as any[],
	fail: '',
	counts: { 'LMS Enrollment': 2 } as Record<string, number>,
	prepare: null as null | (() => Promise<any>),
	resources: [] as any[],
}))
vi.mock('frappe-ui', async (original) => ({
	...(await original<any>()),
	createResource: ({ url }: any) => {
		const resource = {
			data: null,
			params: {},
			submit: async (params: any) => {
				resource.params = params
				state.calls.push({ url, params })
				if (url.endsWith(state.fail) && state.fail)
					throw { messages: ['Falha sintética de arquivamento'] }
				if (url.endsWith('prepare_course_purge') && state.prepare) {
					const result = await state.prepare()
					resource.data = result
					return result
				}
				return url.endsWith('get_course_deletion_impact')
					? { counts: state.counts }
					: { course: 'own-course', is_archived: 0, published: 0 }
			},
		}
		state.resources.push({ url, resource })
		return resource
	},
	toast: { success: vi.fn(), error: vi.fn() },
}))

let wrapper: ReturnType<typeof mount>
const global = { mocks: { __: testTranslate } }
const dialog = () => new DOMWrapper(document.querySelector('[role="dialog"]')!)
const button = (root: any, name: string) =>
	root.findAll('button').find((node: any) => node.text() === name)!
const settle = async () => {
	await flushPromises()
	await vi.waitFor(() =>
		expect(document.querySelector('[role="dialog"]')).not.toBeNull()
	)
}
beforeEach(() => {
	vi.stubGlobal('__', testTranslate)
	state.calls = []
	state.fail = ''
	state.counts = { 'LMS Enrollment': 2 }
	state.prepare = null
	state.resources = []
})
afterEach(async () => {
	wrapper?.unmount()
	await flushPromises()
	document.body.innerHTML = ''
})

it('renders native period controls, validates, cancels and applies the selected range', async () => {
	wrapper = mount(PeriodFilter, {
		attachTo: document.body,
		props: { modelValue: { from_date: '2026-02-01', to_date: '2026-02-02' } },
		global,
	})
	await wrapper.get('button').trigger('click')
	await settle()
	expect(wrapper.findComponent(DateRangePicker).exists()).toBe(true)
	expect(dialog().find('input').exists()).toBe(true)
	expect(wrapper.findComponent(FormControl).props('label')).toBe('Período')
	wrapper
		.getComponent(DateRangePicker)
		.vm.$emit('update:modelValue', ['2026-03-02', '2026-03-01'])
	await flushPromises()
	expect(dialog().text()).toContain(
		'A data inicial deve vir antes da data final.'
	)
	expect(
		button(dialog(), 'Aplicar período').attributes('disabled')
	).toBeDefined()
	await button(dialog(), 'Cancelar').trigger('click')
	await flushPromises()
	await wrapper.get('button').trigger('click')
	await settle()
	expect(wrapper.getComponent(DateRangePicker).props('modelValue')).toEqual([
		'2026-02-01',
		'2026-02-02',
	])
	wrapper
		.getComponent(DateRangePicker)
		.vm.$emit('update:modelValue', ['2026-03-01', '2026-03-02'])
	await flushPromises()
	await button(dialog(), 'Aplicar período').trigger('click')
	expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
		{ from_date: '2026-03-01', to_date: '2026-03-02' },
	])
})

it('renders native move controls and submits only the selected lesson order', async () => {
	wrapper = mount(OutlineMoveDialog, {
		attachTo: document.body,
		props: {
			open: false,
			course: 'own-course',
			chapters: [
				{
					name: 'chapter',
					title: 'Own chapter',
					idx: 1,
					lessons: [
						{ name: 'first', title: 'First', number: '1' },
						{ name: 'second', title: 'Second', number: '2' },
					],
				},
			],
		},
		global,
	})
	await wrapper.setProps({ open: true })
	await settle()
	const controls = wrapper.findAllComponents(FormControl)
	expect(controls.map((c) => c.props('label'))).toEqual([
		'O que deseja mover?',
		'Aula',
		'Capítulo de destino',
		'Nova posição',
	])
	expect(dialog().findAll('[role="combobox"]')).toHaveLength(4)
	controls[2].vm.$emit('update:modelValue', 'chapter')
	await flushPromises()
	controls[3].vm.$emit('update:modelValue', '1')
	await flushPromises()
	await button(dialog(), 'Mover').trigger('click')
	await flushPromises()
	expect(state.calls).toEqual([
		{
			url: 'lms.lms.api.update_lesson_index',
			params: {
				lesson: 'first',
				sourceChapter: 'chapter',
				targetChapter: 'chapter',
				idx: 1,
			},
		},
	])
	expect(wrapper.emitted('changed')).toHaveLength(1)
})

it('keeps archive failure feedback inside the actual native dialog and cancels without another write', async () => {
	state.fail = 'archive_course'
	wrapper = mount(CourseDangerZone, {
		attachTo: document.body,
		props: { course: 'own-course', archived: false },
		global,
	})
	await button(wrapper, 'Arquivar curso').trigger('click')
	await settle()
	await button(dialog(), 'Arquivar').trigger('click')
	await flushPromises()
	expect(dialog().text()).toContain('Falha sintética de arquivamento')
	expect(wrapper.emitted('changed')).toBeUndefined()
	await button(dialog(), 'Cancelar').trigger('click')
	await flushPromises()
	expect(state.calls).toHaveLength(1)
})

it('renders purge impact and native reauthentication fields, and clears volatile inputs on cancel', async () => {
	wrapper = mount(CourseDangerZone, {
		attachTo: document.body,
		props: { course: 'own-course', archived: true },
		global,
	})
	await button(wrapper, 'Solicitar exclusão permanente').trigger('click')
	await settle()
	expect(dialog().find('dd').text()).toBe('2')
	expect(dialog().find('input[type="password"]').exists()).toBe(true)
	expect(
		dialog().get('input[type="text"]').attributes('required')
	).toBeDefined()
	expect(
		dialog().get('input[type="password"]').attributes('required')
	).toBeDefined()
	const passwordInput = dialog().get('input[type="password"]')
	const reveal = dialog().get(
		`button[aria-controls="${passwordInput.attributes('id')}"]`
	)
	await reveal.trigger('click')
	expect(dialog().get('input[autocomplete="off"][type="text"]').exists()).toBe(
		true
	)
	await reveal.trigger('click')
	expect(dialog().text()).toContain('Verificar autorização e atualizar impacto')
	await dialog().get('input[type="password"]').setValue('synthetic-unit-value')
	await button(dialog(), 'Cancelar').trigger('click')
	await flushPromises()
	await button(wrapper, 'Solicitar exclusão permanente').trigger('click')
	await settle()
	expect(
		(dialog().get('input[type="password"]').element as HTMLInputElement).value
	).toBe('')
	expect(
		state.calls.every((call) => call.url.endsWith('get_course_deletion_impact'))
	).toBe(true)
})

it('renders each captured native impact operation in Portuguese with its own unchanged count', async () => {
	vi.stubGlobal('__', (key: string) =>
		testTranslate((messages as Record<string, string>)[key] || key)
	)
	state.counts = { ...capturedImpact, 'Discussion Reply': 32 }
	wrapper = mount(CourseDangerZone, {
		attachTo: document.body,
		props: { course: 'own-course', archived: true },
		global: {
			mocks: {
				__: (key: string) =>
					testTranslate((messages as Record<string, string>)[key] || key),
			},
		},
	})
	await button(wrapper, 'Solicitar exclusão permanente').trigger('click')
	await settle()
	const rows = dialog().findAll('dl > div')
	expect(rows).toHaveLength(Object.keys(state.counts).length)
	expect(rows.map((row) => Number(row.get('dd').text()))).toEqual(
		Object.values(state.counts)
	)
	for (const row of rows)
		expect(row.get('dt').text()).not.toMatch(
			/^(Unlink|Clear current|Lesson cleanup|Attachments)\b/
		)
	expect(rows.at(-1)?.get('dt').text()).toBe('Respostas')
	expect(rows.map((row) => row.get('dt').text())).toContain(
		'Desvincular questionários das aulas'
	)
})

it.each(['success', 'failure', 'unmount'])(
	'keeps authorization volatile and disables both password controls during %s',
	async (outcome) => {
		let resolve!: (value: any) => void, reject!: (error: any) => void
		state.prepare = () =>
			new Promise((yes, no) => {
				resolve = yes
				reject = no
			})
		wrapper = mount(CourseDangerZone, {
			attachTo: document.body,
			props: { course: 'own-course', archived: true },
			global,
		})
		await button(wrapper, 'Solicitar exclusão permanente').trigger('click')
		await settle()
		const inputs = dialog().findAll('input')
		await inputs[0].setValue('synthetic-authorizer')
		await inputs[1].setValue('synthetic-unit-only')
		await button(dialog(), 'Verificar autorização e atualizar impacto').trigger(
			'click'
		)
		await flushPromises()
		expect(
			dialog().get('input[type="password"]').attributes('disabled')
		).toBeDefined()
		expect(
			dialog().get('button[aria-controls]').attributes('disabled')
		).toBeDefined()
		const timer = vi.spyOn(globalThis, 'setTimeout')
		if (outcome === 'unmount') wrapper.unmount()
		if (outcome === 'failure')
			reject({ messages: ['Synthetic denied authorization'] })
		else
			resolve({
				token: 'unit-only',
				expires_in: 60,
				impact: { counts: { 'LMS Enrollment': 2 } },
			})
		await flushPromises()
		const prepare = state.resources.find((row) =>
			row.url.endsWith('prepare_course_purge')
		).resource
		expect(prepare.params).toEqual({})
		expect(prepare.data).toBeNull()
		if (outcome === 'failure')
			expect(
				(dialog().get('input[type="password"]').element as HTMLInputElement)
					.value
			).toBe('')
		if (outcome === 'success') {
			expect(dialog().find('input[type="password"]').exists()).toBe(false)
			expect(dialog().get('input').attributes('required')).toBeDefined()
		}
		if (outcome === 'unmount')
			expect(timer.mock.calls.some((args) => args[1] === 60000)).toBe(false)
		timer.mockRestore()
	}
)
