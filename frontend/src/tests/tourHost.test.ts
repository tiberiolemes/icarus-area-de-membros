import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import TourHost from '@/components/TourHost.vue'

const api = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: api.call, toast: { error: vi.fn() } }))
vi.mock('@/components/GuidedTour.vue', () => ({
	default: {
		name: 'GuidedTour',
		props: ['pageKey', 'request'],
		template: '<div />',
	},
}))
enableAutoUnmount(afterEach)

describe('tour host shares the real form route and prevents a departed actor from writing', () => {
	it('unwraps the provided page and stops a stale adapter after impersonation changes', async () => {
		const user = reactive({ data: { name: 'alice' } }),
			page = ref('NewCourse')
		const wrapper = mount(TourHost, {
			global: { provide: { $user: user, icarusTourPage: page } },
		})
		const initial = wrapper.getComponent({ name: 'GuidedTour' })
		expect(initial.props('pageKey')).toBe('NewCourse')
		const stale = initial.props('request')
		user.data.name = 'bob'
		await wrapper.vm.$nextTick()
		await expect(
			stale('lms.lms.tours.record_event', { action: 'pause' })
		).rejects.toThrow('identity changed')
		expect(api.call).not.toHaveBeenCalled()
		page.value = 'ChapterForm'
		await wrapper.vm.$nextTick()
		expect(wrapper.getComponent({ name: 'GuidedTour' }).props('pageKey')).toBe(
			'ChapterForm'
		)
	})
})
