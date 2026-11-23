<template>
	<div class="w-full p-5">
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<h1 class="text-2xl-bold text-ink-gray-9">
					{{ __('Hey') }}, {{ user.data?.full_name }} 👋
				</h1>
				<div>
					<button
						v-if="view && !isAdmin"
						type="button"
						@click="showStreakModal = true"
						:aria-label="
							__('View learning streak: {0} days').format(
								view.streak.data?.current_streak || 0
							)
						"
						class="bg-surface-amber-2 px-2 py-1 rounded-5 cursor-pointer"
					>
						<span> 🔥 </span>
						<span class="text-ink-gray-9">
							{{ view.streak.data?.current_streak }}
						</span>
					</button>
				</div>
			</div>

			<div class="text-lg text-ink-gray-6 leading-6">
				{{ subtitle }}
			</div>
		</div>

		<div
			v-if="isHomeLoading"
			class="flex flex-1 items-center justify-center py-20"
		>
			<LoadingIndicator class="size-5 text-ink-gray-5" />
		</div>
		<p v-if="hasHomeError" role="alert" class="mt-4 text-p-base text-ink-red-4">
			{{ __('Failed to load data.') }}
		</p>
		<AdminHome
			v-if="view && !isHomeLoading && isAdmin"
			:key="view.key"
			:liveClasses="view.liveClasses"
			:evals="view.evals"
		/>
		<StudentHome
			v-else-if="view && !isHomeLoading"
			:key="view.key"
			:myLiveClasses="view.liveClasses"
		/>
	</div>
	<Streak
		v-if="view"
		:key="view.key"
		v-model="showStreakModal"
		:streakInfo="view.streak"
	/>
</template>
<script setup lang="ts">
import { computed, inject, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { call, createResource, LoadingIndicator, usePageMeta } from 'frappe-ui'
import { sessionStore } from '@/stores/session'
import StudentHome from '@/pages/Home/StudentHome.vue'
import AdminHome from '@/pages/Home/AdminHome.vue'
import Streak from '@/pages/Home/Streak.vue'

const user = inject<any>('$user')
const dayjs = inject<any>('$dayjs')
const { brand } = sessionStore()
const evalCount = ref(0)
const showStreakModal = ref(false)

const isAdmin = computed(() => {
	return (
		user.data?.is_moderator ||
		user.data?.is_instructor ||
		user.data?.is_evaluator
	)
})

type HomeView = {
	key: string
	liveClasses: ReturnType<typeof createResource>
	evals: ReturnType<typeof createResource>
	streak: ReturnType<typeof createResource>
}
const view = shallowRef<HomeView>()
const evalCountError = ref(false)
const identity = computed(() =>
	JSON.stringify([
		user.data?.name,
		Boolean(user.data?.is_instructor),
		Boolean(user.data?.is_moderator),
		Boolean(user.data?.is_evaluator),
	])
)

// Resource fetch reads and writes reactive state, so it must run outside a computed getter.
watch(
	identity,
	(key, _previous, onCleanup) => {
		view.value = undefined
		evalCount.value = 0
		evalCountError.value = false
		showStreakModal.value = false
		const actor = user.data?.name
		if (!actor) return
		const admin = isAdmin.value
		const current: HomeView = {
			key,
			liveClasses: createResource({
				url: admin
					? 'lms.lms.api.get_admin_live_classes'
					: 'lms.lms.api.get_my_live_classes',
				onError: () => {},
			}),
			evals: createResource({
				url: 'lms.lms.api.get_admin_evals',
				onError: () => {},
			}),
			streak: createResource({
				url: 'lms.lms.api.get_streak_info',
				onError: () => {},
			}),
		}
		view.value = current
		onCleanup(() => {
			current.liveClasses.abort()
			current.evals.abort()
			current.streak.abort()
		})
		// Native resources retain errors; a rejected old read must not raise a global toast.
		current.liveClasses.fetch().catch(() => {})
		current.streak.fetch().catch(() => {})
		if (admin) current.evals.fetch().catch(() => {})
		else
			call('frappe.client.get_count', {
				doctype: 'LMS Certificate Request',
				filters: {
					member: actor,
					status: 'Upcoming',
					date: ['>=', dayjs().format('YYYY-MM-DD')],
				},
			})
				.then((count: number) => {
					if (view.value === current) evalCount.value = count
				})
				.catch(() => {
					if (view.value === current) evalCountError.value = true
				})
	},
	{ immediate: true }
)
onScopeDispose(() => {
	view.value = undefined
})

const isHomeLoading = computed(() => {
	if (!view.value) return true
	return (
		(view.value.liveClasses.loading && !view.value.liveClasses.data) ||
		(isAdmin.value && view.value.evals.loading && !view.value.evals.data)
	)
})
const hasHomeError = computed(() =>
	Boolean(
		view.value &&
			(view.value.liveClasses.error ||
				view.value.streak.error ||
				(isAdmin.value && view.value.evals.error) ||
				evalCountError.value)
	)
)

const subtitle = computed(() => {
	if (!view.value) return ''
	if (isAdmin.value) {
		let liveClassSuffix =
			view.value.liveClasses.data?.length > 1
				? __('live classes')
				: __('live class')
		let evalSuffix =
			view.value.evals.data?.length > 1 ? __('evaluations') : __('evaluation')
		if (
			view.value.liveClasses.data?.length > 0 &&
			view.value.evals.data?.length > 0
		) {
			return __('You have {0} upcoming {1} and {2} {3} scheduled.').format(
				view.value.liveClasses.data.length,
				liveClassSuffix,
				view.value.evals.data.length,
				evalSuffix
			)
		} else if (view.value.liveClasses.data?.length > 0) {
			return __('You have {0} upcoming {1}.').format(
				view.value.liveClasses.data.length,
				liveClassSuffix
			)
		} else if (view.value.evals.data?.length > 0) {
			return __('You have {0} {1} scheduled.').format(
				view.value.evals.data.length,
				evalSuffix
			)
		}
		return __('Manage your courses and batches at a glance')
	} else {
		let liveClassSuffix =
			view.value.liveClasses.data?.length > 1
				? __('live classes')
				: __('live class')
		let evalSuffix = evalCount.value > 1 ? __('evaluations') : __('evaluation')
		if (view.value.liveClasses.data?.length > 0 && evalCount.value > 0) {
			return __('You have {0} upcoming {1} and {2} {3} scheduled.').format(
				view.value.liveClasses.data.length,
				liveClassSuffix,
				evalCount.value,
				evalSuffix
			)
		} else if (view.value.liveClasses.data?.length > 0) {
			return __('You have {0} upcoming {1}.').format(
				view.value.liveClasses.data.length,
				liveClassSuffix
			)
		} else if (evalCount.value > 0) {
			return __('You have {0} {1} scheduled.').format(
				evalCount.value,
				evalSuffix
			)
		}
		return __('Resume where you left off')
	}
})

usePageMeta(() => {
	return {
		title: __('Home'),
		icon: brand.favicon,
	}
})
</script>
