import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import NotificationPanel from '@/components/Notifications/NotificationPanel.vue'

const store = vi.hoisted(() => ({ value: null as any }))
vi.mock('@/stores/notifications', async () => {
	const { reactive, ref } = await import('vue')
	store.value = {
		panelVisible: ref(true),
		notifications: reactive({
			data: null,
			list: { loading: false, error: null },
			reload: vi.fn(),
		}),
		closeNotifications: vi.fn(),
		markAsRead: { submit: vi.fn() },
		markAllAsRead: { submit: vi.fn() },
	}
	return store.value
})
vi.mock('@/utils', () => ({ decodeEntities: (text: string) => text }))
vi.mock('@/stores/sidebar', () => ({
	useSidebar: () => ({ isSidebarCollapsed: false }),
}))
vi.mock('@/utils/composables', () => ({
	useScreenSize: () => ({ isMobile: ref(false) }),
}))
vi.mock('@/utils/dayjs', () => ({
	serverTime: () => ({ fromNow: () => 'now' }),
}))
vi.mock('frappe-ui', () => ({
	Avatar: { template: '<div />' },
	Tooltip: { template: '<div><slot /></div>' },
	TabButtons: { template: '<div />' },
	Button: {
		props: ['label'],
		template: '<button>{{ label }}<slot /></button>',
	},
}))
vi.mock('@/components/LoadError.vue', () => ({
	default: {
		name: 'LoadError',
		props: ['error'],
		emits: ['retry'],
		template:
			'<button data-testid="retry" @click="$emit(\'retry\')">Retry</button>',
	},
}))
enableAutoUnmount(afterEach)
beforeEach(() => {
	store.value.notifications.data = null
	store.value.notifications.list.error = null
	store.value.notifications.list.loading = false
	store.value.notifications.reload.mockClear()
})
const open = () =>
	mount(NotificationPanel, {
		global: {
			stubs: { teleport: true },
			mocks: { __: (text: string) => text },
		},
	})

describe('notification initial failure', () => {
	it('uses the native list error and retries without presenting it as an empty inbox', async () => {
		store.value.notifications.list.error = { status: 500 }
		const wrapper = open()
		expect(wrapper.text()).not.toContain('No unread notifications')
		await wrapper.get('[data-testid="retry"]').trigger('click')
		expect(store.value.notifications.reload).toHaveBeenCalledTimes(1)
	})
	it('keeps the real empty state for a successfully fetched empty inbox', () => {
		store.value.notifications.data = []
		const wrapper = open()
		expect(wrapper.text()).toContain('No unread notifications')
		expect(wrapper.find('[data-testid="retry"]').exists()).toBe(false)
	})
})
