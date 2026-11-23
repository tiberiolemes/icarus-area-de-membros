<template>
	<section
		data-tour="course-lifecycle"
		class="space-y-3 border-t border-outline-gray-2 pt-6"
	>
		<h2 class="text-lg font-semibold text-ink-gray-9">
			{{ __('Zona de perigo') }}
		</h2>
		<p class="text-p-base text-ink-gray-7">
			{{
				archived
					? __(
							'Curso arquivado. Restaurar preserva o histórico e mantém o curso despublicado.'
					  )
					: __(
							'Arquivar retira o curso do catálogo e preserva matrículas, aulas e histórico.'
					  )
			}}
		</p>
		<div class="flex flex-wrap gap-3">
			<Button :loading="busy" :disabled="blocked" @click="confirmArchive">{{
				archived ? __('Restaurar curso') : __('Arquivar curso')
			}}</Button
			><Button
				v-if="archived"
				theme="red"
				:disabled="blocked || busy"
				@click="openPurge"
				>{{ __('Solicitar exclusão permanente') }}</Button
			>
		</div>
		<ErrorMessage :message="error" />
		<Dialog
			v-model:open="showArchive"
			:title="archived ? __('Restaurar curso?') : __('Arquivar curso?')"
			:message="
				archived
					? __(
							'O curso será restaurado sem republicar. O histórico será preservado.'
					  )
					: __(
							'O curso sairá do catálogo. Matrículas, aulas e histórico serão preservados.'
					  )
			"
			:actions="archiveActions"
			><template #default
				><p class="text-p-base text-ink-gray-8">
					{{
						archived
							? __(
									'O curso será restaurado sem republicar. O histórico será preservado.'
							  )
							: __(
									'O curso sairá do catálogo. Matrículas, aulas e histórico serão preservados.'
							  )
					}}
				</p>
				<ErrorMessage :message="error" /></template
		></Dialog>
		<Dialog
			v-model:open="showPurge"
			:title="__('Excluir permanentemente o curso')"
			size="lg"
		>
			<template #default>
				<div class="space-y-4">
					<p class="text-p-base text-ink-gray-9">
						{{
							__(
								'Esta ação é irreversível. Revise o impacto e obtenha autorização administrativa.'
							)
						}}
					</p>
					<LoadError
						v-if="impactError"
						:error="impactError"
						@retry="loadImpact"
					/>
					<SkeletonLoader v-else-if="!impact" />
					<template v-else>
						<p class="text-p-base text-ink-gray-7">
							{{
								__(
									'As contagens abaixo são operações relacionadas e podem se sobrepor. Não representam um total de pessoas únicas.'
								)
							}}
						</p>
						<dl class="max-h-64 space-y-2 overflow-y-auto">
							<div
								v-for="(count, label) in impact.counts"
								:key="label"
								class="flex justify-between gap-4"
							>
								<dt>{{ impactLabel(String(label)) }}</dt>
								<dd class="tabular-nums">{{ count }}</dd>
							</div>
						</dl>
						<p v-if="expired" role="alert">
							{{
								__('A autorização venceu. Verifique outra vez para continuar.')
							}}
						</p>
						<template v-if="!token">
							<FormControl
								v-model="authorizer"
								autocomplete="off"
								:required="true"
								:label="__('Usuário ou e-mail de quem autoriza')"
								:disabled="busy"
							/>
							<PasswordField
								v-model="password"
								autocomplete="off"
								:label="__('Senha de quem autoriza')"
								:disabled="busy"
							/>
							<Button
								:loading="busy"
								:disabled="!authorizer || !password"
								@click="authorize"
								>{{ __('Verificar autorização e atualizar impacto') }}</Button
							>
						</template>
						<template v-else>
							<p role="status">
								{{
									__(
										'Autorização verificada. O impacto acima foi atualizado pelo servidor. Revise novamente antes de confirmar.'
									)
								}}
							</p>
							<p>
								{{ __('Digite o identificador exato do curso') }}
								<strong>{{ course }}</strong>
							</p>
							<FormControl
								v-model="confirmation"
								autocomplete="off"
								:required="true"
								:label="__('Identificador do curso')"
								:disabled="busy"
							/>
							<Button
								theme="red"
								variant="solid"
								:disabled="confirmation !== course || expired"
								:loading="busy"
								@click="purge"
								>{{ __('Excluir permanentemente') }}</Button
							>
						</template>
					</template>
					<ErrorMessage :message="error" />
				</div>
			</template>
			<template #actions
				><Button :disabled="busy" @click="showPurge = false">{{
					__('Cancelar')
				}}</Button></template
			>
		</Dialog>
	</section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
	Button,
	createResource,
	Dialog,
	ErrorMessage,
	FormControl,
	toast,
} from 'frappe-ui'
import LoadError from '@/components/LoadError.vue'
import PasswordField from '@/components/Profile/PasswordField.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import { resourceErrorMessage } from '@/utils/resource'
const props = defineProps<{
	course: string
	archived: boolean
	blocked?: boolean
}>()
const emit = defineEmits<{
	changed: [result: { is_archived: 0 | 1; published: 0 | 1 }]
	purged: []
}>()
const showArchive = ref(false),
	showPurge = ref(false),
	busy = ref(false),
	error = ref(''),
	impactError = ref<unknown>(null),
	impact = ref<any>(null)
