import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { getConfig, setConfig } from 'frappe-ui'
import ProfileEvaluationSchedule from '@/pages/ProfileEvaluationSchedule.vue'
import { testTranslate } from './setup'

const state = vi.hoisted(() => ({
	epoch: 0,
	resource: null as any,
	requests: [] as any[],
}))
vi.mock('frappe-ui', async (original) => {
	const native = await original<any>()
	return {
		...native,
		createListResource: (options: any) => {
			state.resource = native.createListResource({
				...options,
				cache: [...options.cache, state.epoch],
			})
			return state.resource
		},
	}
})
vi.mock('frappe-ui/experimental', () => ({
	Calendar: {
		name: 'Calendar',
		props: ['events'],
		template: '<div data-testid="calendar" />',
	},
}))
vi.mock('@/components/Modals/Event.vue', () => ({
	default: { template: '<div />' },
}))
const previousFetcher = getConfig('resourceFetcher')
let wrapper: ReturnType<typeof mount>
const open = async () => {
	wrapper = mount(ProfileEvaluationSchedule, {
		props: { profile: { data: { name: 'evaluator@example.test' } } },
		global: {
			provide: { $user: { data: { name: 'evaluator@example.test' } } },
			mocks: { __: testTranslate },
		},
	})
	await flushPromises()
	expect(state.requests).toHaveLength(1)
	expect(state.requests[0].options.params.doctype).toBe(
		'LMS Certificate Request'
	)
	return state.resource
}
const loading = () => wrapper.find('[data-testid="schedule-loading"]')
const row = {
	name: 'request',
	member_name: 'Synthetic learner',
	date: '2026-11-24',
	start_time: '09:00:00',
	end_time: '09:30:00',
}
beforeEach(() => {
	state.epoch++
	state.requests = []
	setConfig(
		'resourceFetcher',
		(options: any) =>
			new Promise((resolve, reject) =>
				state.requests.push({ options, resolve, reject })
			)
	)
})
afterEach(async () => {
	for (const request of state.requests) request.resolve([])
	await flushPromises()
	wrapper?.unmount()
	setConfig('resourceFetcher', previousFetcher)
})

it('shows accessible pending feedback until the real list resource receives rows', async () => {
	const resource = await open()
	expect(resource.list.loading).toBe(true)
	expect(resource.list.fetched).toBe(false)
	expect(loading().attributes('role')).toBe('status')
	expect(loading().text()).toContain('Loading…')
	state.requests[0].resolve([row])
	await flushPromises()
	expect(loading().exists()).toBe(false)
	expect(wrapper.find('[data-testid="calendar"]').exists()).toBe(true)
})

it('shows empty only after the pending native response completes with no rows', async () => {
	await open()
	expect(loading().exists()).toBe(true)
	expect(wrapper.find('[data-testid="empty-schedule"]').exists()).toBe(false)
	state.requests[0].resolve([])
	await flushPromises()
	expect(loading().exists()).toBe(false)
	expect(wrapper.find('[data-testid="empty-schedule"]').exists()).toBe(true)
})

it('handles pending reload without rows, error and explicit native recovery', async () => {
	const resource = await open()
	state.requests[0].resolve([])
	await flushPromises()
	const rejected = resource.reload().catch(() => undefined)
	await nextTick()
	expect(loading().exists()).toBe(true)
	state.requests[1].reject(new Error('Synthetic unavailable response'))
	await rejected
	await flushPromises()
	expect(loading().exists()).toBe(false)
	const error = wrapper.get('[data-testid="schedule-error"]')
	await error.get('button').trigger('click')
	expect(state.requests).toHaveLength(3)
	expect(loading().exists()).toBe(true)
	state.requests[2].resolve([row])
	await flushPromises()
	expect(wrapper.find('[data-testid="schedule-error"]').exists()).toBe(false)
	expect(wrapper.find('[data-testid="calendar"]').exists()).toBe(true)
})

it('keeps cached rows visible during pending reload and a genuine error', async () => {
	const resource = await open()
	state.requests[0].resolve([row])
	await flushPromises()
	const rejected = resource.reload().catch(() => undefined)
	await nextTick()
	expect(loading().exists()).toBe(false)
	expect(wrapper.find('[data-testid="calendar"]').exists()).toBe(true)
	state.requests[1].reject(new Error('Synthetic unavailable response'))
	await rejected
	await flushPromises()
	expect(wrapper.find('[data-testid="schedule-error"]').exists()).toBe(false)
	expect(wrapper.find('[data-testid="calendar"]').exists()).toBe(true)
})
