<template>
	<div class="space-y-1.5">
		<FormControl
			v-model="value"
			:id="id"
			:type="visible ? 'text' : 'password'"
			:label="label"
			:autocomplete="autocomplete"
			:required="required"
			:disabled="disabled"
			:aria-describedby="error ? `${id}-error` : undefined"
			:aria-invalid="Boolean(error)"
		/>
		<Button
			type="button"
			variant="ghost"
			class="min-h-11 min-w-11"
			:aria-controls="id"
			:aria-pressed="visible"
			:disabled="disabled"
			:label="visible ? __('Hide password') : __('Show password')"
			@click="visible = !visible"
		/>
		<p
			v-if="error"
			:id="`${id}-error`"
			role="status"
			class="text-sm text-ink-red-8"
		>
			{{ error }}
		</p>
	</div>
</template>
<script setup>
import { Button, FormControl } from 'frappe-ui'
import { ref, useId } from 'vue'
const value = defineModel({ type: String, default: '' })
defineProps({
	label: String,
	autocomplete: { type: String, default: 'new-password' },
	required: { type: Boolean, default: true },
	error: String,
	disabled: { type: Boolean, default: false },
})
const id = useId()
const visible = ref(false)
</script>
