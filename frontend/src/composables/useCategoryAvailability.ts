import { computed, inject, onScopeDispose, ref, watch } from 'vue'
import { createResource } from 'frappe-ui'

// Only the administrative LMS Category field; native filtered reads retain its permissions/collation.
export function useCategoryAvailability(
	name: () => string,
	active: () => boolean,
	exclude: () => string | null = () => null
) {
	const user = inject<any>('$user', null)
	const state = ref<'idle' | 'checking' | 'duplicate' | 'available' | 'error'>(
		'idle'
	)
	let resource: ReturnType<typeof createResource> | undefined
	let generation = 0
	const identity = computed(() =>
		JSON.stringify([
			user?.data?.name,
			user?.data?.sitename,
			name().trim(),
			active(),
			exclude(),
		])
	)
	const canCheck = () =>
		active() &&
		!!name().trim() &&
		Array.from(name().trim()).length <= 140 &&
		!!user?.data?.name &&
		user.data.name !== 'Guest'
	const check = () => {
		const key = identity.value
		const token = ++generation
		resource?.abort()
		if (!canCheck()) {
			state.value = 'idle'
			return
		}
		state.value = 'checking'
		const filters: unknown[][] = [['category', '=', name().trim()]]
		if (exclude()) filters.push(['name', '!=', exclude()])
		resource = createResource({
			url: 'frappe.client.get_list',
			params: {
				doctype: 'LMS Category',
				fields: ['name'],
				filters,
				limit_page_length: 1,
			},
			onSuccess(data: unknown) {
				if (token !== generation || key !== identity.value) return
				state.value =
					Array.isArray(data) &&
					data.every((row) => row && typeof row.name === 'string')
						? data.length
							? 'duplicate'
							: 'available'
						: 'error'
			},
			onError() {
				if (token === generation && key === identity.value)
					state.value = 'error'
			},
		})
		return resource.reload().catch(() => {})
	}
	watch(
		identity,
		(_value, _previous, onCleanup) => {
			generation++
			resource?.abort()
			state.value = canCheck() ? 'checking' : 'idle'
			const timer = canCheck() ? setTimeout(check, 300) : undefined
			onCleanup(() => {
				clearTimeout(timer)
				generation++
				resource?.abort()
			})
		},
		{ immediate: true, flush: 'sync' }
	)
	onScopeDispose(() => {
		generation++
		resource?.abort()
	})
	const message = computed(
		() =>
			({
				checking: __('Checking category name...'),
				duplicate: __('A category with this name already exists.'),
				available: __('No other category has this name.'),
				error: __('Could not check this category. Try again.'),
				idle: '',
			}[state.value] || '')
	)
	return {
		state,
		identity,
		message,
		available: computed(() => state.value === 'available'),
		check,
	}
}
