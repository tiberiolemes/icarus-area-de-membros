<template>
	<GuidedTour
		:key="actor"
		:page-key="resolvedPage"
		:request="requestForActor"
		:notify="notify"
	/>
</template>
<script setup lang="ts">
import { call, toast } from 'frappe-ui'
import { computed, inject } from 'vue'
import GuidedTour from '@/components/GuidedTour.vue'
const props = defineProps<{ pageKey?: string }>()
const tourPage = inject<any>('icarusTourPage', null)
const resolvedPage = computed(() => props.pageKey || tourPage?.value || '')
const user = inject<any>('$user', null)
const actor = computed(() => user?.data?.name || 'current')
const requestForActor = computed(() => {
	const identity = actor.value
	return (method: string, args: any) => {
		if (identity !== actor.value)
			return Promise.reject(new Error('Tour identity changed'))
		return call(method, args)
	}
})
const notify = (message: string) => toast.error(message)
</script>
