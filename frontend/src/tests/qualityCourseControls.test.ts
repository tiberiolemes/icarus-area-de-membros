import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { testTranslate } from './setup'

const state = vi.hoisted(() => ({
	calls: [] as { url: string; params: any }[],
	failure: false,
}))
vi.mock('frappe-ui', () => ({
	createResource: ({ url }: any) => ({
		data: null,
		params: {},
		submit: async (params: any) => {
			state.calls.push({ url, params })
			if (state.failure) throw new Error('Falha de teste')
			if (url.endsWith('get_course_deletion_impact'))
				return { counts: { 'LMS Enrollment': 2 } }
			if (url.endsWith('prepare_course_purge'))
				return {
					token: 'synthetic-token',
					expires_in: 60,
					impact: { counts: { 'LMS Enrollment': 7 } },
				}
			return { course: params.course, is_archived: 0, published: 0 }
		},
	}),
	toast: { success: vi.fn(), error: vi.fn() },
	Button: {
		props: ['disabled', 'loading'],
		emits: ['click'],
		template:
			'<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
	},
	ErrorMessage: {
		props: ['message'],
		template: '<p role="alert">{{ message }}</p>',
	},
	FormControl: {
		props: ['modelValue', 'label', 'type', 'options', 'disabled'],
		emits: ['update:modelValue'],
		template:
			'<label>{{ label }}<select v-if="type === \'select\'" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :value="option.value">{{ option.label }}</option></select><input v-else :value="modelValue" :type="type || \'text\'" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>',
	},
	Dialog: {
		props: ['open', 'title', 'message', 'actions'],
		emits: ['update:open'],
		template:
			'<section v-if="open"><h2>{{ title }}</h2><p>{{ message }}</p><slot /><slot name="actions"/><button v-for="action in actions" @click="action.onClick({ close: () => $emit(\'update:open\', false) })">{{ action.label }}</button></section>',
	},
}))
vi.mock('@/components/LoadError.vue', () => ({
	default: { template: '<p>Falha de leitura</p>' },
}))
vi.mock('@/components/SkeletonLoader.vue', () => ({
	default: { template: '<p>Carregando</p>' },
}))
import CourseDangerZone from '@/components/Courses/CourseDangerZone.vue'
import OutlineMoveDialog from '@/components/OutlineMoveDialog.vue'

enableAutoUnmount(afterEach)
beforeEach(() => {
	state.calls = []
	state.failure = false
})
const global = { mocks: { __: testTranslate } }
const button = (wrapper: any, text: string) =>
	wrapper.findAll('button').find((item: any) => item.text() === text)!
describe('course lifecycle controls', () => {
	it('cancels archive with no API and restores with an explicit unpublished message', async () => {
		const wrapper = mount(CourseDangerZone, {
			props: { course: 'course-one', archived: false },
			global,
		})
		await button(wrapper, 'Arquivar curso').trigger('click')
		await button(wrapper, 'Cancelar').trigger('click')
		expect(state.calls).toHaveLength(0)
		await wrapper.setProps({ archived: true })
		await button(wrapper, 'Restaurar curso').trigger('click')
		expect(wrapper.text()).toContain('sem republicar')
		await button(wrapper, 'Restaurar').trigger('click')
		await flushPromises()
		expect(state.calls[0].url).toContain('restore_course')
		expect(wrapper.emitted('changed')).toHaveLength(1)
	})
	it('requires authorization and exact course confirmation, and shows the new impact before purge', async () => {
		const wrapper = mount(CourseDangerZone, {
			props: { course: 'course-one', archived: true },
			global,
		})
		await button(wrapper, 'Solicitar exclusão permanente').trigger('click')
		await flushPromises()
		expect(wrapper.get('dd').text()).toBe('2')
		const inputs = wrapper.findAll('input')
		await inputs[0].setValue('synthetic-manager')
		await inputs[1].setValue('synthetic-password')
		await button(wrapper, 'Verificar autorização e atualizar impacto').trigger(
			'click'
		)
		await flushPromises()
		expect(wrapper.get('dd').text()).toBe('7')
		expect(
			state.calls.filter((call) => call.url.endsWith('purge_course'))
		).toHaveLength(0)
		await wrapper.get('input').setValue('wrong-course')
		expect(
			button(wrapper, 'Excluir permanentemente').attributes('disabled')
		).toBeDefined()
		await wrapper.get('input').setValue('course-one')
		await button(wrapper, 'Excluir permanentemente').trigger('click')
		await flushPromises()
		expect(state.calls.at(-1)).toMatchObject({
			url: 'lms.lms.api.purge_course',
			params: {
				course: 'course-one',
				confirmation: 'course-one',
				token: 'synthetic-token',
			},
		})
		expect(wrapper.emitted('purged')).toHaveLength(1)
	})
	it('retains the course when the server refuses archive', async () => {
		const wrapper = mount(CourseDangerZone, {
			props: { course: 'course-one', archived: false },
			global,
		})
		state.failure = true
		await button(wrapper, 'Arquivar curso').trigger('click')
		await button(wrapper, 'Arquivar').trigger('click')
		await flushPromises()
		expect(wrapper.emitted('changed')).toBeUndefined()
		expect(
			wrapper.findAll('[role=alert]').some((item) => item.text().length > 0)
		).toBe(true)
	})
})

describe('keyboard alternative to dragging', () => {
	const chapters = [
		{
			name: 'first',
			title: 'Primeiro',
			lessons: [{ name: 'lesson', title: 'Aula', number: '1-1' }],
		},
		{ name: 'second', title: 'Segundo', lessons: [] },
	]
	it('moves a lesson to another chapter with a zero-based persisted position', async () => {
		const wrapper = mount(OutlineMoveDialog, {
			props: { course: 'course-one', chapters: chapters as any },
			global,
		})
		await wrapper.setProps({ open: true })
		await flushPromises()
		const selects = wrapper.findAll('select')
		await selects[2].setValue('second')
		await button(wrapper, 'Mover').trigger('click')
		await flushPromises()
		expect(state.calls.at(-1)).toMatchObject({
			url: 'lms.lms.api.update_lesson_index',
			params: {
				lesson: 'lesson',
				sourceChapter: 'first',
				targetChapter: 'second',
				idx: 0,
			},
		})
		expect(wrapper.emitted('changed')).toHaveLength(1)
	})
	it('moves a chapter and leaves the dialog open on a server failure', async () => {
		const wrapper = mount(OutlineMoveDialog, {
			props: { course: 'course-one', chapters: chapters as any },
			global,
		})
		await wrapper.setProps({ open: true })
		await wrapper.findAll('select')[0].setValue('chapter')
		await flushPromises()
		await wrapper.findAll('select').at(-1)!.setValue('1')
		state.failure = true
		await button(wrapper, 'Mover').trigger('click')
		await flushPromises()
		expect(state.calls.at(-1)).toMatchObject({
			url: 'lms.lms.api.update_chapter_index',
			params: { chapter: 'first', course: 'course-one', idx: 1 },
		})
		expect(wrapper.emitted('changed')).toBeUndefined()
		expect(
			wrapper.findAll('[role=alert]').some((item) => item.text().length > 0)
		).toBe(true)
	})
})
