import { mount, flushPromises, config } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SessionInactivity from '@/components/SessionInactivity.vue'
import { testTranslate } from './setup'
const { monitors, monitorInactivity } = vi.hoisted(() => {
	const monitors: any[] = []
	return {
		monitors,
		monitorInactivity: vi.fn((options) => {
			const monitor = {
				options,
				stop: vi.fn(),
				continue: vi.fn().mockResolvedValue(true),
			}
			monitors.push(monitor)
			return monitor
		}),
	}
})
vi.mock('@/utils/inactivity', () => ({ monitorInactivity }))
vi.mock('@/stores/session', () => ({
	sessionStore: () => ({ logout: { submit: vi.fn() } }),
}))
vi.mock('frappe-ui', () => ({
	call: vi.fn(),
	Dialog: {
		props: ['open', 'message'],
		template:
			'<div v-if="open"><p>{{ message }}</p><slot name="actions" /></div>',
	},
	Button: { props: ['label'], template: '<button>{{ label }}</button>' },
}))
beforeEach(() => {
	monitors.length = 0
	monitorInactivity.mockClear()
	config.global.mocks.__ = testTranslate
	vi.stubGlobal('__', testTranslate)
	sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())
it('mounts one monitor per actor, preserves safe drafts on expiry and stops on identity revocation/unmount', async () => {
	sessionStorage.setItem('lms:form-draft:student:profile', 'safe draft')
	const socket = { connected: true, disconnect: vi.fn(), connect: vi.fn() }
	const host = mount(SessionInactivity, {
		props: { actor: 'student' },
		global: { provide: { $socket: socket } },
	})
	expect(monitorInactivity).toHaveBeenCalledTimes(1)
	monitors[0].options.onState(60, true)
	await flushPromises()
	expect(host.text()).toContain('60')
	monitors[0].options.onExpired('expired')
	await flushPromises()
	expect(socket.disconnect).toHaveBeenCalledOnce()
	expect(sessionStorage.getItem('lms:form-draft:student:profile')).toBe(
		'safe draft',
	)
	await host.setProps({ actor: 'admin' })
	expect(socket.connect).toHaveBeenCalledOnce()
	expect(monitors[0].stop).toHaveBeenCalledOnce()
	expect(monitorInactivity).toHaveBeenCalledTimes(2)
	await host.setProps({ actor: undefined })
	expect(monitors[1].stop).toHaveBeenCalledOnce()
	host.unmount()
})
