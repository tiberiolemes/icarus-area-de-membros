<template>
	<div class="space-y-2">
		<FormControl
			v-if="imagePurpose && purpose !== 'brand'"
			v-model="crop"
			type="select"
			:label="__('Enquadramento da imagem')"
			:options="cropOptions"
			:disabled="uploading"
		/>
		<p class="text-p-base text-ink-gray-7">{{ policyText }}</p>
		<input
			ref="input"
			type="file"
			class="sr-only"
			:accept="accept"
			:aria-label="__('Escolher arquivo')"
			:disabled="uploading"
			@change="choose"
		/>
		<slot
			:open-file-selector="openFileSelector"
			:uploading="uploading"
			:progress="progress"
			:error="error"
			:cancel="cancel"
		>
			<Button :loading="uploading" @click="openFileSelector">{{
				uploading
					? __('Enviando {0}%').format(progress)
					: __('Escolher arquivo')
			}}</Button>
		</slot>
		<div
			v-if="uploading"
			class="flex flex-wrap items-center gap-3"
			role="status"
		>
			<progress
				:value="progress"
				max="100"
				:aria-label="__('Progresso do envio')"
			/>
			<span>{{ progress }}%</span
			><Button @click="cancel">{{ __('Cancelar envio') }}</Button>
		</div>
		<ErrorMessage :message="error" />
		<a
			v-if="originalUrl"
			:href="safeUrl(originalUrl)"
			download
			class="inline-flex min-h-11 items-center text-p-base text-ink-gray-9 underline"
			>{{ __('Baixar original privado') }}</a
		>
	</div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Button, ErrorMessage, FormControl } from 'frappe-ui'
import { uploadPurpose, type MediaPurpose } from '@/utils/mediaUpload'
import { safeUrl } from '@/utils/safeUrl'
const props = withDefaults(
	defineProps<{
		purpose: MediaPurpose
		doctype?: string
		docname?: string
		fieldname?: string
		fileTypes?: string | string[]
		private?: boolean
		validateFile?: (file: File) => unknown
	}>(),
	{ private: true }
)
const emit = defineEmits<{
	success: [
		file: { file_url: string; file_type: string; original_url?: string }
	]
	failure: [error: unknown]
}>()
const input = ref<HTMLInputElement | null>(null),
	uploading = ref(false),
	progress = ref(0),
	error = ref(''),
	crop = ref('contain')
let controller: AbortController | null = null
const originalUrl = ref('')
const imagePurpose = computed(() =>
	['avatar', 'cover', 'brand'].includes(props.purpose)
)
const accept = computed(() =>
	Array.isArray(props.fileTypes)
		? props.fileTypes.join(',')
		: props.fileTypes ||
		  (imagePurpose.value
				? 'image/png,image/jpeg,image/webp,image/gif'
				: '.pdf,.mp4,.mov,.webm,.mp3,.wav,.ogg,.m4a,.aac,.flac,.png,.jpg,.jpeg,.webp')
)
const cropOptions = computed(() => [
	{ value: 'contain', label: __('Preservar imagem inteira') },
	{ value: 'square', label: __('Recortar o centro em quadrado') },
	{ value: 'landscape', label: __('Recortar o centro em paisagem') },
])
const policyText = computed(() =>
	props.purpose === 'avatar'
		? __(
				'Foto de até 10 MB, processada para até 250 KB. O original é guardado de forma privada.'
		  )
		: imagePurpose.value
		? __(
				'Imagem de até 20 MB, processada para até 500 KB. O original é guardado de forma privada.'
		  )
		: __(
				'Materiais até 25 MB. Vídeos didáticos até 2 GB, sempre privados. O limite do servidor também se aplica.'
		  )
)
function openFileSelector() {
	if (!uploading.value) input.value?.click()
}
function cancel() {
	controller?.abort()
}
async function choose(event: Event) {
	const target = event.target as HTMLInputElement,
		file = target.files?.[0]
	if (!file || uploading.value) return
	error.value = ''
	progress.value = 0
	uploading.value = true
	try {
		const validation = await props.validateFile?.(file)
		if (validation) throw new Error(String(validation))
		controller = new AbortController()
		const purpose =
			props.purpose === 'material' &&
			(/^video\//.test(file.type) || /\.(mp4|mov|webm)$/i.test(file.name))
				? 'video'
				: props.purpose
		const result = await uploadPurpose(
			file,
			{
				purpose,
				is_private: props.private ? '1' : '0',
				crop: crop.value,
				doctype: props.doctype,
				docname: props.docname,
				fieldname: props.fieldname,
			},
			controller.signal,
			(value) => {
				progress.value = value
			}
		)
		originalUrl.value = safeUrl(result.original_url || '') || ''
		emit('success', result)
	} catch (reason) {
		error.value =
			reason instanceof DOMException && reason.name === 'AbortError'
				? __('Envio cancelado. O arquivo anterior foi mantido.')
				: reason instanceof Error
				? reason.message
				: __('Não foi possível enviar. Tente novamente.')
		emit('failure', reason)
	} finally {
		uploading.value = false
		controller = null
		target.value = ''
	}
}
onBeforeUnmount(cancel)
defineExpose({ openFileSelector })
</script>
