<template>
	<form class="flex flex-col gap-4" @submit.prevent="save">
		<PasswordField
			v-model="password"
			:label="labels?.label || __('New password')"
		/>
		<PasswordRequirements
			:policy="policy"
			:requirements="requirements"
			:score="score"
			:breach="breach"
		/>
		<PasswordField
			v-model="confirm"
			:label="__('Confirm new password')"
			:error="mismatch ? __('The new passwords do not match.') : ''"
		/>
		<ErrorMessage :message="error || policyError" />
		<Button
			v-if="!saved"
			type="submit"
			variant="solid"
			:label="__('Save password and sign in')"
			:loading="saving"
			:disabled="saving || !valid || !confirm || mismatch"
		/>
		<Button
			v-else
			type="button"
			variant="solid"
			:label="__('Sign out and sign in')"
			:loading="saving"
			:disabled="saving"
			@click="endSession"
		/>
	</form>
</template>
<script setup>
import { Button, ErrorMessage, call } from 'frappe-ui'
import { computed, onUnmounted, ref } from 'vue'
import PasswordField from './PasswordField.vue'
import PasswordRequirements from './PasswordRequirements.vue'
import { usePasswordPolicy } from '@/composables/usePasswordPolicy'
defineProps({ labels: Object })
const password = ref(''),
	confirm = ref(''),
	saving = ref(false),
	error = ref('')
const saved = ref(false)
const {
	policy,
	requirements,
	score,
	breach,
	valid,
	error: policyError,
} = usePasswordPolicy(() => password.value)
const mismatch = computed(() =>
	Boolean(confirm.value && confirm.value !== password.value),
)
async function save() {
	if (saving.value || !valid.value || !confirm.value || mismatch.value) return
	saving.value = true
	try {
		await call('frappe.core.doctype.user.user.set_first_password', {
			new_password: password.value,
		})
		saved.value = true
		password.value = confirm.value = ''
		await endSession()
	} catch (e) {
		error.value =
			e.messages?.[0] ||
			__(
				'Could not save your password or end this session. Try again or sign out, then sign in with your new password.',
			)
	} finally {
		saving.value = false
	}
}
async function endSession() {
	saving.value = true
	try {
		await call('logout')
		window.location.assign('/login?password-updated=1')
	} catch {
		error.value = __(
			'Your password was saved. Retry signing out, then sign in with the new password.',
		)
	} finally {
		saving.value = false
	}
}
onUnmounted(() => {
	password.value = confirm.value = ''
})
</script>
