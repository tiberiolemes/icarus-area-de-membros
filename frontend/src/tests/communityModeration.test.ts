import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import Community from '@/pages/Community.vue'
import { testTranslate } from './setup'

const api = vi.hoisted(() => ({ call: vi.fn(), reload: vi.fn() }))
let access: any
vi.mock('frappe-ui', () => ({
	call: api.call,
	createResource: () => access,
	Button: {
		props: ['loading', 'disabled'],
		template: '<button :disabled="loading || disabled"><slot /></button>',
	},
	FormControl: {
		props: ['modelValue', 'label'],
		emits: ['update:modelValue'],
		template:
			'<label>{{ label }}<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>',
	},
	ErrorMessage: {
		props: ['message'],
		template: '<p role="alert">{{ message }}</p>',
	},
	Dialog: {
		props: ['open'],
		template: '<div v-if="open" role="dialog"><slot name="actions" /></div>',
	},
}))
vi.mock('@/components/Discussions.vue', () => ({
	default: { template: '<div data-testid="posts" />' },
}))
vi.mock('@/components/RichTextEditor.vue', () => ({
	default: { props: ['content'], template: '<p>{{ content }}</p>' },
}))
vi.mock('@/components/LoadError.vue', () => ({
	default: { template: '<p role="alert">Failed to load</p>' },
}))
enableAutoUnmount(afterEach)
beforeEach(() => {
	api.call.mockReset()
	access = reactive({
		data: {
			name: 'community',
			title: 'Synthetic',
			can_access: false,
			is_admin: false,
			grants: [],
			timezone: 'America/Sao_Paulo',
		},
		reload: api.reload,
	})
})
const open = () =>
	mount(Community, {
		global: {
			provide: {
				$user: { data: { name: 'member' } },
				$socket: { on: vi.fn(), off: vi.fn() },
			},
			mocks: { __: testTranslate },
		},
	})

describe('independent annual community', () => {
	it('shows neutral access state and no posts or administrative controls without a grant', () => {
		const wrapper = open()
		expect(wrapper.text()).toContain('Community access is not active')
		expect(wrapper.find('[data-testid="posts"]').exists()).toBe(false)
		expect(wrapper.find('form').exists()).toBe(false)
		expect(wrapper.find('nav').exists()).toBe(false)
	})
	it('opens the real discussion surface for an entitled student', () => {
		access.data.can_access = true
		expect(open().find('[data-testid="posts"]').exists()).toBe(true)
	})
	it('retains the same grant idempotency key and input after an ambiguous failure', async () => {
		access.data.is_admin = true
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.tab = 'access'
		vm.grantForm.member = 'synthetic@example.com'
		await flushPromises()
		api.call.mockRejectedValue({ status: 500 })
		await vm.grantAccess()
		await vm.grantAccess()
		expect(api.call.mock.calls[0][1].request_key).toBe(
			api.call.mock.calls[1][1].request_key
		)
		expect(vm.grantForm.member).toBe('synthetic@example.com')
		expect(vm.busy).toBe('')
		expect(wrapper.get('[role="alert"]').text()).toContain(
			'Something went wrong'
		)
	})
	it('does not call revoke when its confirmation is cancelled and guards repeated decisions', async () => {
		access.data.is_admin = true
		const wrapper = open()
		const vm = wrapper.vm as any
		vm.revokeTarget = { name: 'grant' }
		await flushPromises()
		await wrapper.get('[role="dialog"] button').trigger('click')
		expect(api.call).not.toHaveBeenCalled()
		let resolve!: (value: unknown) => void
		api.call
			.mockImplementationOnce(
				() =>
					new Promise((done) => {
						resolve = done
					})
			)
			.mockResolvedValue({ rows: [], has_more: false })
		const action = vm.moderate(
			{ name: 'reply', doctype: 'Discussion Reply' },
			'Approved'
		)
		vm.moderate({ name: 'reply', doctype: 'Discussion Reply' }, 'Approved')
		expect(api.call).toHaveBeenCalledTimes(1)
		resolve({})
		await action
		expect(vm.message).toBe('Decision recorded.')
	})
})
