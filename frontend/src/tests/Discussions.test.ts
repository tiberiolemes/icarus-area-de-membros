import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import Discussions from '@/components/Discussions.vue'
String.prototype.format = function (...args: unknown[]) {
	return this.replace(/\{(\d+)\}/g, (_: string, i: number) => String(args[i]))
}
const api = vi.hoisted(() => ({
	requests: [] as any[],
	route: { query: {} } as any,
}))
vi.mock('frappe-ui', async (original) => {
	const native = await original<any>()
	return {
		...native,
		createResource: (options: any) =>
			native.createResource({
				...options,
				resourceFetcher: (request: any) =>
					new Promise((resolve, reject) =>
						api.requests.push({ ...request, resolve, reject })
					),
			}),
	}
})
vi.mock('vue-router', () => ({ useRoute: () => api.route }))
vi.mock('@/components/DiscussionReplies.vue', () => ({
	default: {
		name: 'DiscussionReplies',
		props: ['topic'],
		template:
			'<section data-testid="thread">{{ topic.title || topic.name }}<button @click="$emit(\'update:showTopics\', true)">Back</button></section>',
	},
}))
vi.mock('@/components/Modals/DiscussionModal.vue', () => ({
	default: { name: 'DiscussionModal', template: '<div />' },
}))
vi.mock('@/components/UserAvatar.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('@/utils/scrollContainer', () => ({
	getScrollContainer: () => ({ scrollTop: 0, scrollHeight: 0 }),
}))
enableAutoUnmount(afterEach)
let user: any, socket: any
beforeEach(() => {
	api.requests = []
	api.route = reactive({ query: {} })
	user = reactive({ data: { name: 'a@example.test', sitename: 'qa' } })
	socket = { on: vi.fn(), off: vi.fn() }
	window.history.replaceState({}, '', '/')
	window.matchMedia = (() => ({ matches: false })) as any
})
const row = (name: string) => ({
	name,
	title: name,
	user: { full_name: 'Synthetic' },
	creation: '2026-01-01',
	reply_count: 0,
})
const data = (page = 1, total = 100, selected: string | null = null) => ({
	topics: Array.from(
		{ length: Math.min(20, total - (page - 1) * 20) },
		(_, i) => row('T' + ((page - 1) * 20 + i + 1))
	),
	total,
	page,
	page_size: 20,
	start: total ? (page - 1) * 20 + 1 : 0,
	end: Math.min(page * 20, total),
	selected_topic: selected ? row(selected) : null,
	selected_unavailable: false,
})
const open = (props = {}) =>
	mount(Discussions, {
		attachTo: document.body,
		props: {
			title: 'Questions',
			doctype: 'Course Lesson',
			docname: 'L1',
			...props,
		},
		global: {
			mocks: { __: (s: string) => s },
			provide: { $user: user, $socket: socket },
		},
	})
