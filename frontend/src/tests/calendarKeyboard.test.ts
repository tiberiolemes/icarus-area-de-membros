import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { Calendar } from 'frappe-ui/experimental'
import dayjs from 'dayjs'
import { testTranslate } from './setup'

enableAutoUnmount(afterEach)
const scrollTo = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	'scrollTo'
)
const scrollBy = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	'scrollBy'
)
const title = 'QC08 avaliação çã 🎓 — nome completo'
beforeEach(() => {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	)
	vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		width: 900,
		height: 600,
		right: 900,
		bottom: 600,
		toJSON: () => ({}),
	})
	Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
		configurable: true,
		value: vi.fn(),
	})
	Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
		configurable: true,
		value: vi.fn(),
	})
})
afterEach(() => {
	for (const [key, descriptor] of [
		['scrollTo', scrollTo],
		['scrollBy', scrollBy],
	] as const) {
		if (descriptor)
			Object.defineProperty(HTMLElement.prototype, key, descriptor)
		else
			delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key]
	}
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

async function render(
	mode: 'Week' | 'Day' | 'Month' | 'Agenda',
	onClick = vi.fn()
) {
	const date = dayjs().format('YYYY-MM-DD')
	const event = {
		id: 'qc08-evaluation',
		title,
		fromDate: date,
		toDate: date,
		fromTime: '09:00',
		toTime: '09:30',
		color: 'blue',
	}
	const wrapper = mount(Calendar, {
		attachTo: document.body,
		props: {
			events: [event],
			config: { defaultMode: mode, isEditMode: false, enableShortcuts: false },
			onClick,
		},
		global: { mocks: { __: testTranslate } },
	})
	await flushPromises()
	const entry = wrapper
		.findAll('.event')
		.find((node) => node.text().includes(title))
	expect(entry, `native ${mode} event rendered`).toBeTruthy()
	return { wrapper, entry: entry!, onClick }
}

describe('native calendar evaluation access', () => {
	it.each(['Week', 'Day', 'Month', 'Agenda'] as const)(
		'%s opens exactly the selected event with Enter and Space',
		async (mode) => {
			const { wrapper, entry, onClick } = await render(mode)
			expect(entry.attributes('role')).toBe('button')
			expect(entry.attributes('tabindex')).toBe('0')
			expect(entry.text()).toContain(title)
			await entry.trigger('keydown', { key: 'Enter' })
			expect(onClick).toHaveBeenCalledTimes(1)
			expect(onClick.mock.calls[0][0].calendarEvent.id).toBe('qc08-evaluation')
			await entry.trigger('keydown', { key: ' ' })
			expect(onClick).toHaveBeenCalledTimes(2)
			await entry.trigger('keydown', { key: 'Escape' })
			expect(onClick).toHaveBeenCalledTimes(2)
			expect(wrapper.emitted('create')).toBeUndefined()
			expect(wrapper.emitted('update')).toBeUndefined()
			expect(wrapper.emitted('delete')).toBeUndefined()
		}
	)
})
