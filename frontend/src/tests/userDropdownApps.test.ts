import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { Dropdown } from 'frappe-ui'
import UserDropdown from '@/components/Sidebar/UserDropdown.vue'

const state = vi.hoisted(() => ({
	session: null as any,
	user: null as any,
	epoch: 0,
	requests: [] as Array<{
		signal: AbortSignal
		resolve: (data: any) => void
		reject: (error: Error) => void
	}>,
	resources: [] as any[],
}))
vi.mock('frappe-ui', async (importOriginal) => {
	const native = await importOriginal<any>()
	return {
		...native,
		createResource: (options: any) => {
			const resource = native.createResource({
				...options,
				// Only separate independent tests; preserve any real cache behavior within each test.
				cache: options.cache ? [options.cache, state.epoch] : undefined,
				resourceFetcher: (request: any) =>
					new Promise((resolve, reject) => {
						// A delayed result may arrive despite abort, as in the real Home regression.
						state.requests.push({ signal: request.signal, resolve, reject })
					}),
			})
			state.resources.push(resource)
			return resource
		},
	}
})
vi.mock('@/stores/session', () => ({ sessionStore: () => state.session }))
vi.mock('@/stores/user', () => ({
	usersStore: () => ({ userResource: state.user }),
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
vi.stubGlobal('__', (text: string) => text)

let wrapper: ReturnType<typeof mount>
const actor = (name: string, site = 'site-a', type = 'System User') => ({
	name: name + '@example.test',
	username: name,
	full_name: name,
	user_type: type,
	sitename: site,
})
function identity(user: any) {
	state.session.user = user?.name || null
	state.session.isLoggedIn = !!user
	state.user.data = user
}
function open(user?: any) {
	identity(user)
	wrapper = mount(UserDropdown)
}
function apps() {
	return (
		wrapper.getComponent(Dropdown).props('options') as any[]
	)[0].options.find((option) => option.label === 'Apps')
}
function complete(index: number, title: string) {
	state.requests[index].resolve([
		{ name: 'allowed', title, route: '/allowed', logo: '/assets/allowed.svg' },
	])
}
beforeEach(() => {
	state.epoch++
	state.requests = []
	state.resources = []
	state.session = reactive({
		user: null,
		isLoggedIn: false,
		logout: { submit: vi.fn() },
		branding: { data: { app_name: 'Tibério Lemes' } },
	})
	state.user = reactive({ data: undefined })
})
afterEach(async () => {
	wrapper?.unmount()
	await flushPromises()
})

it.each([
	undefined,
	actor('website', 'site-a', 'Website User'),
	{ ...actor('unknown-site'), sitename: undefined },
])(
	'does not read hidden apps for Guest, Website User or unknown site/actor',
	async (user) => {
		open(user)
		await flushPromises()
		expect(state.requests).toHaveLength(0)
		expect(apps().condition()).toBe(false)
	}
)

it('waits for cold user info and performs one stable native read for the current System User', async () => {
	open()
	state.session.user = 'admin@example.test'
	await flushPromises()
	expect(state.requests).toHaveLength(0)
	state.user.data = actor('old-actor')
	await flushPromises()
	expect(state.requests).toHaveLength(0)
	state.user.data = actor('admin')
	await flushPromises()
	expect(state.requests).toHaveLength(1)
	complete(0, 'Authorized app')
	await flushPromises()
	expect(apps().condition()).toBe(true)
	expect(apps().submenu.map((option: any) => option.label)).toEqual([
		'Desk',
		'Authorized app',
	])
	state.user.data = { ...state.user.data, full_name: 'Updated display name' }
	await flushPromises()
	expect(state.requests).toHaveLength(1)
	expect(state.resources).toHaveLength(1)
})

it('keeps A→B→A and site changes isolated even when aborted requests finish late', async () => {
	open(actor('a'))
	await flushPromises()
	identity(actor('b'))
	await flushPromises()
	identity(actor('a'))
	await flushPromises()
	expect(state.requests).toHaveLength(3)
	expect(
		state.requests.slice(0, 2).every((request) => request.signal.aborted)
	).toBe(true)
	complete(2, 'New A')
	complete(0, 'Old A')
	complete(1, 'Old B')
	await flushPromises()
	expect(apps().submenu.map((option: any) => option.label)).toEqual([
		'Desk',
		'New A',
	])
	const oldNavigation = apps().submenu[1].onClick
	identity(actor('a', 'site-b'))
	await flushPromises()
	expect(state.requests).toHaveLength(4)
	complete(3, 'Site B')
	await flushPromises()
	expect(apps().submenu.map((option: any) => option.label)).toEqual([
		'Desk',
		'Site B',
	])
	const originalWindow = window
	const destination = { href: 'unchanged' }
	vi.stubGlobal('window', { location: destination })
	try {
		oldNavigation()
		expect(destination.href).toBe('unchanged')
	} finally {
		vi.stubGlobal('window', originalWindow)
	}
})

it('observes read failures and retries only on an explicit current-actor action', async () => {
	open(actor('a'))
	await flushPromises()
	state.requests[0].reject(new Error('synthetic unavailable read'))
	await flushPromises()
	expect(state.requests).toHaveLength(1)
	const retry = apps().submenu[0]
	expect(retry.label).toBe('Could not load apps. Try again.')
	const operation = retry.onClick()
	await flushPromises()
	expect(state.requests).toHaveLength(2)
	complete(1, 'Recovered')
	await operation
	await flushPromises()
	expect(apps().submenu.map((option: any) => option.label)).toEqual([
		'Desk',
		'Recovered',
	])
	identity(actor('b'))
	await flushPromises()
	const count = state.requests.length
	retry.onClick()
	await flushPromises()
	expect(state.requests).toHaveLength(count)
})

it('discards logout and lost System User authority without restoring old results or retry', async () => {
	open(actor('a'))
	await flushPromises()
	identity(undefined)
	await flushPromises()
	expect(state.requests[0].signal.aborted).toBe(true)
	complete(0, 'Old A')
	await flushPromises()
	expect(apps().condition()).toBe(false)
	expect(apps().submenu).toEqual([])
	identity(actor('a', 'site-a', 'Website User'))
	await flushPromises()
	expect(state.requests).toHaveLength(1)
	expect(apps().condition()).toBe(false)
})
