<template>
	<Button icon-left="lucide-calendar-days" @click="show = true">{{
		periodLabel(model)
	}}</Button>
	<Dialog v-model:open="show" :title="__('Selecionar período')" size="lg">
		<template #default>
			<div class="space-y-4">
				<FormControl
					v-model="preset"
					type="select"
					:label="__('Período')"
					:options="periodOptions()"
					@update:model-value="choose"
				/>
				<DateRangePicker
					v-model="dates"
					format="DD/MM/YYYY"
					:max="brazilDay()"
					:placeholder="__('Selecione ou digite as datas')"
					:aria-label="__('Intervalo em dias de Brasília')"
					@update:model-value="preset = 'custom'"
				/>
				<p class="text-p-base text-ink-gray-7">
					{{
						__(
							'Dias completos no horário de Brasília. O dia atual vai até a última atualização.'
						)
					}}
				</p>
				<ErrorMessage :message="error" />
			</div>
		</template>
		<template #actions>
			<Button @click="show = false">{{ __('Cancelar') }}</Button>
			<Button variant="solid" :disabled="Boolean(error)" @click="apply">{{
				__('Aplicar período')
			}}</Button>
		</template>
	</Dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
	Button,
	DateRangePicker,
	Dialog,
	ErrorMessage,
	FormControl,
} from 'frappe-ui'
import {
	brazilDay,
	periodError,
	periodLabel,
	periodOptions,
	periodWindow,
	type PeriodPreset,
} from '@/utils/period'
import type { AnalyticsWindow } from '@/types'
const model = defineModel<AnalyticsWindow>({ required: true })
const show = ref(false)
const preset = ref<PeriodPreset>('custom')
const dates = ref<string[]>([])
const draft = computed<AnalyticsWindow>(() =>
	preset.value === 'all'
		? { from_date: null, to_date: null }
		: { from_date: dates.value[0] || null, to_date: dates.value[1] || null }
)
const error = computed(() =>
	preset.value !== 'all' && dates.value.length < 2
		? __('Informe as duas datas completas e válidas.')
		: periodError(draft.value)
)
watch(show, (open) => {
	if (open) {
		dates.value = [model.value.from_date, model.value.to_date].filter(
			Boolean
		) as string[]
		preset.value = dates.value.length ? 'custom' : 'all'
	}
})
function choose() {
	const chosen = periodWindow(preset.value, draft.value)
	dates.value = [chosen.from_date, chosen.to_date].filter(Boolean) as string[]
}
function apply() {
	if (!error.value) {
		model.value = { ...draft.value }
		show.value = false
	}
}
</script>
