import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { clearFormDrafts, useFormDraft } from '@/composables/useFormDraft'

const scopes: ReturnType<typeof effectScope>[] = []
const create = (
	actor = ref('author'),
	form = 'course:one',
	access = ref(true),
) => {
	const scope = effectScope()
	scopes.push(scope)
	const values = reactive({ title: '', description: '' })
	const draft = scope.run(() =>
		useFormDraft({
			user: () => actor.value,
			form: () => form,
			canEdit: () => access.value,
			read: () => ({ ...values }),
			apply: (data) => Object.assign(values, data),
		}),
	)!
	return { draft, values, actor, scope, access }
}

beforeEach(() => sessionStorage.clear())
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()))

describe('safe incomplete drafts', () => {
	it('survives a failed save/unmount, requires explicit recovery and clears after confirmed success', async () => {
		const first = create()
		first.values.description =
			'An incomplete description, no required title yet'
		await nextTick()
		expect(first.draft.dirty.value).toBe(true)
		expect(first.draft.available.value).toBe(true)
		first.scope.stop()
		const reopened = create()
		expect(reopened.values.description).toBe('')
		expect(reopened.draft.pending.value?.description).toBe(
			first.values.description,
		)
		reopened.draft.restore()
		await nextTick()
		expect(reopened.values.description).toBe(first.values.description)
		expect(reopened.draft.dirty.value).toBe(true)
		reopened.draft.markSaved()
		expect(reopened.draft.confirmed.value).toBe(true)
		expect(sessionStorage.length).toBe(0)
	})
	it('never recovers another actor or form and clears the tab drafts on logout/revocation', async () => {
		const first = create()
		first.values.title = 'Mine'
		await nextTick()
		expect(create(ref('other')).draft.pending.value).toBeNull()
		expect(create(ref('author'), 'course:two').draft.pending.value).toBeNull()
		first.actor.value = ''
		expect(sessionStorage.length).toBe(0)
		const revoked = create()
		revoked.values.title = 'Revoked'
		await nextTick()
		revoked.access.value = false
		await nextTick()
		expect(sessionStorage.length).toBe(0)
	})
	it('does not apply unknown secrets, objects or expired values from storage', () => {
		const key = 'lms:form-draft:author:course%3Aone'
		sessionStorage.setItem(
			key,
			JSON.stringify({
				savedAt: Date.now(),
				fields: {
					title: 'Safe',
					description: { password: 'private' },
					token: 'private',
				},
			}),
		)
		const form = create()
		form.draft.restore()
		expect(form.values).toEqual({ title: 'Safe', description: '' })
		expect(form.values).not.toHaveProperty('token')
		form.scope.stop()
		sessionStorage.setItem(
			key,
			JSON.stringify({
				savedAt: Date.now() - 13 * 3600000,
				fields: { title: 'Expired' },
			}),
		)
		expect(create().draft.pending.value).toBeNull()
		expect(sessionStorage.length).toBe(0)
	})
	it('protects browser close, discards only on explicit choice and releases listeners on teardown', async () => {
		const form = create()
		form.values.title = 'Unsaved'
		await nextTick()
		const close = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(close)
		expect(close.defaultPrevented).toBe(true)
		form.draft.discard()
		expect(sessionStorage.length).toBe(0)
		expect(form.draft.dirty.value).toBe(false)
		form.scope.stop()
		const after = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(after)
		expect(after.defaultPrevented).toBe(false)
	})
	it('cleans drafts from forms no longer mounted', async () => {
		const form = create()
		form.values.title = 'Saved only in this tab'
		await nextTick()
		form.scope.stop()
		clearFormDrafts()
		expect(sessionStorage.length).toBe(0)
	})
})
