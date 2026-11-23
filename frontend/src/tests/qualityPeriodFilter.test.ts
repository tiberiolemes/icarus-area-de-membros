import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
vi.mock('frappe-ui', () => ({
	Button: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
	Dialog: {
		props: ['open'],
		template: '<section v-if="open"><slot/><slot name="actions"/></section>',
	},
	DateRangePicker: {
		name: 'Range',
		props: ['modelValue'],
		emits: ['update:modelValue'],
		template: '<div />',
	},
	FormControl: { template: '<div />' },
	ErrorMessage: { props: ['message'], template: '<p>{{ message }}</p>' },
}))
import PeriodFilter from '@/components/PeriodFilter.vue'
describe('period draft', () => {
	it('keeps the applied range until Apply and restores it when reopened after Cancel', async () => {
		const wrapper = mount(PeriodFilter, {
			props: { modelValue: { from_date: '2026-02-01', to_date: '2026-02-02' } },
			global: { mocks: { __: (text: string) => text } },
		})
		await wrapper.find('button').trigger('click')
		wrapper
			.findComponent({ name: 'Range' })
			.vm.$emit('update:modelValue', ['2026-03-01', '2026-03-02'])
		await nextTick()
		expect(wrapper.emitted('update:modelValue')).toBeUndefined()
		await wrapper
			.findAll('button')
			.find((b) => b.text() === 'Cancelar')!
			.trigger('click')
		await wrapper.find('button').trigger('click')
		expect(
			wrapper.findComponent({ name: 'Range' }).props('modelValue')
		).toEqual(['2026-02-01', '2026-02-02'])
		wrapper
			.findComponent({ name: 'Range' })
			.vm.$emit('update:modelValue', ['2026-03-01', '2026-03-02'])
		await nextTick()
		await wrapper
			.findAll('button')
			.find((b) => b.text() === 'Aplicar período')!
			.trigger('click')
		expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual({
			from_date: '2026-03-01',
			to_date: '2026-03-02',
		})
	})
})