// Credentials and authorization are deliberately outside the form/draft model.
const authorizer = ref(''),
	password = ref(''),
	token = ref(''),
	confirmation = ref(''),
	expired = ref(false)
let expiry: ReturnType<typeof setTimeout> | undefined
const api = (name: string) => createResource({ url: `lms.lms.api.${name}` })
const archive = api('archive_course'),
	restore = api('restore_course'),
	prepare = api('prepare_course_purge'),
	erase = api('purge_course'),
	preview = api('get_course_deletion_impact')
function clearSecrets() {
	password.value = ''
	token.value = ''
	confirmation.value = ''
	authorizer.value = ''
	clearTimeout(expiry)
	prepare.data = null
	prepare.params = {}
	erase.data = null
	erase.params = {}
}
watch(showPurge, (open) => {
	if (!open) {
		clearSecrets()
		impact.value = null
		error.value = ''
	}
})
onBeforeUnmount(() => {
	showPurge.value = false
	clearSecrets()
})
const impactNames: Record<string, string> = {
	'LMS Enrollment': 'Matrículas',
	'LMS Course Progress': 'Progresso',
	'LMS Certificate': 'Certificados',
	'Course Chapter': 'Capítulos',
	'Course Lesson': 'Aulas',
	'Discussion Topic': 'Tópicos',
	'Discussion Reply': 'Respostas',
	'LMS Lesson Note': 'Notas de aula',
	'LMS Program Course': 'Vínculos com programas',
	'LMS Batch Timetable': 'Referências em turmas',
	'LMS Course Review': 'Avaliações do curso',
	'LMS Video Watch Duration': 'Histórico de vídeo',
}
const impactLabel = (label: string) => __(impactNames[label] || label)
async function loadImpact() {
	impactError.value = null
	impact.value = null
	try {
		impact.value = await preview.submit({ course: props.course })
	} catch (reason) {
		impactError.value = reason
	}
}
function confirmArchive() {
	if (props.blocked) {
		error.value = __('Aguarde o salvamento das alterações antes de continuar.')
		return
	}
	error.value = ''
	showArchive.value = true
}
const archiveActions = computed(() => [
	{ label: __('Cancelar'), onClick: ({ close }: any) => close() },
	{
		label: props.archived ? __('Restaurar') : __('Arquivar'),
		variant: 'solid',
		theme: props.archived ? 'gray' : 'red',
		onClick: async ({ close }: any) => {
			if (busy.value) return
			busy.value = true
			try {
				const result = await (props.archived ? restore : archive).submit({
					course: props.course,
				})
				toast.success(
					props.archived
						? __('Curso restaurado e mantido despublicado.')
						: __('Curso arquivado com histórico preservado.')
				)
				close()
				emit('changed', result)
			} catch (reason) {
				error.value = resourceErrorMessage(reason)
			} finally {
				busy.value = false
			}
		},
	},
])
function openPurge() {
	if (props.blocked) return
	clearSecrets()
	expired.value = false
	error.value = ''
	impact.value = null
	showPurge.value = true
	loadImpact()
}
async function authorize() {
	if (busy.value || !authorizer.value || !password.value) return
	busy.value = true
	error.value = ''
	try {
		const result = await prepare.submit({
			course: props.course,
			authorizer: authorizer.value,
			password: password.value,
		})
		if (!showPurge.value) return
		impact.value = result.impact
		expired.value = false
		clearTimeout(expiry)
		token.value = result.token
		expiry = setTimeout(() => {
			token.value = ''
			expired.value = true
		}, result.expires_in * 1000)
	} catch (reason) {
		error.value = resourceErrorMessage(reason)
	} finally {
		password.value = ''
		prepare.data = null
		prepare.params = {}
		busy.value = false
	}
}
async function purge() {
	if (
		busy.value ||
		!token.value ||
		expired.value ||
		confirmation.value !== props.course
	)
		return
	busy.value = true
	error.value = ''
	try {
		await erase.submit({
			course: props.course,
			confirmation: confirmation.value,
			token: token.value,
		})
		clearSecrets()
		showPurge.value = false
		emit('purged')
	} catch (reason) {
		token.value = ''
		confirmation.value = ''
		error.value = resourceErrorMessage(reason)
		await loadImpact()
	} finally {
		busy.value = false
	}
}
defineExpose({ confirmArchive })
</script>
