<template>
	<div class="mb-4 text-p-sm text-ink-gray-7" aria-live="polite">
		<template v-if="draft.pending.value">
			<p>
				{{
					__('Há um rascunho incompleto nesta aba. Ele ainda não foi enviado.')
				}}
			</p>
			<div class="mt-2 flex flex-wrap gap-2">
				<Button :label="__('Recuperar rascunho')" @click="draft.restore" />
				<Button :label="__('Descartar rascunho')" @click="draft.discard" />
			</div>
		</template>
		<template v-else-if="draft.dirty.value">
			{{
				draft.available.value
					? __('Rascunho incompleto salvo nesta aba. Ainda não enviado.')
					: __(
							'Alterações não salvas. Mantenha esta aba aberta e tente salvar novamente.',
						)
			}}
		</template>
		<template v-else-if="draft.confirmed.value">{{
			__('Salvamento confirmado pelo servidor.')
		}}</template>
	</div>
</template>
<script setup lang="ts">
import { Button } from 'frappe-ui'
import type { useFormDraft } from '@/composables/useFormDraft'
defineProps<{ draft: ReturnType<typeof useFormDraft> }>()
</script>
