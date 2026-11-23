<template>
	<div class="shrink-0">
		<nav
			:aria-label="__('Ajuda e informações')"
			class="flex shrink-0 flex-wrap gap-x-5 border-b border-outline-gray-2 px-5 text-p-base text-ink-gray-7"
		>
			<a
				:href="
					safeUrl(
						`/help#${tourFor(pageKey)?.article || helpArticle(route.name)}`
					)
				"
				v-external
				class="inline-flex min-h-11 items-center underline focus:focus-ring"
			>
				{{ __('Ajuda desta tela (nova aba)') }}
			</a>
			<a
				href="/privacy"
				v-external
				class="inline-flex min-h-11 items-center underline focus:focus-ring"
			>
				{{ __('Privacidade (nova aba)') }}
			</a>
			<router-link
				v-if="user?.is_moderator || user?.is_system_manager"
				:to="{ name: 'HelpUsage' }"
				class="inline-flex min-h-11 items-center underline"
				>{{ __('Acompanhamento dos tours') }}</router-link
			>
		</nav>
		<TourHost
			v-if="user?.name && user.name !== 'Guest' && !inlineHost && allowed"
			:key="user.name"
			:page-key="pageKey"
			class="px-5"
		/>
	</div>
</template>
<script setup lang="ts">
import { vExternal } from '@/directives/external'
import { safeUrl } from '@/utils/safeUrl'
import { useRoute } from 'vue-router'
import { helpArticle } from '@/utils/help'
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { tourFor } from '@/tours/definitions'
import TourHost from '@/components/TourHost.vue'
const props = defineProps<{ user?: any }>()
const context = ref(''),
	inlineHost = ref(false)
const pageKey = computed(() =>
	tourFor(context.value) ? context.value : String(route.name || '')
)
const allowed = computed(() => {
	const audience = tourFor(pageKey.value)?.audience
	return (
		audience === 'signed' ||
		(audience === 'author' &&
			(props.user?.is_instructor || props.user?.is_moderator)) ||
		(audience === 'manager' && props.user?.is_system_manager) ||
		(audience === 'community_admin' &&
			(props.user?.is_system_manager || props.user?.is_moderator))
	)
})
let observer: MutationObserver | undefined
onMounted(() => {
	const update = () => {
		const visible = (node: Element) =>
			node.getClientRects().length &&
			!node.closest('[aria-hidden="true"], [inert]')
		context.value =
			[...document.querySelectorAll('[data-tour-context]')]
				.filter(visible)
				.at(-1)
				?.getAttribute('data-tour-context') || ''
		if (
			!context.value &&
			[...document.querySelectorAll('[data-tour-empty-list]')].some(visible)
		)
			context.value = `${String(route.name || '')}:empty`
		inlineHost.value = [
			...document.querySelectorAll('[data-icarus-tour-inline]'),
		].some(visible)
	}
	observer = new MutationObserver(update)
	observer.observe(document.body, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: [
			'data-tour-context',
			'data-icarus-tour-inline',
			'aria-hidden',
			'inert',
		],
	})
	update()
})
onBeforeUnmount(() => observer?.disconnect())

const route = useRoute()
</script>
