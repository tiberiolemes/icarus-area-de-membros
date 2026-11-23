import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import SessionInactivity from '@/components/SessionInactivity.vue'
import { testTranslate } from './setup'
const { state } = vi.hoisted(() => ({ state: { options: null as any } }))
vi.mock('@/utils/inactivity', () => ({
	monitorInactivity: (options) => {
		state.options = options
		return { stop: vi.fn(), continue: vi.fn().mockResolvedValue(true) }
	},
}))
vi.mock('@/stores/session', () => ({
	sessionStore: () => ({ logout: { submit: vi.fn() } }),
}))
afterEach(() => {
	document.body.innerHTML = ''
})
it('renders the real native dialog with its title/content and prevents dismissing an expired session', async () => {
	const wrapper = mount(SessionInactivity, {
		props: { actor: 'student' },
		attachTo: document.body,
		global: { mocks: { __: testTranslate } },
	})
	state.options.onState(60, true)
	await flushPromises()
	const dialog = document.querySelector('[role="dialog"]')!
	expect(dialog).not.toBeNull()
	expect(dialog.textContent).toContain('Your session will expire soon')
	expect(dialog.textContent).toContain('60 seconds')
	expect(dialog.querySelector('[aria-label="Close"]')).toBeNull()
	state.options.onExpired('expired')
	await flushPromises()
	dialog.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
	)
	await flushPromises()
	expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
		'Sign in to continue',
	)
	wrapper.unmount()
})