const finish = async (index = 0, value = data()) => {
	api.requests[index].resolve(value)
	await flushPromises()
}
it('uses the real resource for bounded AJAX pages, stable selection, keyboard controls and reply counts', async () => {
	const w = open()
	await flushPromises()
	expect(w.get('[role="status"]').text()).toContain('Loading')
	await finish()
	expect(w.findAll('[data-testid="topic-row"]')).toHaveLength(20)
	await w.findAll('[data-testid="topic-row"]')[2].trigger('click')
	expect(w.get('[data-testid="thread"]').text()).toContain('T3')
	const next = w.get('[aria-label="Next topics page"]')
	;(next.element as HTMLElement).focus()
	await next.trigger('click')
	await flushPromises()
	expect(api.requests[1].params).toMatchObject({ page: 2, discussion: 'T3' })
	expect(next.attributes('disabled')).toBeDefined()
	await finish(1, data(2, 100, 'T3'))
	expect(w.findAll('[data-testid="topic-row"]')[0].text()).toContain('T21')
	expect(w.get('[data-testid="thread"]').text()).toContain('T3')
	expect(document.activeElement).toBe(
		w.findAll('[data-testid="topic-row"]')[0].element
	)
	w.getComponent({ name: 'DiscussionReplies' }).vm.$emit('reply-count', 'T3', 4)
	await flushPromises()
	expect((w.vm as any).currentTopic.reply_count).toBe(4)
	expect(new URL(location.href).searchParams.get('topics_page')).toBe('2')
})
it('reads an authorized off-page deep link and opens a newly created topic from a later page', async () => {
	window.history.replaceState(
		{},
		'',
		'/?topics_page=4&discussion=off-page&discussion_page=2'
	)
	const w = open()
	await flushPromises()
	expect(api.requests[0].params).toMatchObject({
		page: 4,
		discussion: 'off-page',
	})
	await finish(0, data(4, 100, 'off-page'))
	expect(w.get('[data-testid="thread"]').text()).toContain('off-page')
	w.getComponent({ name: 'DiscussionModal' }).vm.$emit('created', 'new-topic')
	await flushPromises()
	expect(api.requests[1].params).toMatchObject({
		page: 1,
		discussion: 'new-topic',
	})
	await finish(1, data(1, 101, 'new-topic'))
	expect(w.get('[data-testid="thread"]').text()).toContain('new-topic')
	expect(location.search).not.toContain('discussion_page')
})
it('rejects late page, context and actor snapshots even when native abort cannot stop their responses', async () => {
	const w = open()
	await flushPromises()
	await finish()
	await w.get('[aria-label="Next topics page"]').trigger('click')
	await flushPromises()
	user.data = { name: 'b@example.test', sitename: 'qa' }
	await flushPromises()
	expect(w.findAll('[data-testid="topic-row"]')).toHaveLength(0)
	await finish(1, data(2, 100, 'private-A'))
	expect(w.find('[data-testid="thread"]').exists()).toBe(false)
	await finish(2, data(1, 1))
	expect(w.text()).not.toContain('private-A')
	await w.setProps({ docname: 'L2' })
	await flushPromises()
	w.unmount()
	await finish(3, data(1, 1, 'late'))
	expect(document.activeElement?.getAttribute('data-testid')).not.toBe(
		'topic-row'
	)
})
it('keeps a confirmed creation selected after read failure, retries only the read, clamps after moderation and reports unavailable selection', async () => {
	const w = open()
	await flushPromises()
	await finish()
	w.getComponent({ name: 'DiscussionModal' }).vm.$emit('created', 'new')
	await flushPromises()
	api.requests[1].reject({ status: 502 })
	await flushPromises()
	expect(w.find('[role="alert"]').exists()).toBe(true)
	const read = (w.vm as any).reload()
	await flushPromises()
	expect(api.requests).toHaveLength(3)
	await finish(2, data(1, 101, 'new'))
	await read
	expect(w.get('[data-testid="thread"]').text()).toContain('new')
	socket.on.mock.calls[0][1]()
	await flushPromises()
	await finish(3, { ...data(1, 0), selected_unavailable: true })
	expect(w.find('[data-testid="thread"]').exists()).toBe(false)
})
it('handles empty, last page, denied selection and the unchanged single-thread envelope', async () => {
	const w = open()
	await flushPromises()
	await finish(0, { ...data(1, 0), selected_unavailable: true })
	expect(w.text()).toContain('no longer available')
	expect(w.find('nav').exists()).toBe(false)
	await w.setProps({ doctype: 'LMS Batch', singleThread: true })
	await flushPromises()
	await finish(1, { name: 'batch-thread' } as any)
	expect(w.get('[data-testid="thread"]').text()).toContain('batch-thread')
	expect(w.find('nav').exists()).toBe(false)
})
it('auto-selects after cold desktop data and keeps phone list until explicit selection', async () => {
	window.matchMedia = (() => ({ matches: true })) as any
	const w = open()
	await flushPromises()
	expect(w.find('[data-testid="thread"]').exists()).toBe(false)
	await finish()
	expect(w.get('[data-testid="thread"]').text()).toContain('T1')
	await w.get('[data-testid="thread"] button').trigger('click')
	expect(w.find('[data-testid="thread"]').exists()).toBe(false)
})

it('honors AJAX route pages and deep links independently of the reply page', async () => {
	const w = open()
	await flushPromises()
	await finish()
	api.route.query = { topics_page: '5', discussion: 'T1', discussion_page: '4' }
	await flushPromises()
	expect(api.requests[1].params).toMatchObject({ page: 5, discussion: 'T1' })
	await finish(1, data(5, 100, 'T1'))
	expect(w.findAll('[data-testid="topic-row"]')).toHaveLength(20)
	expect(
		w.get('[aria-label="Next topics page"]').attributes('disabled')
	).toBeDefined()
	api.route.query = { topics_page: '2' }
	await flushPromises()
	await finish(2, data(2))
	expect(w.find('[data-testid="thread"]').exists()).toBe(false)
	user.data = { name: 'Guest' }
	await flushPromises()
	expect(w.findAll('[data-testid="topic-row"]')).toHaveLength(0)
	expect(api.requests).toHaveLength(3)
})
