import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import DiscussionModal from '@/components/Modals/DiscussionModal.vue'
import { testTranslate } from './setup'

const api = vi.hoisted(() => ({
	call: vi.fn(),
	reload: vi.fn(),
	close: vi.fn(),
	toast: vi.fn(),
}))
vi.mock('frappe-ui', () => ({
	call: api.call,
	toast: { error: api.toast },
	Dialog: { template: '<section><slot /></section>' },
	ErrorMessage: {
		props: ['message'],
		template: '<p role="alert">{{ message }}</p>',
	},
	FormControl: {
		props: ['modelValue'],
		emits: ['update:modelValue'],
		template:
			'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
	},
}))
vi.mock('@/utils', () => ({ singularize: (value: string) => value }))
vi.mock('@framework/ui/telemetry/index', () => ({
	useTelemetry: () => ({ capture: vi.fn() }),
}))
vi.mock('@/components/RichTextEditor.vue', () => ({
	default: {
		props: ['content'],
		emits: ['change'],
		setup(_props: unknown, { expose }: any) {
			expose({ focus: vi.fn() })
		},
		template:
			'<textarea :value="content" @input="$emit(\'change\', $event.target.value)" />',
	},
}))
enableAutoUnmount(afterEach)
beforeEach(() => {
	vi.clearAllMocks()
	api.reload.mockResolvedValue(undefined)
})
const open = () =>
	mount(DiscussionModal, {
		props: {
			title: 'New Discussion',
			doctype: 'LMS Community',
			docname: 'synthetic',
			modelValue: true,
		},
		global: { mocks: { __: testTranslate } },
	})

describe('atomic topic pending approval', () => {
	it('does not submit an empty rich-text body and keeps the title', async () => {
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.topic.title = 'Question'
		vm.topic.reply = '<p><br></p>'
		vm.submitTopic(api.close)
		await flushPromises()
		expect(api.call).not.toHaveBeenCalled()
		expect(vm.errors.reply).toBe('Details cannot be empty.')
		expect(vm.topic.title).toBe('Question')
	})
	it('guards double posting and preserves the complete draft after an API failure', async () => {
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.topic.title = 'Question'
		vm.topic.reply = '<p><strong>Draft</strong></p>'
		let reject!: (error: unknown) => void
		api.call.mockImplementationOnce(
			() =>
				new Promise((_resolve, fail) => {
					reject = fail
				})
		)
		const request = vm.submitTopic(api.close)
		vm.submitTopic(api.close)
		expect(api.call).toHaveBeenCalledTimes(1)
		reject({ status: 500 })
		await request
		expect(vm.topic.reply).toBe('<p><strong>Draft</strong></p>')
		expect(vm.saving).toBe(false)
		expect(api.close).not.toHaveBeenCalled()
	})
	it('acknowledges one atomic save and delegates the paged reload without posting again', async () => {
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.topic.title = 'Question'
		vm.topic.reply = '<p>Body</p>'
		api.call.mockResolvedValueOnce({ name: 'topic' })
		api.reload.mockRejectedValueOnce({ status: 500 })
		await vm.submitTopic(api.close)
		expect(api.call).toHaveBeenCalledWith('lms.lms.moderation.create_topic', {
			doctype: 'LMS Community',
			docname: 'synthetic',
			title: 'Question',
			reply: '<p>Body</p>',
		})
		expect(api.close).toHaveBeenCalledOnce()
		expect(vm.topic.reply).toBe('')
		expect(wrapper.emitted('created')).toEqual([['topic']])
		expect(api.reload).not.toHaveBeenCalled()
	})
})
