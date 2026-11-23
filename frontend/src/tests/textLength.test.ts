import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { FormControl } from 'frappe-ui'
import { describe, expect, it, vi } from 'vitest'
import { textLengthInfo } from '@/utils/textLength'

vi.stubGlobal('__', (text: string) => text)
String.prototype.format = function (...args: unknown[]) {
	return this.replace(/\{(\d+)\}/g, (_match: string, index: number) =>
		String(args[index])
	)
}

describe('native finite text limits', () => {
	it.each([
		[null, 0],
		['', 0],
		['Olá', 3],
		['😀'.repeat(140), 140],
		['e\u0301', 2],
	])('counts %s by the same Unicode code points as Frappe', (value, length) => {
		expect(textLengthInfo(value, 140)).toBe(`${length} of 140 characters`)
	})
	it('keeps over-limit text intact and explains the limit before submission', async () => {
		const value = ref('')
		const wrapper = mount(
			defineComponent({
				setup: () => () =>
					h(
						FormControl,
						{
							label: 'Native title',
							modelValue: value.value,
							'onUpdate:modelValue': (next: string) => {
								value.value = next
							},
							description: textLengthInfo(value.value, 140),
							error: 'Existing validation remains visible',
							required: true,
						},
						{ description: () => textLengthInfo(value.value, 140) }
					),
			})
		)
		const input = wrapper.get('input')
		const text = '😀'.repeat(141)
		await input.setValue(text)
		expect(value.value).toBe(text)
		expect(wrapper.text()).toContain(
			'141 of 140 characters. Shorten this text before saving.'
		)
		expect(wrapper.text()).toContain('Existing validation remains visible')
		const descriptions = input.attributes('aria-describedby').split(' ')
		expect(
			descriptions.some((id) =>
				wrapper.find(`[id="${id}"]`).text().includes('141 of 140')
			)
		).toBe(true)
		expect(input.attributes('aria-invalid')).toBe('true')
		wrapper.unmount()
	})
})
