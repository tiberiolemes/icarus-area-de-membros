import { computed, onScopeDispose, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import {
	checkBreach,
	defaultPolicy,
	passwordRequirements,
} from '../../../lms/public/js/password_policy.js'

export function usePasswordPolicy(password: () => string) {
	const policy = ref({
		...defaultPolicy,
		score_enabled: true,
		minimum_score: 2,
	})
	const loaded = ref(false)
	const error = ref('')
	const breach = ref('empty')
	const score = ref<number | null>(null)
	const scorePassed = ref(false)
	let generation = 0
	let timer: ReturnType<typeof setTimeout>
	call('lms.lms.account_security.password_policy')
		.then((value) => {
			policy.value = value
			loaded.value = true
			check()
		})
		.catch(() => {
			error.value = __(
				'Could not load the password policy. Close and try again.',
			)
		})
	const requirements = computed(() =>
		passwordRequirements(password(), policy.value),
	)
	function check() {
		const current = ++generation
		clearTimeout(timer)
		score.value = null
		scorePassed.value = false
		if (!password() || !loaded.value) {
			breach.value = 'empty'
			return
		}
		breach.value = 'pending'
		timer = setTimeout(async () => {
			const value = password()
			const [range, strength] = await Promise.allSettled([
				checkBreach(value),
				call('frappe.core.doctype.user.user.test_password_strength', {
					new_password: value,
				}),
			])
			if (generation !== current) return
			breach.value = range.status === 'fulfilled' ? range.value : 'unavailable'
			if (strength.status === 'fulfilled') {
				score.value = strength.value?.score ?? null
				scorePassed.value =
					!policy.value.score_enabled ||
					Boolean(strength.value?.feedback?.password_policy_validation_passed)
				error.value = ''
			} else
				error.value = __(
					'Could not check password strength. Edit the password to retry.',
				)
		}, 400)
	}
	watch(password, check, { immediate: true })
	onScopeDispose(() => {
		generation++
		clearTimeout(timer)
	})
	const valid = computed(
		() =>
			loaded.value &&
			Object.values(requirements.value).every(Boolean) &&
			scorePassed.value &&
			['clear', 'unavailable'].includes(breach.value),
	)
	return { policy, requirements, score, breach, valid, error }
}
