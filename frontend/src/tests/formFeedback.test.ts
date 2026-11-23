import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick, reactive, ref } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { FormControl } from 'frappe-ui'
import FormFeedback from '@/components/FormFeedback.vue'
import {
	requiredFields,
	useFormValidation,
} from '@/composables/useFormValidation'

enableAutoUnmount(afterEach)

const mountForm = () =>
	mount(
		defineComponent({
			components: { FormControl, FormFeedback },
			setup() {
				const values = reactive({ title: '', details: '' })
				const feedback = ref<InstanceType<typeof FormFeedback>>()
				const validation = useFormValidation(() =>
					requiredFields(values, { title: 'Title', details: 'Details' }),
				)
				const save = () => {
					if (!validation.validate()) feedback.value?.focusFirst()
				}
				return { ...validation, values, feedback, save }
			},
			template: `<FormFeedback ref="feedback" :errors="errors" @field-blur="touch">
		<FormControl v-model="values.title" label="Title" data-field="title" :error="errors.title" required />
		<FormControl v-model="values.details" label="Details" data-field="details" :error="errors.details" required />
		<button @click="save">Save</button>
	</FormFeedback>`,
		}),
		{
			attachTo: document.body,
			global: { mocks: { __: (text: string) => text } },
		},
	)

describe('field validation with the native controls', () => {
	it('validates on leaving a field and clears text and ARIA as it is corrected', async () => {
		const form = mountForm()
		const input = form.get('input[data-field="title"]')
		expect(form.find('[data-form-error-summary]').exists()).toBe(false)
		await input.trigger('focusout')
		expect(input.attributes('aria-invalid')).toBe('true')
		const errorId = input.attributes('aria-describedby')
		expect(document.getElementById(errorId!)?.textContent).toContain(
			'Add a Title before saving.',
		)
		await input.setValue('A title')
		expect(input.attributes('aria-invalid')).not.toBe('true')
		expect(form.find('[data-form-error-summary]').exists()).toBe(false)
	})
	it('lists all errors, focuses the first invalid input and lets the summary focus another', async () => {
		const form = mountForm()
		await form.get('button:last-child').trigger('click')
		await nextTick()
		expect(form.get('[data-form-error-summary]').attributes('tabindex')).toBe(
			'-1',
		)
		expect(form.get('[data-form-error-summary]').text()).toContain('Details')
		expect(document.activeElement).toBe(
			form.get('input[data-field="title"]').element,
		)
		await form.findAll('[data-form-error-summary] button')[1].trigger('click')
		expect(document.activeElement).toBe(
			form.get('input[data-field="details"]').element,
		)
		await form.get('input[data-field="title"]').setValue('Ready')
		expect(form.get('[data-form-error-summary]').text()).not.toContain(
			'Add a Title',
		)
	})
})
