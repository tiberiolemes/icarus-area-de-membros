import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

const state = vi.hoisted(() => ({
	requests: [] as Array<{
		url: string
		signal: AbortSignal
		resolve: (data: any) => void
		reject: (error: Error) => void
	}>,
	counts: [] as Array<{
		actor: string
		resolve: (count: number) => void
		reject: (error: Error) => void
	}>,
	factories: [] as Array<{ url: string; resource: any }>,
}))
vi.mock('frappe-ui', async (importOriginal) => {
	const native = await importOriginal<any>()
	return {
		...native,
		usePageMeta: vi.fn(),
		LoadingIndicator: { template: '<span data-loading />' },
		call: vi.fn(
			(_method: string, options: any) =>
				new Promise((resolve, reject) => {
					state.counts.push({ actor: options.filters.member, resolve, reject })
				})
		),
		createResource: (options: any) => {
			const resource = native.createResource({
				...options,
				resourceFetcher: (request: any) =>
					new Promise((resolve, reject) => {
						// Deliberately resolve even after abort: isolation must not depend on cancellation.
						state.requests.push({
							url: request.url,
							signal: request.signal,
							resolve,
							reject,
						})
					}),
			})
			state.factories.push({ url: options.url, resource })
			return resource
		},
	}
})
vi.mock('@/stores/session', () => ({ sessionStore: () => ({ brand: {} }) }))
vi.mock('@/pages/Home/AdminHome.vue', () => ({
	default: {
		props: ['liveClasses', 'evals'],
		template:
			'<section data-admin>{{ liveClasses.data?.[0]?.title }} {{ evals.data?.[0]?.title }}</section>',
	},
}))
vi.mock('@/pages/Home/StudentHome.vue', () => ({
	default: {
		props: ['myLiveClasses'],
		template:
			'<section data-student>{{ myLiveClasses.data?.[0]?.title }}</section>',
	},
}))
vi.mock('@/pages/Home/Streak.vue', () => ({
	default: { template: '<div />' },
}))
import Home from '@/pages/Home/Home.vue'

let wrapper: ReturnType<typeof mount>
const actor = (name: string, roles: Record<string, boolean> = {}) => ({
	name: name + '@example.test',
	full_name: name,
	...roles,
})
function open(data?: any) {
	const user = reactive({ data })
	wrapper = mount(Home, {
		global: {
			provide: { $user: user, $dayjs: () => ({ format: () => '2026-11-22' }) },
			mocks: {
				__: (message: string) =>
					/\{\d+\}/.test(message)
						? {
								format: (...args: any[]) =>
									message.replace(/\{(\d+)\}/g, (_, index) =>
										String(args[index])
									),
						  }
						: message,
			},
		},
	})
	return user
}
function complete(requests = [...state.requests], title = 'current') {
	for (const request of requests)
		request.resolve(
			request.url.endsWith('get_streak_info')
				? { current_streak: 0 }
				: [{ title }]
		)
}
beforeEach(() => {
	state.requests = []
	state.counts = []
	state.factories = []
})
afterEach(async () => {
	wrapper?.unmount()
	await flushPromises()
})

