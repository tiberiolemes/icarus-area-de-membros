import { computed, onScopeDispose, ref, watch } from 'vue'
import { useDirtyGuard } from '@/composables/useDirtyGuard'

const PREFIX = 'lms:form-draft:'
const MAX_AGE = 12 * 60 * 60 * 1000
type Fields = Record<string, unknown>

// Session storage survives a refresh/401 in this tab; no credentials, private
// notes, integrations or arbitrary document payloads are accepted by callers.
export function useFormDraft(options: {
	user: () => string | undefined
	form: () => string
	read: () => Fields
	apply: (data: Fields) => void
	ready?: () => boolean
	canEdit?: () => boolean
}) {
	const key = computed(() =>
		options.user() && options.user() !== 'Guest'
			? `${PREFIX}${encodeURIComponent(options.user()!)}:${encodeURIComponent(options.form())}`
			: null,
	)
	const pending = ref<Fields | null>(null)
	const baseline = ref('')
	const available = ref(false)
	const confirmed = ref(false)
	let hadAccess = false
	const ready = () =>
		(options.ready?.() ?? true) && (options.canEdit?.() ?? true)
	const serialize = () => JSON.stringify(options.read())
	const dirty = computed(
		() => ready() && baseline.value !== '' && serialize() !== baseline.value,
	)
	const remove = (storageKey = key.value) => {
		try {
			if (storageKey) sessionStorage.removeItem(storageKey)
		} catch {
			/* storage can be disabled */
		}
	}
	const clear = () => {
		remove()
		pending.value = null
		available.value = false
	}
	const markSaved = () => {
		baseline.value = serialize()
		clear()
		confirmed.value = true
	}
	const discard = () => {
		clear()
		baseline.value = serialize()
	}
	const restore = () => {
		if (!pending.value || !ready()) return
		options.apply(pending.value)
		pending.value = null
	}
	const load = () => {
		pending.value = null
		available.value = false
		if (!key.value || !ready()) return
		try {
			const entry = JSON.parse(sessionStorage.getItem(key.value) || 'null')
			if (!entry) return
			if (
				!entry.savedAt ||
				Date.now() - entry.savedAt > MAX_AGE ||
				!entry.fields ||
				typeof entry.fields !== 'object'
			)
				return remove()
			// Only keys explicitly selected by the current form can be recovered.
			const current = options.read()
			const fields = Object.fromEntries(
				Object.keys(current)
					.filter((k) => {
						const value = entry.fields[k]
						if (!(k in entry.fields)) return false
						if (current[k] === null)
							return value === null || typeof value === 'string'
						return (
							typeof value === typeof current[k] &&
							(['string', 'boolean'].includes(typeof value) ||
								(typeof value === 'number' && Number.isFinite(value)))
						)
					})
					.map((k) => [k, entry.fields[k]]),
			)
			if (JSON.stringify(fields) !== serialize()) pending.value = fields
		} catch {
			remove()
		}
	}
	watch(
		[key, ready],
		([, isReady]) => {
			if (!isReady) {
				if (!key.value || (hadAccess && options.canEdit?.() === false)) clear()
				baseline.value = ''
				return
			}
			hadAccess = true
			baseline.value = serialize()
			confirmed.value = false
			load()
		},
		{ immediate: true, flush: 'post' },
	)
	watch(
		serialize,
		() => {
			if (!key.value || pending.value) return
			if (!dirty.value) {
				if (baseline.value) {
					remove()
					available.value = false
				}
				return
			}
			confirmed.value = false
			try {
				sessionStorage.setItem(
					key.value,
					JSON.stringify({ savedAt: Date.now(), fields: options.read() }),
				)
				available.value = true
			} catch {
				available.value = false
			}
		},
		{ flush: 'post' },
	)
	useDirtyGuard(() => dirty.value, discard)
	// Losing the actor/access revokes every draft in the tab, including forms
	// already unmounted. The global watcher is also installed by Dialogs.
	const stop = watch(
		options.user,
		(next, previous) => {
			if (previous && next !== previous) clearFormDrafts()
		},
		{ flush: 'sync' },
	)
	onScopeDispose(stop)
	return {
		pending,
		available,
		confirmed,
		dirty,
		restore,
		discard,
		clear,
		markSaved,
	}
}

export function clearFormDrafts(exceptUser?: string) {
	try {
		const keep = exceptUser
			? `${PREFIX}${encodeURIComponent(exceptUser)}:`
			: null
		for (const key of Object.keys(sessionStorage))
			if (key.startsWith(PREFIX) && (!keep || !key.startsWith(keep)))
				sessionStorage.removeItem(key)
	} catch {
		/* storage can be disabled */
	}
}
