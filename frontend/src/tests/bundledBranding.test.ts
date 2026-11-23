import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserDropdown from '@/components/Sidebar/UserDropdown.vue'

const { branding } = vi.hoisted(() => ({ branding: { data: {} as any } }))
vi.mock('@/stores/session', () => ({
	sessionStore: () => ({
		branding,
		isLoggedIn: true,
		logout: { submit: vi.fn() },
	}),
}))
vi.mock('@/stores/user', () => ({
	usersStore: () => ({
		userResource: {
			data: { full_name: 'Tibério Lemes de Souza', username: 'qc08' },
		},
	}),
}))
vi.mock('@/stores/settings', () => ({
	useSettings: () => ({ settings: { data: {} } }),
}))
vi.mock('@/components/Settings/settings', () => ({
	canOpenSettings: () => false,
}))
vi.mock('@/components/Settings/Settings.vue', () => ({
	default: { template: '<div />' },
}))
vi.mock('@/utils/dialogs', () => ({ createDialog: vi.fn() }))
vi.mock('@/utils/theme', () => ({
	setThemePreference: vi.fn(),
	themePreference: { value: 'light' },
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('frappe-ui', () => ({
	call: vi.fn(),
	toast: { error: vi.fn() },
	createResource: () => ({ data: [] }),
	Dropdown: { template: '<div><slot :open="false" :close="() => {}" /></div>' },
}))
vi.stubGlobal('__', (value: string) => value)

describe('native bundled signature consumer', () => {
	beforeEach(() => {
		branding.data = {
			app_name: 'Tibério Lemes',
			banner_image: { file_url: '/assets/lms/images/assinatura-tiberio.svg' },
		}
	})
	it('keeps the full signature and original full name without a fixed-height clipping box', () => {
		const wrapper = mount(UserDropdown)
		const logo = wrapper.get('[data-brand-logo]')
		expect(logo.attributes('src')).toBe(
			'/assets/lms/images/assinatura-tiberio.svg'
		)
		expect(logo.attributes('alt')).toBe('')
		expect(logo.classes()).toContain('object-contain')
		expect(logo.classes()).toContain('w-40')
		expect(logo.classes()).toContain('dark:invert')
		expect(wrapper.text()).toContain('Tibério Lemes de Souza')
		expect(wrapper.get('button').classes()).not.toContain('h-12')
		wrapper.unmount()
	})
	it('preserves the colours of a separately configured brand image', () => {
		branding.data.banner_image.file_url = '/files/custom-brand.svg'
		const wrapper = mount(UserDropdown)
		expect(wrapper.get('[data-brand-logo]').classes()).not.toContain(
			'dark:invert'
		)
		wrapper.unmount()
	})
	it('contains the full image in the collapsed slot and retains the platform fallback when unset', async () => {
		const wrapper = mount(UserDropdown, { props: { isCollapsed: true } })
		expect(wrapper.get('[data-brand-logo]').classes()).toContain('w-8')
		wrapper.unmount()
		branding.data = { app_name: 'Tibério Lemes' }
		const fallback = mount(UserDropdown)
		expect(fallback.find('[data-brand-logo]').exists()).toBe(false)
		expect(fallback.text()).toContain('Tibério Lemes')
		fallback.unmount()
	})
})