describe('Home with the real native resource factory', () => {
	it('waits for a cold actor, loads three admin reads once, and stays stable after data and loading complete', async () => {
		const user = open()
		expect(wrapper.find('[data-loading]').exists()).toBe(true)
		expect(wrapper.find('[data-student]').exists()).toBe(false)
		expect(state.requests).toHaveLength(0)
		user.data = actor('creator', { is_instructor: true })
		await flushPromises()
		expect(state.requests).toHaveLength(3)
		const factories = state.factories.length
		complete()
		await flushPromises()
		expect(state.requests).toHaveLength(3)
		expect(state.factories).toHaveLength(factories)
		expect(wrapper.get('[data-admin]').text()).toContain('current')
		expect(wrapper.find('[data-loading]').exists()).toBe(false)
		expect(state.counts).toHaveLength(0)
		user.data = { ...user.data, full_name: 'Same identity, updated name' }
		await flushPromises()
		expect(state.requests).toHaveLength(3)
		expect(state.factories).toHaveLength(factories)
	})
	it('loads learner data and then creates a distinct evaluator view without showing old data', async () => {
		const user = open(actor('learner'))
		expect(state.requests).toHaveLength(2)
		expect(state.counts).toHaveLength(1)
		complete()
		state.counts[0].resolve(0)
		await flushPromises()
		expect(wrapper.get('[data-student]').text()).toContain('current')
		const old = [...state.requests]
		user.data = actor('evaluator', { is_evaluator: true })
		await flushPromises()
		expect(state.requests).toHaveLength(5)
		expect(old.every((request) => request.signal.aborted)).toBe(true)
		complete(state.requests.slice(2), 'evaluator data')
		await flushPromises()
		expect(wrapper.get('[data-admin]').text()).toContain('evaluator data')
		expect(wrapper.find('[data-student]').exists()).toBe(false)
	})
	it('keeps A→B→A resources distinct and ignores late data even when the actor name matches again', async () => {
		const user = open(actor('a', { is_instructor: true }))
		const old = [...state.requests]
		user.data = actor('b', { is_instructor: true })
		await flushPromises()
		user.data = actor('a', { is_instructor: true })
		await flushPromises()
		expect(state.requests).toHaveLength(9)
		complete(state.requests.slice(6), 'new A')
		await flushPromises()
		complete(old, 'late A')
		await flushPromises()
		expect(wrapper.get('[data-admin]').text()).toContain('new A')
		expect(wrapper.text()).not.toContain('late A')
		expect(state.requests).toHaveLength(9)
	})
	it('remounts the child and resources when the same creator becomes an evaluator', async () => {
		const user = open(actor('same', { is_instructor: true }))
		complete()
		await flushPromises()
		const child = wrapper.get('[data-admin]').element
		const old = [...state.requests]
		user.data = actor('same', { is_evaluator: true })
		await flushPromises()
		expect(state.requests).toHaveLength(6)
		complete(state.requests.slice(3), 'evaluator')
		await flushPromises()
		expect(wrapper.get('[data-admin]').element).not.toBe(child)
		expect(old.every((request) => request.signal.aborted)).toBe(true)
		expect(wrapper.get('[data-admin]').text()).toContain('evaluator')
	})
	it('ignores an old learner count after A→B→A and keeps the current count', async () => {
		const user = open(actor('a'))
		user.data = actor('b')
		await flushPromises()
		user.data = actor('a')
		await flushPromises()
		expect(state.requests).toHaveLength(6)
		expect(state.counts).toHaveLength(3)
		complete(state.requests.slice(4))
		state.counts[2].resolve(2)
		await flushPromises()
		state.counts[0].resolve(13)
		state.counts[1].resolve(17)
		await flushPromises()
		expect(wrapper.text()).toContain('2 evaluations')
		expect(wrapper.text()).not.toContain('13')
		expect(wrapper.text()).not.toContain('17')
		expect(state.requests).toHaveLength(6)
	})
	it('preserves the native error without recreating resources or automatically requesting again', async () => {
		open(actor('creator', { is_instructor: true }))
		const initial = [...state.requests]
		initial[0].reject(new Error('synthetic read failure'))
		complete(initial.slice(1))
		await flushPromises()
		expect(state.requests).toHaveLength(3)
		expect(wrapper.get('[role=alert]').text()).toContain('Failed to load data.')
	})
	it('ignores an old counter error, shows the current failure, and never repeats a POST', async () => {
		const user = open(actor('a'))
		user.data = actor('b')
		await flushPromises()
		complete(state.requests.slice(2))
		await flushPromises()
		state.counts[0].reject(new Error('old count failure'))
		await flushPromises()
		expect(wrapper.find('[role=alert]').exists()).toBe(false)
		state.counts[1].reject(new Error('current count failure'))
		await flushPromises()
		expect(wrapper.get('[role=alert]').text()).toContain('Failed to load data.')
		expect(state.requests).toHaveLength(4)
		expect(state.counts).toHaveLength(2)
	})
	it('cancels a pending view on unmount and ignores data and counter responses afterward', async () => {
		open(actor('a'))
		wrapper.unmount()
		expect(state.requests.every((request) => request.signal.aborted)).toBe(true)
		complete()
		state.counts[0].resolve(9)
		await flushPromises()
		expect(state.requests).toHaveLength(2)
		expect(state.counts).toHaveLength(1)
	})
	it('ignores a late error from an old actor and cancels resources on unmount', async () => {
		const user = open(actor('a', { is_instructor: true }))
		const old = [...state.requests]
		user.data = actor('b', { is_instructor: true })
		await flushPromises()
		const current = state.requests.slice(3)
		complete(current, 'B')
		await flushPromises()
		old[0].reject(new Error('late old failure'))
		complete(old.slice(1))
		await flushPromises()
		expect(wrapper.find('[role=alert]').exists()).toBe(false)
		expect(wrapper.get('[data-admin]').text()).toContain('B')
		wrapper.unmount()
		expect(current.every((request) => request.signal.aborted)).toBe(true)
		await flushPromises()
		expect(state.requests).toHaveLength(6)
	})
})
