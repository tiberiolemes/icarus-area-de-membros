<template>
	<div class="space-y-2 text-sm" aria-live="polite">
		<ul class="space-y-1">
			<li
				v-for="(label, key) in labels"
				:key="key"
				:class="requirements[key] ? 'text-ink-green-8' : 'text-ink-gray-7'"
			>
				{{ requirements[key] ? __('Met') : __('Required') }}: {{ label }}
			</li>
		</ul>
		<label :for="id">{{ __('Password strength') }}: {{ strength }}</label>
		<progress :id="id" :value="score ?? 0" max="4" class="w-full" />
		<p>{{ breachText }}</p>
	</div>
</template>
<script setup>
import { computed, useId } from 'vue'
const props = defineProps({
	requirements: Object,
	policy: Object,
	breach: String,
	score: Number,
})
const id = useId()
const labels = computed(() => ({
	length: __('Between {0} and {1} characters').format(
		props.policy.minimum,
		props.policy.maximum,
	),
	upper: __('One uppercase letter (A-Z)'),
	lower: __('One lowercase letter (a-z)'),
	number: __('One number (0-9)'),
	symbol: __('One symbol (not whitespace)'),
}))
const strength = computed(() =>
	props.score == null
		? __('Not checked yet')
		: props.score < 2
			? __('Weak')
			: props.score < 4
				? __('Medium')
				: __('Strong'),
)
const breachText = computed(
	() =>
		({
			pending: __('Checking public breaches…'),
			clear: __('Not found in the consulted public breaches.'),
			compromised: __(
				'This password appeared in a public breach. Choose another password.',
			),
			unavailable: __(
				'Breach checking is unavailable. You can continue with the local policy.',
			),
		})[props.breach] ||
		__('Breach checking sends only a five-character hash prefix.'),
)
</script>
