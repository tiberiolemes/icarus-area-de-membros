import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { defineComponent, reactive, ref } from 'vue'
import { useCategoryAvailability } from '@/composables/useCategoryAvailability'
import Link from '@/components/Controls/Link.vue'
import Categories from '@/components/Settings/Categories.vue'
const api = vi.hoisted(() => ({
	requests: [] as any[],
	toast: vi.fn(),
	insert: null as any,
}))
vi.mock('frappe-ui', async (original) => {
	const native = await original<any>()
	return {
		...native,
		toast: { ...native.toast, success: api.toast },
		createResource: (options: any) =>
			native.createResource({
				...options,
				resourceFetcher: (request: any) =>
					new Promise((resolve, reject) =>
						api.requests.push({ ...request, resolve, reject })
					),
			}),
	}
})
vi.mock('@/stores/settings', () => ({
	useSettings: () => ({ settings: { data: {} } }),
}))
vi.mock('@/composables/useSettingsListResource', async () => {
	const { createResource } = await import('frappe-ui')
	return {
		useSettingsListResource: () => ({
			rows: [],
			search: '',
			reload: vi.fn(),
			resource: {
				insert: (api.insert = createResource({
					url: 'frappe.client.insert',
					makeParams: (doc: any) => ({
						doc: { doctype: 'LMS Category', ...doc },
					}),
				})),
			},
		}),
	}
})
vi.mock('@/components/Layouts/settings/desktop/SettingsList.vue', () => ({
	default: {
		template:
			'<button data-testid="new" @click="$emit(\'new\')">New</button><button data-testid="edit" @click="$emit(\'row-click\', { name: \'Existing\', category: \'Existing\' })">Edit</button>',
	},
}))
vi.mock('@/utils', () => ({ cleanError: (value: string) => value || '' }))
vi.mock('@/utils/dialogs', () => ({ createDialog: vi.fn() }))
enableAutoUnmount(afterEach)
let user: any
beforeEach(() => {
	api.requests = []
	api.toast.mockClear()
	user = reactive({ data: { name: 'admin@example.test', sitename: 'qa' } })
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
	vi.useRealTimers()
})
const finish = async (index: number, result: any = []) => {
	api.requests[index].resolve(result)
	await flushPromises()
}
const wait = async () => {
	await vi.advanceTimersByTimeAsync(300)
	await flushPromises()
}
const harness = () =>
	mount(
		defineComponent({
			setup() {
				const name = ref('')
				const active = ref(true)
				const exclude = ref<string | null>(null)
				const availability = useCategoryAvailability(
					() => name.value,
					() => active.value,
					() => exclude.value
				)
				return { name, active, exclude, ...availability }
			},
			template: '<span>{{ state }}</span>',
		}),
		{ global: { mocks: { __: (s: string) => s }, provide: { $user: user } } }
	)
