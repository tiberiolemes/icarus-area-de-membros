<template>
	<div v-if="definition || error" class="icarus-tour">
		<p v-if="error && !open" role="alert">{{ error }}</p>
		<Button
			v-if="definition"
			ref="trigger"
			@click="launch"
			:loading="busy"
			:disabled="busy"
			>{{ __('Passo a passo desta tela') }}</Button
		>
		<section
			v-if="open && definition"
			ref="panel"
			tabindex="-1"
			class="tour-panel"
			:aria-label="__('Tour desta tela')"
			@keydown.esc.stop.prevent="close"
		>
			<div class="tour-heading">
				<h2>{{ __('Guia de operação') }}</h2>
				<Button @click="close" :aria-label="__('Fechar e retomar depois')">{{
					__('Fechar')
				}}</Button>
			</div>
			<p v-if="error" role="alert">{{ error }}</p>
			<template
				v-if="state.status === 'Completed' || state.status === 'Skipped'"
			>
				<p>
					{{
						state.status === 'Completed'
							? __(
									'Você concluiu este tour. Isso não conclui uma aula nem salva o formulário.'
							  )
							: __('Você pulou este tour. Pode retomá-lo depois.')
					}}
				</p>
				<fieldset>
					<legend>{{ __('Este tour te ajudou?') }}</legend>
					<Button :disabled="busy" @click="rate(1)">{{ __('Sim') }}</Button>
					<Button :disabled="busy" @click="rate(0)">{{ __('Não') }}</Button>
					<p v-if="state.helpful" role="status">
						{{ __('Avaliação registrada.') }}
					</p>
				</fieldset>
				<Button :disabled="busy" @click="restart">{{
					__('Rever desde o início')
				}}</Button>
			</template>
			<template v-else-if="state.status === 'In Progress'">
				<p aria-live="polite">
					{{
						__('Passo {0} de {1}').format(
							stepIndex + 1,
							definition.steps.length
						)
					}}
				</p>
				<p>{{ __(definition.steps[stepIndex].text) }}</p>
				<p v-if="missing" role="status">
					{{
						__(
							'O controle explicado não está disponível neste estado. Abra o painel necessário, aguarde o carregamento ou retome depois. Nenhum passo foi concluído.'
						)
					}}
				</p>
				<div class="tour-actions">
					<Button @click="locate" :disabled="busy">{{
						__('Mostrar na tela')
					}}</Button>
					<Button @click="back" :disabled="busy || stepIndex === 0">{{
						__('Voltar')
					}}</Button>
					<Button
						@click="advance"
						:disabled="busy || missing"
						:loading="busy"
						aria-keyshortcuts="Alt+ArrowRight"
						>{{
							stepIndex === definition.steps.length - 1 && reviewStep === null
								? __('Concluir tour')
								: __('Próximo passo')
						}}</Button
					>
					<Button @click="skip" :disabled="busy">{{ __('Pular tour') }}</Button>
				</div>
			</template>
			<a :href="safeUrl(`/help#${definition.article}`)" v-external>{{
				__('Artigo passo a passo (nova aba)')
			}}</a>
		</section>
	</div>
</template>
<script setup lang="ts">
import { vExternal } from '@/directives/external'
import { safeUrl } from '@/utils/safeUrl'
import { Button } from 'frappe-ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
	availableTarget,
	catalogue,
	focusTarget,
	tourFor,
} from '@/tours/definitions'

const props = defineProps<{
	pageKey: string
	request: (method: string, args: any) => Promise<any>
	notify?: (message: string) => void
	scope?: Element
}>()
const definition = computed(() => tourFor(props.pageKey))
const open = ref(false),
	busy = ref(false),
	missing = ref(false),
	error = ref('')
const state = ref<any>({ status: 'Not Started', step: 0, helpful: '' })
const reviewStep = ref<number | null>(null)
const stepIndex = computed(() => reviewStep.value ?? state.value.step)
const trigger = ref<any>(),
	panel = ref<HTMLElement>()
let cleanup: (() => void) | undefined
let returnFocus: HTMLElement | null = null
let generation = 0
let disposed = false

