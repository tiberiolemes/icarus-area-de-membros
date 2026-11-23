import { mount, flushPromises, config } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
	checkBreach,
	passwordRequirements,
} from '../../../lms/public/js/password_policy.js'
import PasswordField from '@/components/Profile/PasswordField.vue'
import { usePasswordPolicy } from '@/composables/usePasswordPolicy'
import { testTranslate } from './setup'

const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({
	call,
	Button: { props: ['label'], template: '<button>{{ label }}</button>' },
	FormControl: {
		props: ['modelValue', 'label', 'id', 'type', 'autocomplete'],
		emits: ['update:modelValue'],
		template:
			'<label :for="id">{{ label }}<input :id="id" :value="modelValue" :type="type" :autocomplete="autocomplete" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>',
	},
}))
beforeEach(() => {
	vi.useFakeTimers()
	vi.stubGlobal('__', testTranslate)
	config.global.mocks.__ = testTranslate
	call.mockReset()
})
afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

describe('shared password field', () => {
	it('keeps each field visibility independent and exposes keyboard button state and target', async () => {
		const first = mount(PasswordField, {
			props: { label: 'New', modelValue: 'test', autocomplete: 'new-password' },
		})
		const second = mount(PasswordField, {
			props: { label: 'Confirm', modelValue: 'test' },
		})
		expect(first.get('button').attributes('type')).toBe('button')
		expect(first.get('button').attributes('aria-controls')).toBe(
			first.get('input').attributes('id'),
		)
		expect(first.get('input').attributes('autocomplete')).toBe('new-password')
		await first.get('button').trigger('click')
		expect(first.get('input').attributes('type')).toBe('text')
		expect(first.get('button').attributes('aria-pressed')).toBe('true')
		expect(second.get('input').attributes('type')).toBe('password')
		await first.get('button').trigger('click')
		expect(first.get('button').attributes('aria-pressed')).toBe('false')
		first.unmount()
		second.unmount()
	})
})

describe('breach range protocol', () => {
	it('sends five uppercase hex characters without password, suffix, cookies or referrer', async () => {
		const value = 'Public-fixture-A9!'
		const full = Buffer.from(
			await webcrypto.subtle.digest('SHA-1', new TextEncoder().encode(value)),
		)
			.toString('hex')
			.toUpperCase()
		const fetcher = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => `${full.slice(5)}:12\r\n${'0'.repeat(35)}:0`,
		})
		expect(
			await checkBreach(value, { fetcher, cryptoProvider: webcrypto }),
		).toBe('compromised')
		const [url, init] = fetcher.mock.calls[0]
		expect(url).toBe(`https://api.pwnedpasswords.com/range/${full.slice(0, 5)}`)
		expect(JSON.stringify([url, init])).not.toContain(value)
		expect(url).not.toContain(full.slice(5))
		expect(init).toMatchObject({
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			headers: { 'Add-Padding': 'true' },
		})
	})
	it('treats zero-count padding as clear and malformed/offline responses honestly', async () => {
		const opts = { cryptoProvider: webcrypto, fetcher: vi.fn() }
		opts.fetcher.mockResolvedValue({
			ok: true,
			text: async () => `${'0'.repeat(35)}:0`,
		})
		expect(await checkBreach('Fixture-A9!', opts)).toBe('clear')
		opts.fetcher.mockResolvedValue({
			ok: true,
			text: async () => 'service not ready',
		})
		expect(await checkBreach('Fixture-A9!', opts)).toBe('unavailable')
		opts.fetcher.mockRejectedValue(new Error('offline'))
		expect(await checkBreach('Fixture-A9!', opts)).toBe('unavailable')
	})
	it('implements all five criteria, Unicode length and the effective maximum', () => {
		expect(
			Object.values(passwordRequirements('Valid-A9!')).every(Boolean),
		).toBe(true)
		expect(passwordRequirements('lowercase').upper).toBe(false)
		expect(passwordRequirements('UPPER123 ').symbol).toBe(false)
		expect(passwordRequirements('Ab1!' + '😀'.repeat(4))).toMatchObject({
			length: true,
		})
		expect(
			passwordRequirements('Valid-A9!', { minimum: 12, maximum: 128 }).length,
		).toBe(false)
		expect(passwordRequirements('Valid-A9!'.repeat(20)).length).toBe(false)
	})
})

it('debounces checks, blocks submit while pending, permits unavailable breach service, ignores stale results and disposes', async () => {
	vi.stubGlobal('crypto', {
		subtle: { digest: async () => new Uint8Array(20).buffer },
	})
	vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
	call.mockImplementation((method) =>
		method.endsWith('password_policy')
			? Promise.resolve({
					minimum: 8,
					maximum: 128,
					score_enabled: true,
					minimum_score: 2,
				})
			: Promise.resolve({
					score: 4,
					feedback: { password_policy_validation_passed: true },
				}),
	)
	const password = ref('')
	let policy: ReturnType<typeof usePasswordPolicy>
	const host = mount(
		defineComponent({
			setup() {
				policy = usePasswordPolicy(() => password.value)
				return () => h('div')
			},
		}),
	)
	await flushPromises()
	password.value = 'Valid-fixture-A9!'
	await flushPromises()
	password.value = 'Other-fixture-A9!'
	await flushPromises()
	await vi.advanceTimersByTimeAsync(399)
	expect(policy!.valid.value).toBe(false)
	expect(
		call.mock.calls.filter(([m]) => m.endsWith('test_password_strength')),
	).toHaveLength(0)
	await vi.advanceTimersByTimeAsync(1)
	await flushPromises()
	expect(policy!.breach.value).toBe('unavailable')
	expect(policy!.valid.value).toBe(true)
	password.value = 'tiny'
	await flushPromises()
	expect(policy!.valid.value).toBe(false)
	host.unmount()
	await vi.advanceTimersByTimeAsync(1000)
	expect(
		call.mock.calls.filter(([m]) => m.endsWith('test_password_strength')),
	).toHaveLength(1)
})
