<template>
	<div
		role="alert"
		class="flex w-full grow flex-col items-center justify-center gap-3 px-6 text-center"
		:class="compact ? 'min-h-24 py-4' : 'h-full min-h-64'"
	>
		<span
			v-if="!compact"
			class="size-7.5 text-ink-gray-6"
			:class="copy.icon"
			aria-hidden="true"
		/>
		<div class="flex flex-col items-center gap-1">
			<span
				:class="
					compact
						? 'text-sm-medium text-ink-gray-8'
						: 'text-lg-medium text-ink-gray-8'
				"
			>
				{{ copy.title }}
			</span>
			<span
				:class="
					compact ? 'text-p-sm text-ink-gray-6' : 'text-p-base text-ink-gray-6'
				"
			>
				{{ copy.description }}
			</span>
		</div>
		<Button
			v-if="canRetry(kind)"
			:label="__('Retry')"
			:size="compact ? 'sm' : 'md'"
			@click="emit('retry')"
		>
			<template #prefix>
				<span class="lucide-rotate-cw size-4" aria-hidden="true" />
			</template>
		</Button>
		<Button
			v-if="kind === 'server'"
			:label="__('Relatório')"
			@click="openReport"
		/>
		<Dialog
			v-model:open="showReport"
			:title="__('Relatório de falha')"
			size="lg"
		>
			<template #default>
				<p class="mb-3 text-p-sm text-ink-gray-7">
					{{
						__('Copie este relatório para informar a falha ao administrador.')
					}}
				</p>
				<textarea
					readonly
					:aria-label="__('Relatório de falha')"
					:value="report"
					class="w-full min-h-44 rounded-4 border border-outline-gray-2 bg-surface-base p-3 text-ink-gray-9"
				/>
				<p
					v-if="copyMessage"
					role="status"
					class="mt-2 text-p-sm text-ink-gray-7"
				>
					{{ copyMessage }}
				</p>
			</template>
			<template #actions>
				<Button :label="__('Copy')" @click="copyReport" />
				<Button :label="__('Close')" @click="showReport = false" />
			</template>
		</Dialog>
	</div>
</template>
<script setup lang="ts">
import { Button, Dialog } from 'frappe-ui'
import { failureReport } from '@/utils/failureReport'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { canRetry, loadErrorKind } from '@/utils/loadError'
import type { LoadErrorKind } from '@/utils/loadError'

const props = defineProps<{
	error: unknown
	compact?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const showReport = ref(false)
const report = ref('')
const copyMessage = ref('')
const openReport = () => {
	report.value = failureReport(props.error, online.value)
	copyMessage.value = ''
	showReport.value = true
}
const copyReport = async () => {
	try {
		await navigator.clipboard.writeText(report.value)
		copyMessage.value = __('Copied')
	} catch {
		copyMessage.value = __('Selecione o relatório e copie o texto.')
	}
}

const online = ref(navigator.onLine)
const kind = computed<LoadErrorKind>(() =>
	loadErrorKind(props.error, online.value),
)

const COPY = (): Record<
	LoadErrorKind,
	{ icon: string; title: string; description: string }
> => ({
	offline: {
		icon: 'lucide-wifi-off',
		title: __('You are offline'),
		description: __('This loads again once you are back online.'),
	},
	unreachable: {
		icon: 'lucide-cloud-off',
		title: __('Could not reach the server'),
		description: __('Check your connection and try again.'),
	},
	denied: {
		icon: 'lucide-lock',
		title: __('You do not have access to this'),
		description: __('Ask a moderator for access if you need it.'),
	},
	missing: {
		icon: 'lucide-search-x',
		title: __('This no longer exists'),
		description: __('It may have been deleted or renamed.'),
	},
	busy: {
		icon: 'lucide-hourglass',
		title: __('The server is busy'),
		description: __('Wait a moment and try again.'),
	},
	server: {
		icon: 'lucide-circle-alert',
		title: __('Failed to load'),
		description: __('Something went wrong on the server. Try again.'),
	},
})

const copy = computed(() => COPY()[kind.value])

// Back online after a network failure: load again without making them click.
const onOnline = (): void => {
	const wasNetwork = kind.value === 'offline' || kind.value === 'unreachable'
	online.value = true
	if (wasNetwork) emit('retry')
}
const onOffline = (): void => {
	online.value = false
}

onMounted(() => {
	window.addEventListener('online', onOnline)
	window.addEventListener('offline', onOffline)
})
onBeforeUnmount(() => {
	window.removeEventListener('online', onOnline)
	window.removeEventListener('offline', onOffline)
})
</script>
