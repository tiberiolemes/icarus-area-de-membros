import { mount, flushPromises } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import FirstPasswordStep from '@/components/Profile/FirstPasswordStep.vue'
import { testTranslate } from './setup'
const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@/composables/usePasswordPolicy', () => ({
	usePasswordPolicy: (value) => ({
		policy: ref({ minimum: 8, maximum: 128 }),
		requirements: ref({}),
		score: ref(4),
		breach: ref('clear'),
		valid: computed(() => value().length >= 8),
		error: ref(''),
	}),
}))
vi.mock('@/components/Profile/PasswordRequirements.vue', () => ({
	default: { template: '<div />' },
}))
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
beforeEach(() => {
	call.mockReset()
	vi.stubGlobal('__', testTranslate)
})
it('shows mismatch immediately and a programmatic submit cannot bypass it', async () => {
	const form = mount(FirstPasswordStep, {
		global: { mocks: { __: testTranslate } },
	})
	await form.findAll('input')[0].setValue('Public-fixture-A9!')
	await form.findAll('input')[1].setValue('different')
	expect(form.text()).toContain('The new passwords do not match.')
	await form.get('form').trigger('submit')
	expect(call).not.toHaveBeenCalled()
	form.unmount()
})
it('clears credentials after saving and retries a failed logout without resubmitting the password', async () => {
	call.mockImplementation((method) =>
		method === 'logout'
			? Promise.reject(new Error('offline'))
			: Promise.resolve(),
	)
	const form = mount(FirstPasswordStep, {
		global: { mocks: { __: testTranslate } },
	})
	for (const input of form.findAll('input'))
		await input.setValue('Public-fixture-A9!')
	await form.get('form').trigger('submit')
	await flushPromises()
	expect(form.text()).toContain('Your password was saved.')
	expect(
		form
			.findAll('input')
			.every((input) => (input.element as HTMLInputElement).value === ''),
	).toBe(true)
	await form
		.findAll('button')
		.find((button) => button.text() === 'Sign out and sign in')!
		.trigger('click')
	await flushPromises()
	expect(
		call.mock.calls.filter(([method]) => method.endsWith('set_first_password')),
	).toHaveLength(1)
	expect(
		call.mock.calls.filter(([method]) => method === 'logout'),
	).toHaveLength(2)
	form.unmount()
})
