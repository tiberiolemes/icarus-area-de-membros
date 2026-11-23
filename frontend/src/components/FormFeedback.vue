<template>
	<div ref="root" data-tour="authoring-form" @focusout="onBlur">
		<div
			v-if="Object.keys(errors).length"
			tabindex="-1"
			role="alert"
			class="mb-4 rounded-5 border border-outline-red-2 bg-surface-red-1 p-3 text-ink-red-4"
			data-form-error-summary
		>
			<p class="font-medium">
				{{ __('Confira os campos abaixo antes de salvar.') }}
			</p>
			<ul class="mt-2 list-disc space-y-1 ps-5">
				<li v-for="(message, field) in errors" :key="field">
					<button
						type="button"
						class="text-start underline focus-visible:ring-2 focus-visible:ring-outline-gray-5"
						@click="focusField(field)"
					>
						{{ message }}
					</button>
				</li>
			</ul>
		</div>
		<slot />
	</div>
</template>
<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { FieldErrors } from '@/composables/useFormValidation'

const props = defineProps<{ errors: FieldErrors }>()
const emit = defineEmits<{ 'field-blur': [field: string] }>()
const root = ref<HTMLElement>()
const onBlur = (event: FocusEvent) => {
	const field = (event.target as HTMLElement)?.closest<HTMLElement>(
		'[data-field]',
	)
	if (field && !field.contains(event.relatedTarget as Node))
		emit('field-blur', field.dataset.field!)
}
const focusField = (field: string) => {
	const group = [
		...(root.value?.querySelectorAll<HTMLElement>('[data-field]') ?? []),
	].find((el) => el.dataset.field === field)
	const target = group?.matches(
		'input,textarea,select,button,[contenteditable="true"]',
	)
		? group
		: group?.querySelector<HTMLElement>(
				'input,textarea,select,[contenteditable="true"],button,[tabindex="0"]',
			)
	let section = target?.closest('details')
	while (section) {
		section.open = true
		section = section.parentElement?.closest('details') ?? null
	}
	target?.focus()
}
const focusFirst = async () => {
	await nextTick()
	focusField(Object.keys(props.errors)[0])
}
defineExpose({ focusFirst })
</script>
