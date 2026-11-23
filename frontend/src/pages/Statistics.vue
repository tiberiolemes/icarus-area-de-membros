<template>
	<div class="">
		<PageHeader :breadcrumbs="breadcrumbs" />
		<div v-if="chartDetails.error || !chartDetails.data" class="p-5">
			<PeriodFilter v-model="period" />
		</div>
		<LoadError
			v-if="chartDetails.error && !chartDetails.data"
			:error="chartDetails.error"
			@retry="reloadResource(chartDetails)"
		/>
		<div
			v-else-if="chartDetails.loading && !chartDetails.data"
			class="flex flex-1 items-center justify-center p-5"
		>
			<LoadingIndicator class="size-5 text-ink-gray-5" />
		</div>
		<div v-else-if="chartDetails.data" class="p-5" data-tour="report">
			<LoadError
				v-if="chartDetails.error"
				:error="chartDetails.error"
				compact
				@retry="loadStatistics"
			/>
			<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
				<h1 class="text-xl font-semibold text-ink-gray-9">
					{{ __('Statistics') }}
				</h1>
				<PeriodFilter v-model="period" />
			</div>
			<p class="mb-3 text-p-base text-ink-gray-7">
				{{
					__(
						'O período filtra a criação dos registros. Conclusão mostra o estado atual da coorte de matrículas selecionada, não a data de conclusão.'
					)
				}}
			</p>
			<p class="mb-4 text-p-base text-ink-gray-7">
				{{ __('Atualizado em') }} {{ updatedAt }} ·
				{{ __('Horário de Brasília') }}
			</p>
			<div
				class="statistics-values grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4"
			>
				<button
					type="button"
					class="min-h-11 text-start focus-visible:outline focus-visible:outline-2"
					:aria-label="definitions.find((item) => item.key === 'courses').title"
					@click="metric = 'courses'"
				>
					<Tooltip
						:text="definitions.find((item) => item.key === 'courses').text"
					>
						<NumberCard
							:title="__('Courses')"
							:value="chartDetails.data.courses"
							:format="compactNumber"
						/>
					</Tooltip>
				</button>
				<button
					type="button"
					class="min-h-11 text-start focus-visible:outline focus-visible:outline-2"
					:aria-label="definitions.find((item) => item.key === 'users').title"
					@click="metric = 'users'"
				>
					<Tooltip
						:text="definitions.find((item) => item.key === 'users').text"
					>
						<NumberCard
							:title="__('Cadastros habilitados')"
							:value="chartDetails.data.users"
							:format="compactNumber"
						/>
					</Tooltip>
				</button>
				<button
					type="button"
					class="min-h-11 text-start focus-visible:outline focus-visible:outline-2"
					:aria-label="
						definitions.find((item) => item.key === 'enrollments').title
					"
					@click="metric = 'enrollments'"
				>
					<Tooltip
						:text="definitions.find((item) => item.key === 'enrollments').text"
					>
						<NumberCard
							:title="__('Enrollments')"
							:value="chartDetails.data.enrollments"
							:format="compactNumber"
						/>
					</Tooltip>
				</button>
				<button
					type="button"
					class="min-h-11 text-start focus-visible:outline focus-visible:outline-2"
					:aria-label="
						definitions.find((item) => item.key === 'completions').title
					"
					@click="metric = 'completions'"
				>
					<Tooltip
						:text="definitions.find((item) => item.key === 'completions').text"
					>
						<NumberCard
							:title="__('Matrículas concluídas')"
							:value="chartDetails.data.completions"
							:format="compactNumber"
						/>
					</Tooltip>
				</button>
				<button
					type="button"
					class="min-h-11 text-start focus-visible:outline focus-visible:outline-2"
					:aria-label="
						definitions.find((item) => item.key === 'certifications').title
					"
					@click="metric = 'certifications'"
				>
					<Tooltip
						:text="
							definitions.find((item) => item.key === 'certifications').text
						"
					>
						<NumberCard
							:title="__('Certificados publicados')"
							:value="chartDetails.data.certifications"
							:format="compactNumber"
						/>
					</Tooltip>
				</button>
			</div>
			<details class="my-4 text-p-base text-ink-gray-7">
				<summary>{{ __('Definições e comparação dos indicadores') }}</summary>
				<dl class="space-y-3 py-3">
					<div v-for="item in definitions" :key="item.key">
						<dt class="font-semibold">{{ item.title }}</dt>
						<dd>{{ item.text }} {{ comparison(item.key) }}</dd>
					</div>
				</dl>
			</details>
			<StatisticsRecords
				v-if="metric"
				:metric="metric"
				:title="metricTitle"
				:period="period"
				class="my-5"
			/>

			<div class="statistics-charts grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
				<ChartCard class="h-72">
					<LoadError
						v-if="signupsChart.error && !signupsChart.data"
						:error="signupsChart.error"
						compact
						@retry="reloadResource(signupsChart)"
					/>
					<SkeletonLoader
						v-else-if="signupsChart.loading && !signupsChart.data"
					/>
					<LineChart
						v-else-if="hasPoints(signupsChart.data)"
						:data="signupsChart.data"
						x="date"
						y="count"
						:title="__('Cadastros habilitados')"
						:subtitle="__('Signups per day')"
						:x-axis="{ type: 'time', timeGrain: 'day' }"
					/>
					<ChartEmptyState
						v-else-if="signupsChart.data"
						:title="__('Cadastros habilitados')"
						:subtitle="__('Signups per day')"
						:message="
							__(
								'New accounts on your site show up here, day by day, as people join.'
							)
						"
						icon="lucide-user-plus"
					/>
				</ChartCard>
				<ChartCard class="h-72">
					<LoadError
						v-if="enrollmentChart.error && !enrollmentChart.data"
						:error="enrollmentChart.error"
						compact
						@retry="reloadResource(enrollmentChart)"
					/>
					<SkeletonLoader
						v-else-if="enrollmentChart.loading && !enrollmentChart.data"
					/>
					<LineChart
						v-else-if="hasPoints(enrollmentChart.data)"
						:data="enrollmentChart.data"
						x="date"
						y="count"
						:title="__('Enrollments')"
						:subtitle="__('Enrollments per day')"
						:x-axis="{ type: 'time', timeGrain: 'day' }"
					/>
					<ChartEmptyState
						v-else-if="enrollmentChart.data"
						:title="__('Enrollments')"
						:subtitle="__('Enrollments per day')"
						:message="
							__(
								'Each time a learner joins one of your courses, it shows up here.'
							)
						"
						icon="lucide-book-open"
					/>
				</ChartCard>
				<ChartCard class="h-72">
					<LoadError
						v-if="certification.error && !certification.data"
						:error="certification.error"
						compact
						@retry="reloadResource(certification)"
					/>
					<SkeletonLoader
						v-else-if="certification.loading && !certification.data"
					/>
					<LineChart
						v-else-if="hasPoints(certification.data)"
						:data="certification.data"
						x="date"
						y="count"
						:title="__('Certificados publicados')"
						:subtitle="__('Certifications per day')"
						:x-axis="{ type: 'time', timeGrain: 'day' }"
					/>
					<ChartEmptyState
						v-else-if="certification.data"
						:title="__('Certificados publicados')"
						:subtitle="__('Certifications per day')"
						:message="
							__('Certificates your learners earn show up here, day by day.')
						"
						icon="lucide-badge-check"
					/>
				</ChartCard>
				<ChartCard class="h-72">
					<LoadError
						v-if="courseCompletion.error && !courseCompletion.data"
						:error="courseCompletion.error"
						compact
						@retry="reloadResource(courseCompletion)"
					/>
					<SkeletonLoader
						v-else-if="courseCompletion.loading && !courseCompletion.data"
					/>
					<DonutChart
						v-else-if="hasCompletions"
						:data="courseCompletion.data"
						category="label"
						value="value"
						:title="__('Matrículas concluídas')"
						:subtitle="__('Course Completion')"
						:center-label="__('Enrollments')"
					/>
					<ChartEmptyState
						v-else-if="courseCompletion.data"
						:title="__('Matrículas concluídas')"
						:subtitle="__('Course Completion')"
						:message="
							__(
								'When learners finish a course, you will see how many completed out of everyone enrolled.'
							)
						"
						icon="lucide-circle-check"
					/>
				</ChartCard>
			</div>
		</div>
	</div>