it('debounces exact native category reads, excludes own name and invalidates immediately on keystroke', async () => {
	const w = harness()
	const vm = w.vm as any
	vm.name = 'Ca'
	await vi.advanceTimersByTimeAsync(200)
	vm.name = ' Café '
	await wait()
	expect(api.requests).toHaveLength(1)
	expect(api.requests[0].params).toMatchObject({
		doctype: 'LMS Category',
		filters: [['category', '=', 'Café']],
		limit_page_length: 1,
	})
	await finish(0, [{ name: 'CAFÉ' }])
	expect(vm.state).toBe('duplicate')
	vm.name = 'New'
	expect(vm.available).toBe(false)
	await wait()
	await finish(1)
	expect(vm.available).toBe(true)
	vm.exclude = 'New'
	await wait()
	expect(api.requests[2].params.filters).toContainEqual(['name', '!=', 'New'])
	await finish(2)
	expect(vm.available).toBe(true)
})
it('ignores out-of-order results, close, actor/site change and disposal; malformed reads remain invalid', async () => {
	const w = harness()
	const vm = w.vm as any
	vm.name = 'A'
	await wait()
	vm.name = 'B'
	await wait()
	await finish(1, [{ name: 'B' }])
	await finish(0)
	expect(vm.state).toBe('duplicate')
	user.data = { name: 'other@example.test', sitename: 'qa2' }
	expect(vm.available).toBe(false)
	await wait()
	vm.active = false
	await finish(2)
	expect(vm.available).toBe(false)
	vm.active = true
	await wait()
	await finish(3, {})
	expect(vm.state).toBe('error')
	vm.check()
	await flushPromises()
	w.unmount()
	await finish(4)
	expect(vm.available).toBe(false)
})
it('requires explicit recovery after failure, never looks up accounts or unknown actors', async () => {
	const w = harness()
	const vm = w.vm as any
	vm.name = 'Synthetic'
	await wait()
	api.requests[0].reject(new Error('synthetic transport'))
	await flushPromises()
	expect(vm.state).toBe('error')
	await vi.advanceTimersByTimeAsync(2000)
	expect(api.requests).toHaveLength(1)
	vm.check()
	await flushPromises()
	await finish(1)
	expect(vm.available).toBe(true)
	user.data = { name: 'Guest' }
	vm.name = 'Account'
	await wait()
	expect(api.requests).toHaveLength(2)
	expect(vm.available).toBe(false)
})
it('Settings uses real Dialog/FormControl, blocks pending/duplicate and retains text on native race collision', async () => {
	const w = mount(Categories, {
		attachTo: document.body,
		props: { label: 'Categories' },
		global: { mocks: { __: (s: string) => s }, provide: { $user: user } },
	})
	await w.get('[data-testid="new"]').trigger('click')
	await flushPromises()
	const input = () =>
		document.querySelector('[role="dialog"] input') as HTMLInputElement
	input().value = 'Existing'
	input().dispatchEvent(new Event('input', { bubbles: true }))
	await flushPromises()
	input().dispatchEvent(
		new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })
	)
	expect(api.requests).toHaveLength(0)
	await wait()
	await finish(0, [{ name: 'Existing' }])
	input().dispatchEvent(
		new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })
	)
	await flushPromises()
	expect(api.requests).toHaveLength(1)
	input().value = 'New'
	input().dispatchEvent(new Event('input', { bubbles: true }))
	await wait()
	await finish(1)
	input().dispatchEvent(
		new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })
	)
	input().dispatchEvent(
		new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })
	)
	await flushPromises()
	expect(api.requests).toHaveLength(3)
	expect(api.requests[2].url).toBe('frappe.client.insert')
	api.requests[2].reject({ messages: ['Category already exists'] })
	await flushPromises()
	expect(input().value).toBe('New')
	expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
		'Category already exists'
	)
	expect(api.toast).not.toHaveBeenCalled()
	w.unmount()
})
it('Settings excludes its own record for rename and discards a late save after closing or actor change', async () => {
	const w = mount(Categories, {
		attachTo: document.body,
		props: { label: 'Categories' },
		global: { mocks: { __: (s: string) => s }, provide: { $user: user } },
	})
	await w.get('[data-testid="edit"]').trigger('click')
	await flushPromises()
	expect(api.requests).toHaveLength(0)
	const input = document.querySelector(
		'[role="dialog"] input'
	) as HTMLInputElement
	input.value = 'existing'
	input.dispatchEvent(new Event('input', { bubbles: true }))
	await wait()
	expect(api.requests[0].params.filters).toContainEqual([
		'name',
		'!=',
		'Existing',
	])
	await finish(0)
	input.dispatchEvent(
		new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })
	)
	await flushPromises()
	expect(api.requests[1].params).toMatchObject({
		old_name: 'Existing',
		new_name: 'existing',
	})
	user.data = { name: 'other@example.test', sitename: 'qa' }
	await finish(1, 'existing')
	expect(api.toast).not.toHaveBeenCalled()
	w.unmount()
})
it('inline native Combobox checks beyond autocomplete, blocks double submit, preserves race errors and selects a successful category', async () => {
	const create = vi.fn()
	create
		.mockRejectedValueOnce({ messages: ['Duplicate category'] })
		.mockResolvedValueOnce('New')
	const w = mount(Link, {
		attachTo: document.body,
		props: {
			doctype: 'LMS Category',
			inlineCreate: true,
			categoryAvailability: true,
			onCreate: create,
		},
		global: { mocks: { __: (s: string) => s }, provide: { $user: user } },
	})
	const combo = w.findComponent({ name: 'Combobox' })
	combo.vm.$emit('update:open', true)
	await flushPromises()
	// The real combobox teleports its footer; inspect only that safe form subtree.
	const button = (label: string) =>
		Array.from(document.querySelectorAll('button')).find(
			(b) => b.getAttribute('aria-label') === label
		)!
	button('Create New').click()
	await flushPromises()
	const input = () =>
		document.querySelector(
			'[data-popover-footer-sticky] input'
		) as HTMLInputElement
	expect(input().getAttribute('aria-label')).toBe('Category name')
	input().value = 'New'
	input().dispatchEvent(new Event('input', { bubbles: true }))
	await wait()
	const read = api.requests.findIndex((r) => r.url === 'frappe.client.get_list')
	expect(read).toBeGreaterThanOrEqual(0)
	await finish(read)
	button('Create').click()
	button('Create').click()
	await flushPromises()
	expect(create).toHaveBeenCalledTimes(1)
	expect(input().value).toBe('New')
	expect(
		document.querySelector('[data-popover-footer-sticky]')?.textContent
	).toContain('Duplicate category')
	button('Create').click()
	await flushPromises()
	expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['New'])
	expect(api.toast).toHaveBeenCalledOnce()
	w.unmount()
})

