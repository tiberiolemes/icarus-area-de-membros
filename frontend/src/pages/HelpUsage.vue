<template>
	<main class="mx-auto w-full max-w-6xl space-y-5 p-5">
		<h1 class="text-2xl font-semibold">{{ __('Acompanhamento dos tours') }}</h1>
		<p>
			{{
				__(
					'Cada participação representa uma pessoa em uma página e revisão deste site. Concluir um tour não conclui curso ou avaliação.'
				)
			}}
		</p>
		<div data-tour="tour-report-filters" class="max-w-md">
			<FormControl
				type="select"
				:label="__('Página')"
				:options="options"
				v-model="page"
				@change="changePage"
			/>
		</div>
		<LoadError v-if="error" :error="error" @retry="load" />
		<p v-if="busy" role="status">{{ __('Carregando acompanhamento…') }}</p>
		<section v-if="data" data-tour="tour-report-results" class="space-y-4">
			<p>
				{{ __('Site') }}: {{ data.site }} · {{ __('Revisão') }}:
				{{ data.revision }}
			</p>
			<dl class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<div>
					<dt>{{ __('Participações') }}</dt>
					<dd>{{ data.summary.participations }}</dd>
				</div>
				<div>
					<dt>{{ __('Com conclusão registrada') }}</dt>
					<dd>
						{{ rate(data.summary.completed, data.summary.participations) }} ·
						{{ data.summary.completed }}/{{ data.summary.participations }}
					</dd>
				</div>
				<div>
					<dt>{{ __('Com pulo registrado') }}</dt>
					<dd>
						{{ rate(data.summary.skipped, data.summary.participations) }} ·
						{{ data.summary.skipped }}/{{ data.summary.participations }}
					</dd>
				</div>
				<div>
					<dt>{{ __('Avaliações respondidas') }}</dt>
					<dd>{{ data.summary.rated }}</dd>
				</div>
				<div>
					<dt>{{ __('Ajudou entre quem respondeu') }}</dt>
					<dd>
						{{ rate(data.summary.useful, data.summary.rated) }} ·
						{{ data.summary.useful }}/{{ data.summary.rated }}
					</dd>
				</div>
			</dl>
			<p>
				{{
					__(
						'Conclusão e pulo podem ocorrer em tentativas distintas da mesma pessoa. Ausência de avaliação não é uma resposta negativa. Fonte: registros nativos de acompanhamento do tour.'
					)
				}}
			</p>
			<p v-if="!data.rows.length">
				{{
					__(
						'Nenhum tour iniciado neste recorte. Use o passo a passo de uma tela para registrar uma participação real.'
					)
				}}
			</p>
			<div v-else class="overflow-x-auto">
				<table class="w-full text-left text-p-base">
					<caption class="sr-only">
						{{
							__('Acompanhamento individual autorizado')
						}}
					</caption>
					<thead>
						<tr>
							<th>{{ __('Pessoa') }}</th>
							<th>{{ __('Página') }}</th>
							<th>{{ __('Estado') }}</th>
							<th>{{ __('Inícios / conclusões / pulos') }}</th>
							<th>{{ __('Ajudou?') }}</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="row in data.rows" :key="row.member + row.page">
							<td>{{ row.member }}</td>
							<td>{{ row.page }}</td>
							<td>{{ __(row.status) }}</td>
							<td>
								{{ row.started_count }} / {{ row.completed_count }} /
								{{ row.skipped_count }}
							</td>
							<td>{{ row.helpful ? __(row.helpful) : __('Sem resposta') }}</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="flex gap-3">
				<Button :disabled="busy || offset === 0" @click="paginate(-25)">{{
					__('Anterior')
				}}</Button
				><Button
					:disabled="
						busy || offset + data.rows.length >= data.summary.participations
					"
					@click="paginate(25)"
					>{{ __('Próxima') }}</Button
				>
			</div>
		</section>
	</main>
</template>
<script setup lang="ts">
import { Button, call, FormControl } from 'frappe-ui'
import { inject, ref, watch, onBeforeUnmount } from 'vue'
import LoadError from '@/components/LoadError.vue'
import { catalogue } from '@/tours/definitions'

const user = inject<any>('$user')
const page = ref(''),
	offset = ref(0),
	data = ref<any>(null),
	error = ref<any>(null),
	busy = ref(false)
const options = [
	{ label: __('Todas as páginas'), value: '' },
	...Object.keys(catalogue.pages).map((value) => ({ label: value, value })),
]
let generation = 0
async function load() {
	const current = ++generation,
		actor = user?.data?.name
	data.value = null
	error.value = null
	busy.value = true
	try {
		const result = await call('lms.lms.tours.report', {
			page: page.value,
			offset: offset.value,
			page_length: 25,
		})
		if (current === generation && actor === user?.data?.name)
			data.value = result
	} catch (failure) {
		if (current === generation) error.value = failure
	} finally {
		if (current === generation) busy.value = false
	}
}
function changePage() {
	offset.value = 0
	void load()
}
function paginate(delta: number) {
	offset.value += delta
	void load()
}
function rate(numerator: number, denominator: number) {
	return denominator
		? `${new Intl.NumberFormat('pt-BR', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
		  }).format((numerator / denominator) * 100)}%`
		: __('Sem base')
}
watch(
	() => user?.data?.name,
	() => {
		generation++
		data.value = null
		void load()
	},
	{ immediate: true }
)
onBeforeUnmount(() => generation++)
</script>