function removeHighlight() {
	cleanup?.()
	cleanup = undefined
}
async function action(actionName: string, extra = {}) {
	const page = props.pageKey,
		current = generation
	const result = await props.request('lms.lms.tours.record_event', {
		page,
		revision: catalogue.revision,
		action: actionName,
		...extra,
	})
	if (current === generation && page === props.pageKey) state.value = result
	else if (
		!disposed &&
		['start', 'progress'].includes(actionName) &&
		result.status === 'In Progress'
	)
		props
			.request('lms.lms.tours.record_event', {
				page,
				revision: catalogue.revision,
				action: 'pause',
			})
			.catch(() =>
				props.notify?.(
					__(
						'Não foi possível guardar a pausa do tour. Retome o guia no próximo acesso.'
					)
				)
			)
	return result
}
async function run(work: () => Promise<void>) {
	if (busy.value) return
	busy.value = true
	error.value = ''
	const current = generation
	try {
		await work()
	} catch {
		if (current === generation)
			error.value = __(
				'Não foi possível guardar o acompanhamento. Sua operação na tela foi preservada; tente novamente.'
			)
	} finally {
		if (current === generation) busy.value = false
	}
}
async function locate() {
	removeHighlight()
	if (!definition.value || state.value.status !== 'In Progress') return
	await nextTick()
	const target = availableTarget(
		definition.value.steps[stepIndex.value]?.target || ':not(*)',
		props.scope || document
	)
	missing.value = !target
	if (target) cleanup = focusTarget(target)
	else panel.value?.focus()
}
async function launch() {
	returnFocus = trigger.value?.$el ?? null
	open.value = true
	await run(async () => {
		const page = props.pageKey,
			current = generation
		const own = await props.request('lms.lms.tours.get_state', {
			page,
			revision: catalogue.revision,
		})
		if (current !== generation) return
		state.value = own
		reviewStep.value = null
		if (!['Completed', 'Skipped'].includes(own.status)) {
			await action('start')
			await locate()
		} else {
			await nextTick()
			panel.value?.focus()
		}
	})
}
async function advance() {
	await run(async () => {
		// Recheck visibility at the click, not only at the previous render.
		const step = definition.value?.steps[stepIndex.value]
		if (!step || !availableTarget(step.target, props.scope || document)) {
			missing.value = true
			return
		}
		if (reviewStep.value !== null) {
			reviewStep.value =
				reviewStep.value + 1 >= state.value.step ? null : reviewStep.value + 1
			await locate()
			return
		}
		if (state.value.step === definition.value.steps.length - 1) {
			await action('complete')
			removeHighlight()
			await nextTick()
			panel.value?.focus()
		} else {
			await action('progress', { step: state.value.step + 1 })
			await locate()
		}
	})
}
// Back reviews an already reached step locally; the server frontier never moves
// backwards. Restart is explicit so repeated requests do not fabricate attempts.
async function back() {
	if (stepIndex.value > 0) {
		reviewStep.value = stepIndex.value - 1
		await locate()
	}
}
async function skip() {
	await run(async () => {
		await action('skip')
		removeHighlight()
		await nextTick()
		panel.value?.focus()
	})
}
async function rate(value: number) {
	await run(async () => {
		await action('rate', { helpful: value })
	})
}
async function restart() {
	await run(async () => {
		reviewStep.value = null
		await action('restart')
		await locate()
	})
}
async function close() {
	let current = generation
	open.value = false
	removeHighlight()
	if (busy.value) {
		const page = props.pageKey
		if (state.value.status === 'In Progress')
			props
				.request('lms.lms.tours.record_event', {
					page,
					revision: catalogue.revision,
					action: 'pause',
				})
				.catch(() =>
					props.notify?.(
						__(
							'Não foi possível guardar a pausa do tour. Retome o guia no próximo acesso.'
						)
					)
				)
		generation++
		current = generation
		busy.value = false
	} else {
		await run(async () => {
			if (state.value.status === 'In Progress') await action('pause')
		})
	}
	await nextTick()
	if (
		!disposed &&
		current === generation &&
		returnFocus?.isConnected &&
		returnFocus.getClientRects().length
	)
		returnFocus.focus()
}
function leave() {
	const page = props.pageKey
	if (open.value && state.value.status === 'In Progress')
		props
			.request('lms.lms.tours.record_event', {
				page,
				revision: catalogue.revision,
				action: 'pause',
			})
			.catch(() =>
				props.notify?.(
					__(
						'Não foi possível guardar a pausa do tour. Retome o guia no próximo acesso.'
					)
				)
			)
	open.value = false
	removeHighlight()
	generation++
}
function keyboard(event: KeyboardEvent) {
	if (!open.value || event.defaultPrevented) return
	if (event.key === 'Escape') {
		event.preventDefault()
		void close()
	}
	if (
		!busy.value &&
		event.altKey &&
		event.key === 'ArrowRight' &&
		state.value.status === 'In Progress'
	) {
		event.preventDefault()
		void advance()
	}
}
document.addEventListener('keydown', keyboard)
watch(
	() => props.pageKey,
	(page, previous) => {
		if (page !== previous) {
			if (open.value && state.value.status === 'In Progress')
				props
					.request('lms.lms.tours.record_event', {
						page: previous,
						revision: catalogue.revision,
						action: 'pause',
					})
					.catch(() =>
						props.notify?.(
							__(
								'Não foi possível guardar a pausa do tour. Retome o guia no próximo acesso.'
							)
						)
					)
			open.value = false
			removeHighlight()
			generation++
			busy.value = false
			state.value = { status: 'Not Started', step: 0 }
		}
	}
)
onBeforeUnmount(() => {
	disposed = true
	leave()
	document.removeEventListener('keydown', keyboard)
})
</script>
<style>
.icarus-tour {
	color: var(--text-color, var(--ink-gray-9));
	font-size: 1rem;
	line-height: 1.6;
}
.icarus-tour .tour-panel {
	margin: 0.5rem 0;
	padding: 1rem;
	border: 1px solid var(--border-color, var(--outline-gray-3));
	border-radius: 0.5rem;
	background: var(--fg-color, var(--surface-base));
	max-width: 72ch;
	max-height: 50dvh;
	overflow: auto;
}
.icarus-tour .tour-heading,
.icarus-tour .tour-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	align-items: center;
	justify-content: space-between;
}
.icarus-tour h2 {
	font-size: 1.125rem;
	font-weight: 600;
	margin: 0;
}
.icarus-tour p {
	margin: 0.5rem 0;
}
.icarus-tour button {
	min-height: 44px;
	padding: 0.5rem 0.75rem;
	border: 1px solid currentColor;
	border-radius: 0.375rem;
	cursor: pointer;
	font-size: 1rem;
}
.icarus-tour button:disabled {
	opacity: 0.55;
	cursor: default;
}
.icarus-tour svg {
	width: 1rem;
	height: 1rem;
}
.icarus-tour a {
	display: inline-flex;
	min-height: 44px;
	align-items: center;
	text-decoration: underline;
}
.icarus-tour :focus-visible {
	outline: 2px solid currentColor;
	outline-offset: 3px;
}
[data-icarus-tour-target] {
	outline: 3px solid var(--text-color, var(--ink-gray-9)) !important;
	outline-offset: 4px;
	scroll-margin: 6rem;
}
</style>