it('blocks empty and over-limit Unicode names without a read and cancels inline results after close', async () => {
	const h = harness()
	const vm = h.vm as any
	vm.name = '😀'.repeat(141)
	await wait()
	expect(api.requests).toHaveLength(0)
	expect(vm.available).toBe(false)
	vm.name = '😀'.repeat(140)
	await wait()
	await finish(0)
	expect(vm.available).toBe(true)
	h.unmount()
	const create = vi.fn()
	let resolve!: (value: string) => void
	create.mockImplementation(
		() =>
			new Promise((done) => {
				resolve = done
			})
	)
	const w = mount(Link, {
		attachTo: document.body,
		props: {
			doctype: 'LMS Category',
			inlineCreate: true,
			categoryAvailability: true,
			onCreate: create,
		},
		global: { mocks: { __: (s: string) => s }, provide: { $user: user } },
	})
	w.findComponent({ name: 'Combobox' }).vm.$emit('update:open', true)
	await flushPromises()
	const button = (label: string) =>
		Array.from(document.querySelectorAll('button')).find(
			(b) => b.getAttribute('aria-label') === label
		)!
	button('Create New').click()
	await flushPromises()
	const input = document.querySelector(
		'[data-popover-footer-sticky] input'
	) as HTMLInputElement
	input.value = 'New'
	input.dispatchEvent(new Event('input', { bubbles: true }))
	await wait()
	await finish(
		api.requests.findIndex(
			(r, i) => i > 0 && r.url === 'frappe.client.get_list'
		)
	)
	input.dispatchEvent(
		new KeyboardEvent('keyup', { key: 'Enter', bubbles: true })
	)
	button('Create').click()
	await flushPromises()
	expect(create).toHaveBeenCalledTimes(1)
	w.unmount()
	resolve('New')
	await flushPromises()
	expect(w.emitted('update:modelValue')).toBeUndefined()
	expect(api.toast).not.toHaveBeenCalled()
})
