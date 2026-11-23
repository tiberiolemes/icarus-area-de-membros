import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { testTranslate } from './setup'
import dayjs from '@/utils/dayjs'

vi.mock('frappe-ui', () => {
	const Dialog = Object.assign(
		{
			name: 'Dialog',
			props: ['open', 'title', 'message', 'actions'],
			emits: ['update:open'],
			template:
				'<section v-if="open"><h2>{{ title }}</h2><p>{{ message }}</p><slot/><slot name="actions"/><button v-for="action in actions" @click="action.onClick({ close: () => $emit(\'update:open\', false) })">{{ action.label }}</button></section>',
		},
		{
			Title: { template: '<h2><slot/></h2>' },
			Description: { template: '<p><slot/></p>' },
		}
	)
	return {
		Dialog,
		Button: {
			props: ['label'],
			template: '<button @click="$emit(\'click\')">{{ label }}<slot/></button>',
		},
		FormControl: {
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template:
				'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		},
		Rating: {
			name: 'Rating',
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template: '<div>{{ modelValue }}</div>',
		},
		Tooltip: { template: '<div><slot/></div>' },
		Tabs: {
			template:
				'<div><slot name="tab-panel" :tab="{ value: \'evaluation\' }"/></div>',
		},
		createResource: (options: any) => ({
			loading: false,
			reload: async () => {
				options.onSuccess?.({})
				return {}
			},
			submit: vi.fn().mockResolvedValue({}),
		}),
		toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
	}
})
vi.mock('@/utils', () => ({ formatTime: (value: string) => value }))
vi.mock('@/components/Controls/Link.vue', () => ({
	default: { template: '<div/>' },
}))
vi.mock('@/components/Controls/BooleanSwitch.vue', () => ({
	default: { template: '<div/>' },
}))
import Event from '@/components/Modals/Event.vue'

describe('evaluation dialog draft', () => {
	it('keeps edits after an accidental close request and offers an explicit discard', async () => {
		const wrapper = mount(Event, {
			props: {
				modelValue: false,
				event: {
					title: 'Avaliação de teste',
					evaluator: 'teacher',
					member: 'student',
					course: 'course',
					date: '2026-11-21',
					start_time: '10:00',
					end_time: '11:00',
				},
			},
			global: {
				mocks: { __: testTranslate },
				provide: { $user: { data: { name: 'teacher' } }, $dayjs: dayjs },
			},
		})
		await wrapper.setProps({ modelValue: true })
		await flushPromises()
		wrapper.findComponent({ name: 'Rating' }).vm.$emit('update:modelValue', 5)
		await flushPromises()
		wrapper
			.findAllComponents({ name: 'Dialog' })[0]
			.vm.$emit('update:open', false)
		await flushPromises()
		expect(wrapper.text()).toContain('Descartar alterações?')
		expect(wrapper.findComponent({ name: 'Rating' }).props('modelValue')).toBe(
			5
		)
		await wrapper
			.findAll('button')
			.find((button) => button.text() === 'Continuar editando')!
			.trigger('click')
		expect(wrapper.emitted('update:modelValue')).toBeUndefined()
		wrapper
			.findAllComponents({ name: 'Dialog' })[0]
			.vm.$emit('update:open', false)
		await flushPromises()
		await wrapper
			.findAll('button')
			.find((button) => button.text() === 'Descartar alterações')!
			.trigger('click')
		expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
	})
})
