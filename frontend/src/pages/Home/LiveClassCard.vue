<template>
	<div class="mt-auto text-ink-gray-7">
		<div class="flex items-center gap-x-2">
			<span class="lucide-calendar size-4" />
			<span>
				{{ timing.date }}
			</span>
		</div>
		<div class="flex items-center gap-x-2">
			<span class="lucide-clock size-4" />
			<span> {{ timing.startTime }} – {{ timing.endTime }} </span>
		</div>
		<div
			v-if="timing.canJoin"
			class="flex items-center gap-x-2 text-ink-gray-9 mt-auto"
		>
			<a
				v-if="user.data?.is_moderator || user.data?.is_evaluator"
				:href="safeUrl(cls.start_url)"
				v-external
				class="cursor-pointer inline-flex items-center justify-center gap-2 transition-colors text-ink-gray-8 bg-surface-gray-2 hover:bg-surface-gray-3 active:bg-surface-gray-4 min-h-11 text-base px-2 rounded-4"
				:class="cls.join_url ? 'w-full' : 'w-1/2'"
			>
				<span class="lucide-monitor size-4" />
				{{ __('Start') }}
			</a>
			<a
				:href="safeUrl(cls.join_url)"
				v-external
				class="w-full cursor-pointer inline-flex items-center justify-center gap-2 transition-colors text-ink-gray-8 bg-surface-gray-2 hover:bg-surface-gray-3 active:bg-surface-gray-4 min-h-11 text-base px-2 rounded-4"
			>
				<span class="lucide-video size-4" />
				{{ __('Join') }}
			</a>
		</div>
		<Tooltip
			v-else-if="timing.ended"
			:text="__('This class has ended')"
			side="right"
		>
			<div class="flex items-center gap-x-2 w-fit" :class="endedClass">
				<span class="lucide-info size-4" />
				<span>
					{{ __('Ended') }}
				</span>
			</div>
		</Tooltip>
		<p class="mt-2 text-p-base text-ink-gray-7">
			{{ __('Horário de Brasília') }}
		</p>
		<Button
			v-if="timing.start"
			class="mt-2"
			variant="ghost"
			icon-left="lucide-calendar-plus"
			@click="addToCalendar"
			>{{ __('Adicionar à agenda') }}</Button
		>
	</div>
</template>
<script setup lang="ts">
import { computed, inject } from 'vue'
import { useNow } from '@vueuse/core'
import { Button, Tooltip } from 'frappe-ui'
import { safeUrl } from '@/utils/safeUrl'
import {
	liveClassTiming,
	liveClassCalendar,
	type LiveClassTiming,
} from '@/utils/liveClass'
const props = defineProps<{
	cls: LiveClassTiming & { start_url?: string }
	endedClass: string
}>()
const user = inject<any>('$user')
const now = useNow({ interval: 30000 })
const timing = computed(() => liveClassTiming(props.cls, now.value))
function addToCalendar() {
	const content = liveClassCalendar(props.cls)
	if (!content) return
	const url = URL.createObjectURL(
			new Blob([content], { type: 'text/calendar;charset=utf-8' })
		),
		link = document.createElement('a')
	link.href = url
	link.download = 'aula.ics'
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>
