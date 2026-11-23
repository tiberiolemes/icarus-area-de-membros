<template>
	<Dialog
		v-model:open="open"
		:title="__('Change password')"
		size="sm"
		@after-leave="reset"
	>
		<form class="flex flex-col gap-4" @submit.prevent="save">
			<PasswordField
				v-model="current"
				:label="__('Current password')"
				autocomplete="current-password"
				required
			/>
			<PasswordField
				v-model="next"
				:label="__('New password')"
				autocomplete="new-password"
				required
				:error="
					samePassword ? __('New password cannot be same as old password') : ''
				"
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
				autocomplete="new-password"
				required
				:error="mismatch ? __('The new passwords do not match.') : ''"
			/>
			<ErrorMessage :message="error || policyError" />
			<div class="flex flex-col gap-3">
				<Button
					type="submit"
					variant="solid"
					:label="__('Update password')"
					:loading="saving"
					:disabled="!canSave"
				/>
				<Button
					v-if="user.data?.name !== 'Administrator'"
					variant="ghost"
					size="sm"
					class="self-center text-ink-gray-6"
					:label="
						resetSent
							? __('Request another password link')
							: __('Forgot it? Email me a reset link')
					"
					:disabled="sendingReset"
					:loading="sendingReset"
					@click="sendReset"
				/>
			</div>
			<p v-if="resetSent" role="status" class="text-sm text-ink-gray-7">
				{{
					__(
						'Request accepted. If email delivery is available, check your inbox. Otherwise, contact the site administrator.',
					)
				}}
			</p>
		</form>
		<TwoFactorSettings v-if="open" class="mt-6 border-t pt-4" />
	</Dialog>
</template>

<script setup>
import { Button, Dialog, ErrorMessage, call, toast } from 'frappe-ui'
import { computed, inject, ref } from 'vue'
import PasswordField from './PasswordField.vue'
import PasswordRequirements from './PasswordRequirements.vue'
import TwoFactorSettings from './TwoFactorSettings.vue'
import { usePasswordPolicy } from '@/composables/usePasswordPolicy'

const open = defineModel('open', { type: Boolean, default: false })

const user = inject('$user')

const current = ref('')
const next = ref('')
const confirm = ref('')
const error = ref('')
const saving = ref(false)
const sendingReset = ref(false)
const resetSent = ref(false)
const {
	policy,
	requirements,
	score,
	breach,
	valid,
	error: policyError,
} = usePasswordPolicy(() => next.value)
const mismatch = computed(() =>
	Boolean(confirm.value && next.value !== confirm.value),
)
const samePassword = computed(() =>
	Boolean(next.value && next.value === current.value),
)

const canSave = computed(
	() =>
		current.value &&
		confirm.value &&
		valid.value &&
		!mismatch.value &&
		!samePassword.value &&
		!saving.value,
)

function reset() {
	current.value = ''
	next.value = ''
	confirm.value = ''
	error.value = ''
	resetSent.value = false
}

async function save() {
	if (saving.value) return
	if (!canSave.value) return
	error.value = ''
	if (next.value !== confirm.value) {
		error.value = __('The new passwords do not match.')
		return
	}
	saving.value = true
	try {
		await call('frappe.core.doctype.user.user.update_password', {
			old_password: current.value,
			new_password: next.value,
		})
		toast.success(__('Your password is updated'))
		open.value = false
	} catch (e) {
		error.value =
			e.messages?.[0] || __('Could not update your password. Please try again.')
	} finally {
		saving.value = false
	}
}

async function sendReset() {
	if (sendingReset.value) return
	error.value = ''
	sendingReset.value = true
	try {
		await call('frappe.core.doctype.user.user.reset_password', {
			user: user.data?.name,
		})
		resetSent.value = true
	} catch (e) {
		error.value =
			e.messages?.[0] || __('Could not send the reset link. Please try again.')
	} finally {
		sendingReset.value = false
	}
}
</script>
