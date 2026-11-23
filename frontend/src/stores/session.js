import { defineStore } from 'pinia'
import { createResource } from 'frappe-ui'
import { usersStore } from './user'
import { forgetContinuePanelClosed } from '@/utils/continuePanel'
import { computed, reactive, ref } from 'vue'
import { clearFormDrafts } from '@/composables/useFormDraft'
import { clearVideoPositions } from '@/composables/useVideoPositions'

export const sessionStore = defineStore('lms-session', () => {
	let { userResource, allUsers } = usersStore()
	const brand = reactive({})

	function sessionUser() {
		let cookies = new URLSearchParams(document.cookie.split('; ').join('&'))
		let _sessionUser = cookies.get('user_id')
		if (_sessionUser === 'Guest') {
			_sessionUser = null
		} else {
			userResource.reload()
		}
		return _sessionUser
	}

	let user = ref(sessionUser())
	const isLoggedIn = computed(() => !!user.value)

	const logout = createResource({
		url: 'logout',
		beforeSubmit: clearVideoPositions,
		onSuccess() {
			clearFormDrafts()
			userResource.reset()
			allUsers.reset()
			user.value = null
			// A closed continue-your-course panel comes back on the next sign-in.
			forgetContinuePanelClosed()
			window.location.assign('/login?logged-out=1')
		},
	})

	const branding = createResource({
		url: 'lms.lms.api.get_branding',
		cache: 'brand',
		auto: true,
		onSuccess(data) {
			brand.name = data.app_name
			brand.logo = data.app_logo
			brand.favicon =
				data.favicon?.file_url || '/assets/lms/frontend/tiberio.svg'
		},
	})

	return {
		user,
		isLoggedIn,
		logout,
		brand,
		branding,
	}
})
