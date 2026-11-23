import { afterEach, beforeAll, afterAll, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import Link from '@/components/Controls/Link.vue'

vi.mock('frappe-ui', async (original) => {
	const native = await original<any>()
	return {
		...native,
		createResource: (options: any) =>
			native.createResource({
				...options,
				resourceFetcher: (request: any) =>
					request.url === 'frappe.desk.search.search_link'
						? Promise.resolve([{ label: 'Business', value: 'Business' }])
						: new Promise(() => {}),
			}),
	}
})
vi.mock('@/stores/settings', () => ({
	useSettings: () => ({ settings: { data: {} } }),
}))
enableAutoUnmount(afterEach)
const originalScroll = Element.prototype.scrollIntoView
beforeAll(() => {
	Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => {
	Element.prototype.scrollIntoView = originalScroll
})

async function open() {
	const onCreate = vi.fn()
	const w = mount(Link, {
		attachTo: document.body,
		props: {
			doctype: 'LMS Category',
			inlineCreate: true,
			categoryAvailability: true,
			onCreate,
		},
		global: {
			mocks: { __: (text: string) => text },
			provide: {
				$user: { data: { name: 'admin@example.test', sitename: 'qa' } },
			},
		},
	})
	const input = w.get('[role=combobox]')
	;(input.element as HTMLElement).focus()
	await input.trigger('keydown', { key: 'ArrowDown' })
	await flushPromises()
	await input.trigger('keydown', { key: 'ArrowDown' })
	await flushPromises()
	const create = [
		...document.querySelectorAll('[data-popover-footer-sticky] button'),
	].find(
		(x) => x.getAttribute('aria-label') === 'Create New'
	) as HTMLButtonElement
	expect(create).toBeTruthy()
	return { w, onCreate, create }
}

function enter(control: HTMLElement) {
	control.focus()
	const allowed = control.dispatchEvent(
		new KeyboardEvent('keydown', {
			key: 'Enter',
			code: 'Enter',
			bubbles: true,
			cancelable: true,
		})
	)
	// Native button Enter activation occurs on keydown. jsdom requires the default action explicitly.
	if (allowed && control instanceof HTMLButtonElement) control.click()
	control.dispatchEvent(
		new KeyboardEvent('keyup', {
			key: 'Enter',
			code: 'Enter',
			bubbles: true,
			cancelable: true,
		})
	)
}

it('native footer Enter opens creation without selecting the highlighted category', async () => {
	const { w, create, onCreate } = await open()
	enter(create)
	await flushPromises()
	expect(
		document.querySelector('[data-popover-footer-sticky] input')
	).toBeTruthy()
	expect(w.emitted('update:modelValue')).toBeUndefined()
	expect(onCreate).not.toHaveBeenCalled()
})

it('pending inline input Enter stays in creation without selecting an option or posting', async () => {
	const { w, create, onCreate } = await open()
	create.click()
	await flushPromises()
	const input = document.querySelector(
		'[data-popover-footer-sticky] input'
	) as HTMLInputElement
	expect(input).toBeTruthy()
	input.value = 'Pending name'
	input.dispatchEvent(new Event('input', { bubbles: true }))
	await flushPromises()
	enter(input)
	await flushPromises()
	expect(document.querySelector('[data-popover-footer-sticky] input')).toBe(
		input
	)
	expect(input.value).toBe('Pending name')
	expect(w.emitted('update:modelValue')).toBeUndefined()
	expect(onCreate).not.toHaveBeenCalled()
})
