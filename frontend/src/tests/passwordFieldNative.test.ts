import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import PasswordField from '@/components/Profile/PasswordField.vue'
import { testTranslate } from './setup'

it('uses the real native field/button with a working label, description and visibility target', async () => {
	const field = mount(PasswordField, {
		props: { label: 'New password', modelValue: '', error: 'Mismatch' },
		global: { mocks: { __: testTranslate } },
	})
	const input = field.get('input')
	expect(input.attributes('aria-invalid')).toBe('true')
	expect(field.get('label').attributes('for')).toBe(input.attributes('id'))
	expect(field.get('button').attributes('aria-controls')).toBe(
		input.attributes('id')
	)
	expect(field.get('[role="status"]').attributes('id')).toBe(
		input.attributes('aria-describedby')
	)
	await field.get('button').trigger('click')
	expect(input.attributes('type')).toBe('text')
	expect(field.get('button').attributes('aria-pressed')).toBe('true')
	field.unmount()
})

it('disables both the native input and reveal action while authorization is pending', async () => {
	const field = mount(PasswordField, {
		props: { label: 'Password', disabled: true },
		global: { mocks: { __: testTranslate } },
	})
	expect(field.get('input').attributes('disabled')).toBeDefined()
	expect(field.get('button').attributes('disabled')).toBeDefined()
	field.unmount()
})
