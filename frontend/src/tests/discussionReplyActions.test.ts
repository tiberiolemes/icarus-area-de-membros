import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { testTranslate } from './setup'
import DiscussionReplies from '@/components/DiscussionReplies.vue'

const api = vi.hoisted(() => ({
	call: vi.fn(),
	reload: vi.fn(),
	options: null as any,
}))
const ROW = {
	name: 'reply-1',
	reply: '<p>Original</p>',
	owner: 'author',
	creation: 'today',
	user: { full_name: 'Author' },
}
let resource: any
vi.mock('frappe-ui', () => ({
	call: api.call,
	createResource: (options: any) => {
		if (options.url === 'lms.lms.utils.get_discussion_replies') {
			api.options = options
			return resource
		}
		return reactive({ loading: false, submit: vi.fn() })
	},
	toast: { success: vi.fn(), error: vi.fn() },
	Button: {
		props: ['label', 'loading', 'disabled'],
		emits: ['click'],
		template:
			'<button :disabled="loading || disabled" :aria-busy="loading" @click="$emit(\'click\')">{{ label }}<slot /></button>',
	},
	Dialog: {
		props: ['open'],
		template:
			'<section v-if="open" role="dialog"><slot /><slot name="actions" /></section>',
	},
	Dropdown: {
		props: ['options'],
		template:
			'<div><button v-for="option in options" @click="option.onClick()">{{ option.label }}</button></div>',
	},
	ErrorMessage: {
		props: ['message'],
		template: '<p role="alert">{{ message }}</p>',
	},
}))
vi.mock('@/components/RichTextEditor.vue', () => ({
	default: {
		props: ['content', 'editable'],
		setup(_props: unknown, { expose }: any) {
			expose({ focus: vi.fn() })
			return {}
		},
		emits: ['change'],
		template:
			'<textarea :readonly="!editable" :value="content" @input="$emit(\'change\', $event.target.value)" />',
	},
}))
vi.mock('@/components/UserAvatar.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('@/utils', () => ({ timeAgo: () => 'now' }))
vi.mock('@framework/ui/telemetry/index', () => ({
	useTelemetry: () => ({ capture: vi.fn() }),
}))

enableAutoUnmount(afterEach)
beforeEach(() => {
	api.call.mockReset()
	api.reload.mockReset().mockResolvedValue(undefined)
	resource = reactive({
		data: { replies: [{ ...ROW }], root: null, total: 1, page: 0 },
		loading: false,
		error: null,
		reload: api.reload,
	})
})
const open = () =>
	mount(DiscussionReplies, {
		props: {
			topic: { name: 'topic-1' },
			doctype: 'Course Lesson',
			docname: 'lesson-1',
		},
		global: {
			provide: {
				$user: { data: { name: 'author', is_student: true } },
				$socket: { on: vi.fn(), off: vi.fn() },
				$allUsers: {},
			},
			mocks: { __: testTranslate },
		},
	})

describe('discussion reply actions', () => {
	it('guards double submission, shows loading and keeps edited text after a failed save', async () => {
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.startEdit(resource.data.replies[0])
		await flushPromises()
		await wrapper.findAll('textarea')[1].setValue('<p>My edit</p>')
		let reject!: (error: unknown) => void
		api.call.mockImplementation(
			() =>
				new Promise((_resolve, fail) => {
					reject = fail
				})
		)
		const first = vm.postEdited(resource.data.replies[0])
		vm.postEdited(resource.data.replies[0])
		await flushPromises()
		expect(api.call).toHaveBeenCalledTimes(1)
		expect(
			wrapper
				.findAll('button')
				.some((button) => button.attributes('aria-busy') === 'true')
		).toBe(true)
		reject({ status: 401 })
		await first
		await flushPromises()
		expect(vm.editing['reply-1']).toBe('<p>My edit</p>')
		expect(vm.savingReply).toBeNull()
		expect(wrapper.get('[role="alert"]').text()).toBe(
			'Something went wrong. Please try again.'
		)
		// A realtime refresh never replaces the local editing buffer.
		resource.data = {
			replies: [{ ...ROW, reply: '<p>Refetched</p>' }],
			root: null,
			total: 1,
			page: 0,
		}
		await flushPromises()
		expect(
			(wrapper.findAll('textarea')[1].element as HTMLTextAreaElement).value
		).toBe('<p>My edit</p>')
	})

	it('cancelled confirmation never calls delete and a confirmed action calls it once', async () => {
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.deleteReply(resource.data.replies[0])
		await flushPromises()
		expect(api.call).not.toHaveBeenCalled()
		await wrapper.get('[role="dialog"] button').trigger('click')
		expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
		expect(api.call).not.toHaveBeenCalled()
		vm.deleteReply(resource.data.replies[0])
		let resolve!: () => void
		api.call.mockImplementation(
			() =>
				new Promise<void>((done) => {
					resolve = done
				})
		)
		const deletion = vm.confirmDelete()
		vm.confirmDelete()
		expect(api.call).toHaveBeenCalledTimes(1)
		resolve()
		await deletion
		expect(api.call).toHaveBeenCalledWith('lms.lms.moderation.withdraw', {
			name: 'reply-1',
		})
		expect(api.reload).toHaveBeenCalledTimes(1)
		expect(vm.replyToDelete).toBeNull()
		api.options.onSuccess({ total: 1, page: 0 })
		expect(wrapper.emitted('reply-count')?.at(-1)).toEqual(['topic-1', 1])
	})

	it('discard restores the server text without submitting an edited reply', async () => {
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.startEdit(resource.data.replies[0])
		vm.editing['reply-1'] = 'Changed'
		vm.discardEdit(resource.data.replies[0])
		await flushPromises()
		expect(
			(wrapper.findAll('textarea')[1].element as HTMLTextAreaElement).value
		).toBe('<p>Original</p>')
		expect(api.call).not.toHaveBeenCalled()
	})
	it('shows an inline empty-editor error, clears it when corrected, and guards only actual edits', async () => {
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.startEdit(resource.data.replies[0])
		const unchanged = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(unchanged)
		expect(unchanged.defaultPrevented).toBe(false)
		vm.editing['reply-1'] = '<p><br></p>'
		await vm.postEdited(resource.data.replies[0])
		await flushPromises()
		expect(api.call).not.toHaveBeenCalled()
		expect(wrapper.get('[data-slot="error"]').text()).toContain(
			'Reply cannot be empty.'
		)
		vm.editing['reply-1'] = '<p>Corrected</p>'
		await flushPromises()
		expect(wrapper.find('[data-slot="error"]').exists()).toBe(false)
		const changed = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(changed)
		expect(changed.defaultPrevented).toBe(true)
	})
	it('requests pages from the server without discarding an edited buffer or editor focus', async () => {
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.startEdit(resource.data.replies[0])
		vm.editing['reply-1'] = '<p>Still editing</p>'
		await vm.changePage(2)
		expect(api.options.makeParams()).toEqual({ topic: 'topic-1', page: 2 })
		expect(
			new URL(window.location.href).searchParams.get('discussion_page')
		).toBe('2')
		expect(vm.editing['reply-1']).toBe('<p>Still editing</p>')
		expect(api.call).not.toHaveBeenCalled()
	})
	it('hides stale server content after access is denied while retaining the unsent reply', async () => {
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.newReply = '<p>Unsent question</p>'
		resource.error = { status: 403 }
		await flushPromises()
		expect(wrapper.text()).not.toContain('Original')
		expect(vm.newReply).toBe('<p>Unsent question</p>')
	})
})