</template>
<script setup>
import { useReportResource } from '@/composables/useReportResource'
import { reloadResource } from '@/utils/resource'
import { LoadingIndicator, Tooltip, usePageMeta } from 'frappe-ui'
import { ChartCard, DonutChart, LineChart, NumberCard } from 'frappe-ui/charts'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PeriodFilter from '@/components/PeriodFilter.vue'
import StatisticsRecords from '@/components/StatisticsRecords.vue'
import { periodWindow, periodError, REPORT_TIMEZONE } from '@/utils/period'
import PageHeader from '@/components/Layouts/PageHeader.vue'
import LoadError from '@/components/LoadError.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import ChartEmptyState from '@/components/ChartEmptyState.vue'
import { compactNumber } from '@/utils/numberCardFormat'
import { sessionStore } from '../stores/session'

const { brand } = sessionStore()

const breadcrumbs = computed(() => {
	return [
		{
			label: __('Statistics'),
			route: {
				name: 'Statistics',
			},
		},
	]
})

const route = useRoute(),
	router = useRouter()
const initial = {
	from_date: String(route.query.from || ''),
	to_date: String(route.query.to || ''),
}
const period = ref(
	route.query.all === '1'
		? { from_date: null, to_date: null }
		: initial.from_date && !periodError(initial)
		? initial
		: periodWindow('month')
)
const metric = ref(
	['courses', 'users', 'enrollments', 'completions', 'certifications'].includes(
		route.query.metric
	)
		? route.query.metric
		: ''
)
const chartDetails = useReportResource(
	'lms.lms.statistics.get_statistics',
	(data) => ({ ...data.counts, ...data })
)

