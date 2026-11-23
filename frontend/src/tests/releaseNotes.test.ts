import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import ReleaseNotes from '@/components/ReleaseNotes.vue'

const api = vi.hoisted(() => ({ call: vi.fn(), error: vi.fn() }))
vi.mock('frappe-ui', () => ({
	call: api.call,
	toast: { error: api.error },
	Button: { template: '<button><slot /></button>' },
	Dialog: {
		name: 'Dialog',
		props: ['open'],
		emits: ['update:open'],
		template:
			'<section v-if="open"><button class="close" @click="$emit(\'update:open\', false)">X</button><slot name="default" /><slot name="actions" /></section>',
	},
}))
enableAutoUnmount(afterEach)
beforeEach(() => {
	api.call.mockReset()
	api.error.mockReset()
	api.call.mockResolvedValue({})
})
const render = () =>
	mount(ReleaseNotes, {
		props: { user: 'alice' },
		global: { mocks: { __: (s: string) => s } },
	})

describe('release preference in native user onboarding storage', () => {
	it('shows the release and persists one dismissal through the native session-scoped API', async () => {
		const wrapper = render()
		await flushPromises()
		expect(wrapper.text()).toContain('concessão administrativa')
		await wrapper.get('.close').trigger('click')
		await flushPromises()
		expect(
			api.call.mock.calls.filter(
				([method]) =>
					method === 'frappe.onboarding.update_user_onboarding_status'
			)
		).toHaveLength(1)
		const params = api.call.mock.calls[1][1]
		expect(params.appName).toBe('icarus_releases')
		expect(params).not.toHaveProperty('user')
	})
	it('keeps a dismissed release closed on another browser after the server read', async () => {
		api.call.mockResolvedValue({
			icarus_releases_onboarding_status: [
				{ name: 'icarus-quality-20261121-07', completed: true },
			],
		})
		const wrapper = render()
		await flushPromises()
		expect(wrapper.find('section').exists()).toBe(false)
	})
	it('reloads preferences for the current impersonated identity', async () => {
		const wrapper = render()
		await flushPromises()
		await wrapper.get('.close').trigger('click')
		await flushPromises()
		await wrapper.setProps({ user: 'bob' })
		await flushPromises()
		expect(wrapper.find('section').exists()).toBe(true)
	})
	it('explains failure to save without trapping the user in the notice', async () => {
		const wrapper = render()
		await flushPromises()
		api.call.mockRejectedValueOnce(new Error('offline'))
		await wrapper.get('.close').trigger('click')
		await flushPromises()
		expect(wrapper.find('section').exists()).toBe(false)
		expect(api.error).toHaveBeenCalledWith(
			expect.stringContaining('próximo acesso')
		)
	})
})
