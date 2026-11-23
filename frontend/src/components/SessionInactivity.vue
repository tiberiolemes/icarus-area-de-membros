<template>
	<Dialog
		:open="warning || Boolean(expired)"
		:title="
			expired ? __('Sign in to continue') : __('Your session will expire soon')
		"
		:message="message"
		:dismissible="false"
		:show-close-button="false"
		@update:open="() => {}"
	>
		<template #actions>
			<div class="space-y-4">
				<Button
					v-if="expired !== 'expired'"
					variant="solid"
					:loading="busy"
					:disabled="busy"
					:label="__('Continue session')"
					@click="continueSession"
				/>
				<Button
					v-if="!expired"
					:loading="busy"
					:disabled="busy"
					:label="__('Sign out now')"
					@click="signOut"
				/>
				<Button
					v-if="expired"
					data-session-sign-in
					:label="__('Sign in again')"
					@click="signIn"
				/>
			</div>
		</template>
	</Dialog>
</template>
<script setup>
import { Button, Dialog, call } from 'frappe-ui'
import { computed, inject, nextTick, onUnmounted, ref, watch } from 'vue'
import { monitorInactivity } from '@/utils/inactivity'
import { loginUrl } from '@/utils/login'
import { sessionStore } from '@/stores/session'
const session = sessionStore()
const socket = inject('$socket', null)
const props = defineProps({ actor: String })
const remaining = ref(0)
const warning = ref(false)
const expired = ref('')
const networkError = ref(false)
const busy = ref(false)
const message = computed(() =>
	[
		expired.value === 'expired'
			? __(
					'Your session ended after inactivity or was revoked. Sign in again to resume safely.',
				)
			: expired.value === 'unverified'
				? __(
						'We could not verify your session. Reconnect and try to continue, or sign in again.',
					)
				: __(
						'Your session ends in {0} seconds. Continue if you are still here.',
					).format(remaining.value),
		__(
			'Safe form drafts stay in this tab for the same account. Passwords and verification codes are never saved as drafts.',
		),
		networkError.value
			? __('Could not reach the server. Check your connection and try again.')
			: '',
	]
		.filter(Boolean)
		.join(' '),
)
let monitor
watch(
	() => props.actor,
	(actor, previousActor) => {
		monitor?.stop()
		monitor = null
		if (previousActor && previousActor !== actor) {
			socket?.disconnect()
			if (actor && actor !== 'Guest') socket?.connect()
		}
		warning.value = false
		expired.value = ''
		networkError.value = false
		if (!actor || actor === 'Guest') return
		monitor = monitorInactivity({
			actor,
			request: (active) =>
				call('lms.lms.account_security.session_status', { active }),
			onState: (seconds, show) => {
				remaining.value = seconds
				warning.value = show
			},
			onExpired: (reason) => {
				expired.value = reason
				socket?.disconnect()
				for (const video of document.querySelectorAll('video')) video.pause()
				nextTick(() =>
					document.querySelector('[data-session-sign-in]')?.focus(),
				)
			},
			onError: () => {
				networkError.value = true
			},
		})
	},
	{ immediate: true },
)
async function continueSession() {
	if (busy.value) return
	busy.value = true
	try {
		if (await monitor?.continue()) {
			expired.value = ''
			warning.value = false
			networkError.value = false
			if (socket && !socket.connected) socket.connect()
		}
	} finally {
		busy.value = false
	}
}
function signIn() {
	// Intentional navigation to the native login document, keeping only a local return path.
	window.location.assign(`${loginUrl()}&session-expired=1`)
}
async function signOut() {
	if (busy.value) return
	busy.value = true
	try {
		await session.logout.submit()
	} catch {
		networkError.value = true
	} finally {
		busy.value = false
	}
}
onUnmounted(() => monitor?.stop())
</script>
