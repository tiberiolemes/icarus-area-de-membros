import { defineStore } from 'pinia'
import { createResource } from 'frappe-ui'
import { loginUrl } from '@/utils/login'

export const usersStore = defineStore('lms-users', () => {
	let userResource = createResource({
		url: 'lms.lms.api.get_user_info',
		onError(error) {
			if (error && error.exc_type === 'AuthenticationError') {
				window.location.assign(`${loginUrl()}&session-expired=1`)
			}
		},
	})

	// The people a discussion may mention; reloaded per lesson or batch, so no
	// shared cache key.
	const allUsers = createResource({
		url: 'lms.lms.api.get_all_users',
	})

	return {
		userResource,
		allUsers,
	}
})
