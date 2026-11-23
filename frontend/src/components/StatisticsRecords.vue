<template>
	<section class="space-y-3" :aria-label="__('Registros do indicador')">
		<div class="flex flex-wrap items-center gap-3">
			<h2 class="text-lg font-semibold text-ink-gray-9">{{ title }}</h2>
			<TextInput
				v-model="search"
				:debounce="300"
				:aria-label="__('Buscar registros')"
				:placeholder="__('Buscar por nome')"
			/>
			<Dropdown :options="exportOptions"
				><Button icon-left="lucide-download">{{
					__('Exportar conjunto filtrado')
				}}</Button></Dropdown
			>
		</div>
		<p class="text-p-base text-ink-gray-7">
			{{
				__(
					'O arquivo inclui todos os registros deste indicador com a busca e o período aplicados, na mesma ordem.'
				)
			}}
		</p>
		<LoadError v-if="records.error" :error="records.error" @retry="load" />
		<SkeletonLoader v-else-if="records.loading" />
		<div
			v-else
			class="overflow-auto"
			tabindex="0"
			:aria-label="__('Tabela de registros')"
		>
			<table class="w-full text-start text-[15px] text-ink-gray-9">
				<thead>
					<tr>
						<th
							v-for="column in columns"
							:key="column.key"
							class="border-b p-2 text-start"
							:aria-sort="
								sort === column.key
									? direction === 'asc'
										? 'ascending'
										: 'descending'
									: 'none'
							"
						>
							<Button variant="ghost" @click="toggleSort(column.key)"
								>{{ column.label
								}}<span
									v-if="sort === column.key"
									:class="
										direction === 'asc'
											? 'lucide-arrow-up'
											: 'lucide-arrow-down'
									"
									class="size-4"
									aria-hidden="true"
							/></Button>
						</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="row in records.data?.rows || []" :key="row.name">
						<td class="border-b p-2">{{ row.name }}</td>
						<td class="border-b p-2">
							<RouterLink
								v-if="metric === 'courses'"
								:to="{ name: 'CourseDetail', params: { courseName: row.name } }"
								class="underline"
								>{{ row.title }}</RouterLink
							><RouterLink
								v-else-if="row.username"
								:to="{ name: 'Profile', params: { username: row.username } }"
								class="underline"
								>{{ row.title }}</RouterLink
							><span v-else>{{ row.title }}</span>
						</td>
						<td class="border-b p-2">
							{{
								serverTime(row.creation)
									.tz('America/Sao_Paulo')
									.format('DD/MM/YYYY HH:mm')
							}}
						</td>
					</tr>
				</tbody>
			</table>
			<p v-if="records.data?.total === 0" class="py-4">
				{{ __('Nenhum registro com estes filtros.') }}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-3" aria-live="polite">
			<Button :disabled="!start || records.loading" @click="start -= 20">{{
				__('Anterior')
			}}</Button
			><span>{{
				records.data?.total
					? `${start + 1}–${Math.min(start + 20, records.data.total)} / ${
							records.data.total
					  }`
					: '0'
			}}</span
			><Button
				:disabled="start + 20 >= (records.data?.total || 0) || records.loading"
				@click="start += 20"
				>{{ __('Próxima') }}</Button
			>
		</div>
	</section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useReportResource } from '@/composables/useReportResource'
import { serverTime } from '@/utils/dayjs'
import { useRoute, useRouter } from 'vue-router'
import { Button, Dropdown, TextInput, toast } from 'frappe-ui'
import LoadError from '@/components/LoadError.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import { resourceErrorMessage } from '@/utils/resource'
import type { AnalyticsWindow } from '@/types'
const props = defineProps<{
	metric: string
	title: string
	period: AnalyticsWindow
}>()
const route = useRoute(),
	router = useRouter()
const search = ref(String(route.query.search || ''))
const sort = ref(
	['name', 'title', 'creation'].includes(String(route.query.sort))
		? String(route.query.sort)
		: 'creation'
)
const direction = ref(route.query.direction === 'asc' ? 'asc' : 'desc')
const start = ref(
	Math.max(
		0,
		Math.min(1000000, Math.trunc(Number(route.query.records_start) || 0))
	)
)
const records = useReportResource('lms.lms.statistics.get_statistics_records')
const params = () => ({
	from_date: props.period.from_date ?? '',
	to_date: props.period.to_date ?? '',
	metric: props.metric,
	search: search.value,
	sort: sort.value,
	direction: direction.value,
})
function load() {
	router.replace({
		query: {
			...route.query,
			metric: props.metric,
			search: search.value || undefined,
			sort: sort.value,
			direction: direction.value,
			records_start: start.value || undefined,
		},
	})

	return records
		.submit({ ...params(), start: start.value, page_length: 20 })
		.catch(() => undefined)
}
let firstLoad = true
watch(
	[() => props.period, () => props.metric, search, sort, direction],
	() => {
		if (!firstLoad) start.value = 0
		firstLoad = false

		load()
	},
	{ immediate: true }
)
watch(start, load)
function toggleSort(key: string) {
	direction.value =
		sort.value === key && direction.value === 'asc' ? 'desc' : 'asc'
	sort.value = key
}
const columns = computed(() => [
	{ key: 'name', label: __('Identificador') },
	{ key: 'title', label: __('Nome') },
	{ key: 'creation', label: __('Cadastro') },
])
const exportOptions = computed(() =>
	['xlsx', 'csv', 'pdf'].map((format) => ({
		label: format === 'xlsx' ? __('Excel') : format.toUpperCase(),
		onClick: () => runExport(format),
	}))
)
async function runExport(format: string) {
	try {
		const query = new URLSearchParams({ ...params(), file_format: format })
		const response = await fetch(
			`/api/method/lms.lms.statistics.export_statistics?${query}`,
			{ headers: { 'X-Frappe-CSRF-Token': window.csrf_token || '' } }
		)
		if (!response.ok)
			throw new Error(__('Não foi possível exportar. Tente novamente.'))
		const url = URL.createObjectURL(await response.blob()),
			link = document.createElement('a')
		link.href = url
		link.download = `${props.metric}.${format}`
		link.click()
		setTimeout(() => URL.revokeObjectURL(url), 1000)
	} catch (error) {
		toast.error(resourceErrorMessage(error))
	}
}
</script>
