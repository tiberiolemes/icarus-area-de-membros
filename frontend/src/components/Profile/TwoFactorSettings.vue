<template>
	<section class="space-y-4" :aria-label="__('Two-step verification')">
		<h3 class="text-base font-semibold">{{ __('Two-step verification') }}</h3>
		<p v-if="loading" role="status">{{ __('Loading account security…') }}</p>
		<template v-else-if="status">
			<p>
				{{
					status.enabled
						? __(
								'Authenticator enabled. Keep your recovery codes in a safe place.',
							)
						: __(
								'Add a code from your authenticator to protect your next sign-in.',
							)
				}}
			</p>
			<p v-if="status.enabled">
				{{ __('Unused recovery codes: {0}').format(status.recovery_remaining) }}
			</p>
			<form class="space-y-4" @submit.prevent="submit">
				<PasswordField
					v-if="!setup"
					v-model="password"
					:label="__('Current password')"
					autocomplete="new-password"
				/>
				<template v-if="setup">
					<p>
						{{
							__(
								'Add this setup key to your authenticator, then enter its current code. Setup expires in ten minutes.',
							)
						}}
					</p>
					<code class="block break-all select-all">{{ setup.secret }}</code>
				</template>
				<FormControl
					v-if="status.enabled || setup"
					v-model="otp"
					type="text"
					:label="__('Verification or recovery code')"
					autocomplete="one-time-code"
					required
				/>
				<Button
					type="submit"
					variant="solid"
					:loading="busy"
					:disabled="busy || status.required_by_site"
					:label="
						status.enabled
							? __('Disable two-step verification')
							: setup
								? __('Verify and enable')
								: __('Set up authenticator')
					"
				/>
			</form>
			<p v-if="status.required_by_site">
				{{
					__(
						'Your site requires two-step verification. Contact your administrator.',
					)
				}}
			</p>
			<template v-if="codes.length">
				<p role="status">
					{{
						__(
							'Save these ten single-use recovery codes now. They will not be shown again.',
						)
					}}
				</p>
				<ul class="space-y-1 select-all">
					<li v-for="code in codes" :key="code">
						<code>{{ code }}</code>
					</li>
				</ul>
				<Button :label="__('I saved my recovery codes')" @click="codes = []" />
			</template>
			<p>
				{{
					__(
						'You can trust a device for seven days after verifying a code at sign-in.',
					)
				}}
			</p>
		</template>
		<ErrorMessage :message="error" />
		<Button v-if="error && !status" :label="__('Try again')" @click="load" />
	</section>
</template>
<script setup>
import { Button, ErrorMessage, FormControl, call } from 'frappe-ui'
import { onMounted, onUnmounted, ref } from 'vue'
import PasswordField from './PasswordField.vue'
const status = ref(null)
const setup = ref(null)
const codes = ref([])
const password = ref('')
const otp = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
let disposed = false
async function load() {
	loading.value = true
	try {
		const data = await call('lms.lms.account_security.two_factor_status')
		if (!disposed) {
			status.value = data
			error.value = ''
		}
	} catch {
		if (!disposed)
			error.value = __('Could not load account security. Try again.')
	} finally {
		loading.value = false
	}
}
async function submit() {
	if (busy.value) return
	busy.value = true
	error.value = ''
	try {
		if (status.value.enabled) {
			await call('lms.lms.account_security.disable_two_factor', {
				password: password.value,
				otp: otp.value,
			})
			codes.value = []
			await load()
		} else if (setup.value) {
			const result = await call('lms.lms.account_security.enable_two_factor', {
				otp: otp.value,
			})
			if (!disposed) {
				codes.value = result.recovery_codes
				setup.value = null
				await load()
			}
		} else {
			const result = await call('lms.lms.account_security.begin_two_factor', {
				password: password.value,
			})
			if (!disposed) setup.value = result
		}
	} catch (e) {
		error.value =
			e.messages?.[0] ||
			__('Could not update account security. Check your code and try again.')
	} finally {
		password.value = otp.value = ''
		busy.value = false
	}
}
onMounted(load)
onUnmounted(() => {
	disposed = true
	password.value = otp.value = ''
	setup.value = null
	codes.value = []
})
</script>
