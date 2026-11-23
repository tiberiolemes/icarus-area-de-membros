vi.mock('@/composables/useReportResource', () => ({
	useReportResource: () => state.resources.shift(),
}))
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { reactive } from 'vue'
vi.mock('vue-router', () => ({
	useRoute: () => ({ query: {} }),
	useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/components/PeriodFilter.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('@/components/StatisticsRecords.vue', () => ({
	default: { template: '<div />' },
}))
import Statistics from '@/pages/Statistics.vue'

const state = vi.hoisted(() => ({ resources: [] as any[] }))
vi.mock('frappe-ui', () => ({
	createResource: () => state.resources.shift(),
	usePageMeta: vi.fn(),
	LoadingIndicator: { template: '<div />' },
	Tooltip: { template: '<div><slot /></div>' },
}))
vi.mock('frappe-ui/charts', () => ({
	ChartCard: { template: '<div><slot /></div>' },
	NumberCard: { template: '<div />' },
	LineChart: { template: '<div />' },
	DonutChart: { template: '<div />' },
}))
vi.mock('@/stores/session', () => ({ sessionStore: () => ({ brand: {} }) }))
vi.mock('@/components/Layouts/PageHeader.vue', () => ({
	default: { template: '<header />' },
}))
vi.mock('@/components/LoadError.vue', () => ({
	default: {
		name: 'LoadError',
		props: ['error'],
		emits: ['retry'],
		template:
			'<button data-testid="retry" @click="$emit(\'retry\')">Retry</button>',
	},
}))

enableAutoUnmount(afterEach)
const failure = () =>
	reactive({
		data: null,
		error: { status: 500 },
		loading: false,
		reload: vi.fn(),
		submit: vi.fn().mockResolvedValue(null),
	})
const open = () =>
	mount(Statistics, { global: { mocks: { __: (text: string) => text } } })

describe('statistics read failures', () => {
	it('keeps an initial server failure visible and retries the failed read', async () => {
		const details = failure()
		state.resources = [details, failure(), failure(), failure(), failure()]
		const wrapper = open()
		expect(wrapper.findAll('[data-testid="retry"]')).toHaveLength(1)
		await wrapper.get('[data-testid="retry"]').trigger('click')
		expect(details.reload).toHaveBeenCalledTimes(1)
	})
	it('keeps a failed refresh visible while preserving the last confirmed readings', () => {
		const details = failure()
		details.data = {
			courses: 1,
			users: 2,
			enrollments: 3,
			completions: 1,
			certifications: 0,
			series: {
				users: [{ date: '2026-01-01', count: 2 }],
				enrollments: [],
				certifications: [],
			},
			comparison: {},
		} as any
		state.resources = [details]
		const wrapper = open()
		expect(wrapper.findAll('[data-testid="retry"]')).toHaveLength(1)
		expect(wrapper.text()).toContain('Definições e comparação dos indicadores')
	})
})
