import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Link from '@/components/Controls/Link.vue'

const { resources } = vi.hoisted(() => ({
	resources: [] as { params?: Record<string, unknown> }[],
}))

vi.mock('frappe-ui', () => ({
	Combobox: {
		name: 'Combobox',
		props: ['options', 'modelValue', 'open', 'align'],
		emits: ['update:open'],
		template: '<div />',
	},
	Button: { template: '<button />' },
	FormControl: { template: '<input />' },
	createResource: () => {
		const resource = {
			data: [],
			params: undefined as Record<string, unknown> | undefined,
			update({ params }: { params: Record<string, unknown> }) {
				resource.params = params
			},
			reload: () => {},
		}
		resources.push(resource)
		return resource
	},
}))

vi.mock('@/stores/settings', () => ({
	useSettings: () => ({ settings: { data: {} } }),
}))

const QUERY = 'lms.lms.api.search_currencies'

// Regression: currency picker 403 for LMS roles (#3023, fixed in #3038).
describe('Link query', () => {
	it('localizes native category metadata while retaining the linked record name', () => {
		const wrapper = mount(Link, { props: { doctype: 'LMS Category', modelValue: 'Business' }, global: { mocks: { __: (s: string) => s } } })
		const control = wrapper.findComponent({ name: 'Combobox' })
		expect(control.props('modelValue')).toBe('Business')
		expect(control.props('options')).toEqual([{ label: 'Negócios', value: 'Business' }])
		wrapper.unmount()
	})
	it('shows a country label in Portuguese while retaining its canonical link value', () => {
		const wrapper = mount(Link, { props: { doctype: 'Country', modelValue: 'Brazil' }, global: { mocks: { __: (s: string) => s } } })
		const control = wrapper.findComponent({ name: 'Combobox' })
		expect(control.props('modelValue')).toBe('Brazil')
		expect(control.props('options')).toEqual([{ label: 'Brasil', value: 'Brazil' }])
		wrapper.unmount()
	})
	it('retains authored country names', () => {
		const wrapper = mount(Link, { props: { doctype: 'Country', modelValue: 'País autoral de teste' }, global: { mocks: { __: (s: string) => s } } })
		expect(wrapper.findComponent({ name: 'Combobox' }).props('options')).toEqual([{ label: 'País autoral de teste', value: 'País autoral de teste' }])
		wrapper.unmount()
	})
	it('sends the query with both the search and the title lookup', async () => {
		resources.length = 0
		const wrapper = mount(Link, {
			props: { doctype: 'Currency', query: QUERY, modelValue: 'EUR' },
			global: { mocks: { __: (s: string) => s } },
		})
		await wrapper
			.findComponent({ name: 'Combobox' })
			.vm.$emit('update:open', true)

		expect(resources).toHaveLength(2)
		for (const resource of resources) {
			expect(resource.params?.query).toBe(QUERY)
		}
	})
})
