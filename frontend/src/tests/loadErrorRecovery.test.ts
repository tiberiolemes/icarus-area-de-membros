import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import LoadError from '@/components/LoadError.vue'

vi.mock('frappe-ui', () => ({
	Button: {
		props: ['label'],
		emits: ['click'],
		template: '<button @click="$emit(\'click\')">{{ label }}<slot /></button>',
	},
	Dialog: {
		props: ['open'],
		template:
			'<section v-if="open" role="dialog"><slot /><slot name="actions" /></section>',
	},
}))
enableAutoUnmount(afterEach)
const open = (error: unknown) =>
	mount(LoadError, {
		props: { error },
		global: { mocks: { __: (text: string) => text } },
	})

describe('load failures', () => {
	it('gives a retry and a sanitized report for server defects', async () => {
		const wrapper = open({ status: 500, messages: ['private details'] })
		await wrapper.findAll('button')[0].trigger('click')
		expect(wrapper.emitted('retry')).toHaveLength(1)
		await wrapper.findAll('button')[1].trigger('click')
		const report = wrapper.get('textarea').element as HTMLTextAreaElement
		expect(report.value).toContain('"status": 500')
		expect(report.value).not.toContain('private')
		const writeText = vi.fn().mockResolvedValue(undefined)
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText },
		})
		await wrapper.get('[role="dialog"] button').trigger('click')
		await flushPromises()
		expect(writeText).toHaveBeenCalledWith(report.value)
	})
	it('does not offer defect reporting/retry for a denied resource', () => {
		const wrapper = open({ status: 403 })
		expect(wrapper.findAll('button')).toHaveLength(0)
		expect(wrapper.text()).toContain('You do not have access to this')
	})
	it('retries only the read when the network returns and removes its listener on unmount', async () => {
		const onRetry = vi.fn()
		const wrapper = mount(LoadError, {
			props: { error: { name: 'TypeError' }, onRetry },
			global: { mocks: { __: (text: string) => text } },
		})
		window.dispatchEvent(new Event('online'))
		await flushPromises()
		expect(onRetry).toHaveBeenCalledTimes(1)
		wrapper.unmount()
		window.dispatchEvent(new Event('online'))
		expect(onRetry).toHaveBeenCalledTimes(1)
	})
})
