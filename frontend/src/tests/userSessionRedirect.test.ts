import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usersStore } from '@/stores/user'

vi.mock('frappe-ui', () => ({
	createResource: (options) => ({ ...options, reset: vi.fn() }),
}))

const originalLocation = window.location
const assign = vi.fn()
beforeEach(() => {
	setActivePinia(createPinia())
	assign.mockClear()
	Object.defineProperty(window, 'location', {
		value: {
			pathname: '/lms/courses/details/C%20de%20Teste',
			search: '?tab=progress&fromLesson=1',
			assign,
		},
		configurable: true,
	})
	sessionStorage.clear()
})
afterEach(() => {
	Object.defineProperty(window, 'location', {
		value: originalLocation,
		configurable: true,
	})
	sessionStorage.clear()
})

it('returns AuthenticationError to the current route/query with an expiry explanation and preserves safe drafts', () => {
	const store = usersStore()
	const draftKey = 'lms:form-draft:student:profile'
	sessionStorage.setItem(draftKey, 'synthetic safe draft')
	store.userResource.onError({ exc_type: 'AuthenticationError' })
	expect(assign).toHaveBeenCalledOnce()
	const url = new URL(assign.mock.calls[0][0], 'https://example.test')
	expect(url.pathname).toBe('/login')
	expect(url.searchParams.get('redirect-to')).toBe(
		'/lms/courses/details/C%20de%20Teste?tab=progress&fromLesson=1',
	)
	expect(url.searchParams.get('session-expired')).toBe('1')
	expect(sessionStorage.getItem(draftKey)).toBe('synthetic safe draft')
	expect(store.userResource.reset).not.toHaveBeenCalled()
	expect(store.allUsers.reset).not.toHaveBeenCalled()
	expect(store.allUsers.url).toBe('lms.lms.api.get_all_users')
})

it.each([
	{ exc_type: 'ValidationError' },
	{ exc_type: 'PermissionError' },
	{ httpStatus: 500 },
	new Error('network unavailable'),
	null,
	undefined,
])('does not redirect unrelated errors %#', (error) => {
	usersStore().userResource.onError(error)
	expect(assign).not.toHaveBeenCalled()
})
