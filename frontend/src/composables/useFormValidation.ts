import { computed, ref } from 'vue'

export type FieldErrors = Record<string, string>

// Native controls own their labels, error text and ARIA. This only decides
// when their existing error prop becomes visible.
export function useFormValidation(check: () => FieldErrors) {
	const touched = ref(new Set<string>())
	const submitted = ref(false)
	const errors = computed(() => {
		if (!submitted.value && !touched.value.size) return {}
		return Object.fromEntries(
			Object.entries(check()).filter(
				([field]) => submitted.value || touched.value.has(field),
			),
		)
	})
	const touch = (field: string) => touched.value.add(field)
	const validate = () => {
		submitted.value = true
		return Object.keys(check()).length === 0
	}
	const reset = () => {
		touched.value = new Set()
		submitted.value = false
	}
	return { errors, touch, validate, reset }
}

export const hasContent = (value: unknown): boolean =>
	typeof value === 'string'
		? Boolean(
				value
					.replace(/<[^>]*>/g, '')
					.replace(/&nbsp;/g, ' ')
					.trim() || /<img\b/i.test(value),
			)
		: Array.isArray(value)
			? value.length > 0
			: value != null && value !== ''

export function requiredFields(
	values: Record<string, unknown>,
	labels: Record<string, string>,
): FieldErrors {
	return Object.fromEntries(
		Object.entries(labels)
			.filter(([key]) => !hasContent(values[key]))
			.map(([key, label]) => [
				key,
				__('Add a {0} before saving.').format(label),
			]),
	)
}
