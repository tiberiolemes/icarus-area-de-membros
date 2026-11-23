<template>
	<Dialog
		v-model:open="open"
		:title="__('Novidades desta versão')"
		@close="dismiss"
	>
		<template #default>
			<div class="space-y-4 text-p-base leading-7 text-ink-gray-9">
				<p>
					{{
						__(
							'Arquivamento com histórico preservado, aprovação manual de comentários e comunidade com concessão administrativa.'
						)
					}}
				</p>
				<p>
					{{
						__(
							'A ajuda explica os novos fluxos, a retomada de edição e os pedidos sobre seus dados. O checkout continua para uma etapa futura.'
						)
					}}
				</p>
				<a
					href="/help#versao"
					v-external
					class="inline-flex min-h-11 items-center underline focus:focus-ring"
					>{{ __('Consultar as mudanças (nova aba)') }}</a
				>
			</div>
		</template>
		<template #actions
			><Button @click="dismiss">{{ __('Entendi') }}</Button></template
		>
	</Dialog>
</template>
<script setup lang="ts">
import { vExternal } from '@/directives/external'
import { Button, Dialog, call, toast } from 'frappe-ui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{ user: string }>()
const revision = 'icarus-quality-20261121-07'
const key = computed(() => `${props.user}:${revision}`)
const open = ref(false)
const seen = new Set<string>()
const savedSteps = ref<Array<{ name: string; completed: boolean }>>([])
const saving = ref(false)
let loading = false
watch(
	key,
	async () => {
		const actor = props.user
		loading = true
		open.value = false
		try {
			const status = await call('frappe.onboarding.get_onboarding_status')
			if (actor !== props.user) return
			savedSteps.value = status?.icarus_releases_onboarding_status || []
			open.value =
				Boolean(actor) &&
				!seen.has(key.value) &&
				!savedSteps.value.some(
					(step) => step.name === revision && step.completed
				)
		} catch {
			// Help remains available if release preferences cannot be loaded.
			toast.error(
				__(
					'Não foi possível carregar as novidades. Você pode consultar a ajuda.'
				)
			)
		} finally {
			loading = false
		}
	},
	{ immediate: true }
)
async function dismiss() {
	open.value = false
	if (saving.value || loading || seen.has(key.value)) return
	saving.value = true
	seen.add(key.value)
	try {
		await call('frappe.onboarding.update_user_onboarding_status', {
			appName: 'icarus_releases',
			steps: JSON.stringify([
				...savedSteps.value.filter((step) => step.name !== revision),
				{ name: revision, completed: true },
			]),
		})
	} catch {
		toast.error(
			__(
				'Não foi possível guardar sua preferência. O aviso pode aparecer no próximo acesso.'
			)
		)
	} finally {
		saving.value = false
	}
}
watch(open, (value, previous) => {
	if (previous && !value) dismiss()
})
</script>