const loadStatistics = () => {
	return chartDetails
		.submit({
			from_date: period.value.from_date ?? '',
			to_date: period.value.to_date ?? '',
		})
		.catch(() => undefined)
}
let firstPeriod = true
watch(
	period,
	() => {
		router.replace({
			query: {
				...route.query,
				from: period.value.from_date || undefined,
				to: period.value.to_date || undefined,
				all: period.value.from_date ? undefined : '1',
			},
		})
		if (!firstPeriod) chartDetails.data = null
		firstPeriod = false
		loadStatistics()
	},
	{ immediate: true }
)
const chart = (key) =>
	reactive({
		get data() {
			return chartDetails.data?.series?.[key]
		},
		get error() {
			return chartDetails.error
		},
		get loading() {
			return chartDetails.loading
		},
		reload: loadStatistics,
	})
const signupsChart = chart('users')
const enrollmentChart = chart('enrollments')
const certification = chart('certifications')
const courseCompletion = reactive({
	get data() {
		const data = chartDetails.data
		return data
			? [
					{ label: 'Completed', value: data.completions },
					{
						label: 'In progress',
						value: Math.max(0, data.enrollments - data.completions),
					},
			  ]
			: null
	},
	get error() {
		return chartDetails.error
	},
	get loading() {
		return chartDetails.loading
	},
	reload: loadStatistics,
})
const updatedAt = computed(() =>
	chartDetails.data?.window?.updated_at
		? new Intl.DateTimeFormat('pt-BR', {
				timeZone: REPORT_TIMEZONE,
				dateStyle: 'short',
				timeStyle: 'short',
		  }).format(new Date(chartDetails.data.window.updated_at))
		: ''
)
const definitions = computed(() => [
	{
		key: 'courses',
		title: __('Cursos publicados'),
		text: __(
			'Cursos criados no período, publicados e não arquivados. Fonte: LMS Course.'
		),
	},
	{
		key: 'users',
		title: __('Cadastros habilitados'),
		text: __(
			'Contas criadas no período, habilitadas e sem Guest e Administrator. Não mede atividade. Fonte: User.'
		),
	},
	{
		key: 'enrollments',
		title: __('Matrículas'),
		text: __(
			'Matrículas criadas no período. Uma pessoa em dois cursos conta duas vezes. Fonte: LMS Enrollment.'
		),
	},
	{
		key: 'completions',
		title: __('Matrículas concluídas'),
		text: __(
			'Matrículas da mesma coorte com o currículo elegível concluído. Denominador: matrículas da coorte. Fonte: matrículas, currículo e progresso autorizados pelo servidor.'
		),
	},
	{
		key: 'certifications',
		title: __('Certificados publicados'),
		text: __(
			'Certificados criados no período e publicados. Não conta pessoas únicas. Fonte: LMS Certificate.'
		),
	},
])
const metricTitle = computed(
	() => definitions.value.find((item) => item.key === metric.value)?.title || ''
)
function comparison(key) {
	const value = chartDetails.data?.comparison?.[key]
	return value?.percent == null
		? __('Sem base de comparação')
		: new Intl.NumberFormat('pt-BR', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
				signDisplay: 'exceptZero',
		  }).format(value.percent) +
				'% ' +
				__('em relação ao período anterior de mesma duração')
}

// A flat line at zero says nothing on a new site, so it gives way to a
// sentence about what will show up there.
const hasPoints = (data) => Boolean(data?.some((point) => point.count > 0))

// A donut with zero completions conveys nothing, so it shows a sentence until
// at least one learner has completed a course.
const hasCompletions = computed(() => {
	const completed = courseCompletion.data?.find((d) => d.label === 'Completed')
	return (completed?.value || 0) > 0
})

usePageMeta(() => {
	return {
		title: __('Statistics'),
		icon: brand.favicon,
	}
})
</script>

<style scoped>
[data-theme='dark'] .statistics-charts {
	--chart-sequential-1: var(--dark-cyan-200);
}
</style>
