import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import TwoFactorSettings from '@/components/Profile/TwoFactorSettings.vue'
import { testTranslate } from './setup'
const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({
	call,
	Button: {
		props: ['label', 'disabled'],
		template: '<button :disabled="disabled">{{ label }}</button>',
	},
	ErrorMessage: { props: ['message'], template: '<p>{{ message }}</p>' },
	FormControl: {
		props: ['modelValue', 'type'],
		emits: ['update:modelValue'],
		template:
			'<input :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
	},
}))
it('updates enrollment/recovery/disable in place and clears the critical proof even when rejected', async () => {
	let enabled = false,
		rejectDisable = true
	const recovery = 'ab'.repeat(10)
	call.mockImplementation((method) => {
		if (method.endsWith('two_factor_status'))
			return Promise.resolve({
				enabled,
				required_by_site: false,
				recovery_remaining: enabled ? 10 : 0,
			})
		if (method.endsWith('begin_two_factor'))
			return Promise.resolve({ secret: 'SYNTHETIC-SETUP-KEY' })
		if (method.endsWith('enable_two_factor')) {
			enabled = true
			return Promise.resolve({ recovery_codes: [recovery] })
		}
		if (method.endsWith('disable_two_factor')) {
			if (rejectDisable)
				return Promise.reject({
					messages: ['Incorrect verification or recovery code.'],
				})
			enabled = false
			return Promise.resolve({ enabled: false })
		}
	})
	const form = mount(TwoFactorSettings, {
		global: { mocks: { __: testTranslate } },
	})
	await flushPromises()
	expect(form.get('input').attributes('autocomplete')).toBe('new-password')
	await form.get('input').setValue('Public-fixture-A9!')
	await form.get('form').trigger('submit')
	await flushPromises()
	expect(form.text()).toContain('SYNTHETIC-SETUP-KEY')
	await form.get('input').setValue('123456')
	await form.get('form').trigger('submit')
	await flushPromises()
	expect(form.text()).toContain('Authenticator enabled.')
	expect(form.text()).toContain(recovery)
	for (const input of form.findAll('input')) await input.setValue('wrong-proof')
	await form.get('form').trigger('submit')
	await flushPromises()
	expect(
		form
			.findAll('input')
			.every((input) => (input.element as HTMLInputElement).value === ''),
	).toBe(true)
	rejectDisable = false
	await form.findAll('input')[0].setValue('Public-fixture-A9!')
	await form.findAll('input')[1].setValue(recovery)
	await form.get('form').trigger('submit')
	await flushPromises()
	expect(form.text()).toContain('Add a code from your authenticator')
	expect(form.text()).not.toContain(recovery)
	form.unmount()
})
