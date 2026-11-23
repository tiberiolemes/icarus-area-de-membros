import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { reactive, ref } from 'vue'

const state = vi.hoisted(() => ({
	steps: [] as any[],
	push: vi.fn(),
	open: vi.fn(),
}))
vi.mock('@/utils', () => ({ getSidebarLinks: () => [] }))
vi.mock('@/stores/user', () => {
	const userResource = reactive({ data: { is_system_manager: true } })
	return { usersStore: () => ({ userResource }) }
})
vi.mock('@/utils/onboarding', () => ({ seesOnboarding: () => true }))
vi.mock('@/stores/sidebar', () => {
	const sidebar = reactive({
		isSidebarCollapsed: false,
		isWebpagesCollapsed: true,
	})
	return { useSidebar: () => sidebar }
})
vi.mock('@/stores/settings', () => {
	const sidebarSettings = reactive({ data: {} })
	return {
		useSettings: () => ({
			sidebarSettings,
			programs: { reload: vi.fn() },
			loadSidebarSettings: () => Promise.resolve(),
			settings: ref({}),
		}),
	}
})
vi.mock('@/stores/notifications', () => ({
	loadUnreadCount: vi.fn(),
	unreadCount: ref(0),
	unreadNotifications: { reload: vi.fn() },
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/composables/useFormRoute', () => ({ openFormRoute: state.open }))
vi.mock('@/composables/useSettingsHash', () => ({ pushSettingsHash: vi.fn() }))
vi.mock('@framework/ui/telemetry/index', () => ({
	useTelemetry: () => ({ capture: vi.fn() }),
}))
vi.mock('@framework/ui/components/Onboarding/index', () => ({
	HelpModal: { template: '<section />' },
	GettingStartedBanner: { template: '<div />' },
	IntermediateStepModal: { template: '<div />' },
	showHelpModal: ref(true),
	minimize: ref(false),
	useOnboarding: () => ({
		isOnboardingStepsCompleted: ref(false),
		setUp: (steps: any[]) => {
			state.steps = steps
		},
	}),
}))
vi.mock('frappe-ui', async (importOriginal) => ({
	Button: (await importOriginal<any>()).Button,
	ScrollArea: { name: 'ScrollArea', template: '<div><slot /></div>' },
	Tooltip: { name: 'Tooltip', template: '<span><slot /></span>' },
	call: vi.fn(() => Promise.resolve(null)),
	toast: {},
}))
vi.mock('@/components/Modals/PageModal.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('@/components/Sidebar/UserDropdown.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('@/components/Sidebar/SidebarLink.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('@/components/CommandPalette/CommandPalette.vue', () => ({
	default: { template: '<div />' },
}))
import Sidebar from '@/components/Sidebar/AppSidebar.vue'
import { minimize } from '@framework/ui/components/Onboarding/index'
import { takeFormSource } from '@/composables/formTracking'
import { call } from 'frappe-ui'
import { usersStore } from '@/stores/user'
import { useSettings } from '@/stores/settings'
import { useSidebar } from '@/stores/sidebar'

let wrapper: ReturnType<typeof shallowMount>
function mountSidebar() {
	return shallowMount(Sidebar, {
		global: {
			provide: { $socket: { on: vi.fn(), off: vi.fn() } },
			mocks: { __: (s: string) => s },
			stubs: { Button: false, Tooltip: false, ScrollArea: false },
		},
	})
}
beforeEach(async () => {
	localStorage.clear()
	state.open.mockClear()
	state.push.mockClear()
	usersStore().userResource.data = { is_system_manager: true }
	useSettings().sidebarSettings.data = {}
	useSidebar().isSidebarCollapsed = false
	useSidebar().isWebpagesCollapsed = true
	minimize.value = false
	wrapper = mountSidebar()
	await flushPromises()
})
afterEach(() => wrapper.unmount())

describe('sidebar onboarding callers', () => {
	it.each([
		'create_first_course',
		'create_first_batch',
		'create_first_lesson',
		'publish_first_course',
	])('keeps the %s opener visible when opening a modal', async (name) => {
		await state.steps.find((step) => step.name === name).onClick()
		expect(state.open).toHaveBeenCalledTimes(1)
		expect(minimize.value).toBe(false)
		expect(takeFormSource()).toBe('onboarding')
	})
	it('still minimizes for navigation to the existing course editor', async () => {
		localStorage.setItem('firstCourse', 'owned-course')
		await state.steps
			.find((step) => step.name === 'create_first_lesson')
			.onClick()
		expect(minimize.value).toBe(true)
		expect(state.open).not.toHaveBeenCalled()
		expect(state.push).toHaveBeenCalledWith({
			name: 'CourseDetail',
			params: { courseName: 'owned-course' },
			hash: '#editor',
		})
	})
	it('keeps the opener visible while resolving a course and while opening invitation settings', async () => {
		let resolve: (course: string | null) => void
		vi.mocked(call).mockImplementationOnce(
			() =>
				new Promise((done) => {
					resolve = done
				})
		)
		const pending = state.steps
			.find((step) => step.name === 'create_first_lesson')
			.onClick()
		expect(minimize.value).toBe(false)
		resolve!(null)
		await pending
		expect(minimize.value).toBe(false)
		await state.steps.find((step) => step.name === 'invite_students').onClick()
		expect(minimize.value).toBe(false)
	})
	it('exposes a named native collapse control and updates its state without navigating', async () => {
		const button = wrapper.get('button[aria-label="Collapse"]')
		expect(button.attributes('type')).toBe('button')
		expect(button.attributes('aria-expanded')).toBe('true')
		expect(button.classes()).toContain('!min-h-11')
		expect(button.find('collapse-sidebar-stub').attributes('aria-hidden')).toBe(
			'true'
		)
		await button.trigger('click')
		expect(button.attributes('aria-label')).toBe('Expand')
		expect(button.attributes('aria-expanded')).toBe('false')
		expect(localStorage.getItem('isSidebarCollapsed')).toBe('true')
		expect(state.push).not.toHaveBeenCalled()
	})
	it('uses separate named native buttons for More and New Page without toggling on creation', async () => {
		useSettings().sidebarSettings.data = {
			web_pages: [{ name: 'own-page', label: 'Own Page' }],
		}
		usersStore().userResource.data = {
			is_system_manager: true,
			is_moderator: true,
		}
		await flushPromises()
		const more = wrapper.get('button[aria-label="More"]')
		const create = wrapper.get('button[aria-label="New Page"]')
		expect(more.attributes('type')).toBe('button')
		expect(more.attributes('aria-expanded')).toBe('false')
		expect(create.attributes('type')).toBe('button')
		expect(more.element.contains(create.element)).toBe(false)
		expect(more.classes()).toContain('!min-h-11')
		expect(create.classes()).toContain('!min-w-11')
		await create.trigger('click')
		expect(more.attributes('aria-expanded')).toBe('false')
		expect(
			wrapper.findComponent({ name: 'PageModal' }).attributes('modelvalue')
		).toBe('true')
		await more.trigger('click')
		expect(more.attributes('aria-expanded')).toBe('true')
		expect(localStorage.getItem('isWebpagesCollapsed')).toBe('false')
		expect(state.push).not.toHaveBeenCalled()
	})
	it('does not invent a toggle for an empty page list or grant creation to a non-moderator', async () => {
		usersStore().userResource.data = {
			is_system_manager: true,
			is_moderator: true,
		}
		await flushPromises()
		expect(wrapper.find('button[aria-label="More"]').exists()).toBe(false)
		expect(wrapper.find('button[aria-label="New Page"]').exists()).toBe(true)
		usersStore().userResource.data = {
			is_system_manager: true,
			is_moderator: false,
		}
		await flushPromises()
		expect(wrapper.find('button[aria-label="New Page"]').exists()).toBe(false)
	})
	it('keeps existing pages available in read-only mode without exposing creation', async () => {
		wrapper.unmount()
		window.read_only_mode = true
		try {
			wrapper = mountSidebar()
			useSettings().sidebarSettings.data = {
				web_pages: [{ name: 'own-page', label: 'Own Page' }],
			}
			usersStore().userResource.data = {
				is_system_manager: true,
				is_moderator: true,
			}
			await flushPromises()
			expect(wrapper.find('button[aria-label="New Page"]').exists()).toBe(false)
			await wrapper.get('button[aria-label="More"]').trigger('click')
			expect(
				wrapper.get('button[aria-label="More"]').attributes('aria-expanded')
			).toBe('true')
		} finally {
			window.read_only_mode = false
		}
	})
})
