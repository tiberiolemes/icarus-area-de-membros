<template>
	<Popover bare>
		<template #trigger="{ open, setOpen }">
			<slot v-bind="{ open, setOpen }"></slot>
		</template>
		<template #default>
			<div
				class="absolute start-1/2 mt-3 w-[min(24rem,calc(100vw-2rem))] max-w-full -translate-x-1/2 transform rounded-6 bg-surface-base px-4 sm:px-0 lg:max-w-3xl"
			>
				<div
					class="overflow-hidden rounded-6 p-3 shadow-2xl ring-1 ring-outline-gray-2"
				>
					<div class="flex items-center justify-center gap-x-2">
						<TextInput
							type="text"
							:placeholder="__('search by keyword')"
							:aria-label="__('Search images by keyword')"
							v-model="search"
							:debounce="300"
							class="flex-1"
						/>
						<FileUploader
							purpose="cover"
							:fileTypes="['image/*']"
							:private="false"
							:validateFile="validateFile"
							@success="(file) => saveImage(file)"
						>
							<template
								v-slot="{ file, progress, uploading, openFileSelector }"
							>
								<div class="">
									<Button @click="openFileSelector" :loading="uploading">
										{{
											uploading
												? __('Uploading {0}%').format(progress)
												: __('Upload Image')
										}}
									</Button>
								</div>
							</template>
						</FileUploader>
					</div>
					<div
						v-if="hasImages"
						class="relative mt-2 grid w-full gap-2 bg-surface-base lg:grid-cols-2"
					>
						<button
							v-for="image in images.data"
							:key="image.id"
							class="min-h-11 w-full overflow-hidden rounded-4 hover:opacity-80"
							:disabled="importing"
							@click="importImage(image.urls.raw)"
						>
							<img
								:src="
									safeUrl(
										image.urls.raw +
											'&w=200&h=50&fit=crop&crop=entropy,faces,focalpoint'
									)
								"
								:alt="__('Cover image option')"
							/>
						</button>
					</div>
					<div
						v-if="importing"
						class="mt-3 flex items-center gap-3"
						role="status"
					>
						<span>{{ __('Importando imagem') }} {{ importProgress }}%</span
						><Button @click="importController?.abort()">{{
							__('Cancelar envio')
						}}</Button>
					</div>
					<p
						v-if="importError"
						class="mt-2 text-p-base text-ink-red-7"
						role="alert"
					>
						{{ importError }}
					</p>
					<!-- Unsplash needs an access key that most sites never set, so the
					     grid is empty by default. Say so instead of showing a blank
					     box that reads as a broken picker. -->
					<div
						v-if="!hasImages && hasFetched && !images.loading"
						class="mt-2 w-full rounded-4 border border-dashed p-4 text-center text-sm text-ink-gray-6"
					>
						<template v-if="search">
							{{ __('No images found for "{0}".').format(search) }}
						</template>
						<template v-else>
							{{
								__(
									'Image search is unavailable. Add an Unsplash access key in Settings, or upload your own image.'
								)
							}}
						</template>
					</div>
					<div
						v-if="hasImages"
						class="mt-2 text-center text-sm text-ink-gray-4"
					>
						{{ __('Image search powered by') }}
						<a class="underline" v-external href="https://unsplash.com">
							{{ __('Unsplash') }}
						</a>
					</div>
				</div>
			</div>
		</template>
	</Popover>
</template>
<script setup>
import FileUploader from '@/components/Controls/PurposeUploader.vue'
import { Popover, TextInput, Button, createResource } from 'frappe-ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { safeUrl } from '@/utils/safeUrl'
import { uploadPurpose } from '@/utils/mediaUpload'

const search = ref(null)
const emit = defineEmits(['select'])
const importing = ref(false),
	importProgress = ref(0),
	importError = ref('')
let importController = null
onBeforeUnmount(() => importController?.abort())
async function importImage(source) {
	if (importing.value) return
	importing.value = true
	importError.value = ''
	importProgress.value = 0
	importController = new AbortController()
	try {
		const url = new URL(source)
		if (url.protocol !== 'https:' || url.hostname !== 'images.unsplash.com')
			throw new Error(__('Origem de imagem não permitida.'))
		url.searchParams.set('fm', 'jpg')
		url.searchParams.set('w', '2000')
		url.searchParams.set('fit', 'max')
		const response = await fetch(url, {
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
			signal: importController.signal,
		})
		if (!response.ok)
			throw new Error(__('Não foi possível buscar a imagem. Tente novamente.'))
		const blob = await response.blob()
		if (blob.size > 20 * 1024 * 1024)
			throw new Error(__('A imagem excede 20 MB. Escolha outra.'))
		const file = await uploadPurpose(
			new File([blob], 'cover.jpg', { type: 'image/jpeg' }),
			{ purpose: 'cover', crop: 'contain', is_private: '0' },
			importController.signal,
			(value) => {
				importProgress.value = value
			}
		)
		emit('select', file.file_url)
	} catch (reason) {
		importError.value =
			reason?.name === 'AbortError'
				? __('Importação cancelada. A imagem anterior foi mantida.')
				: __(
						'Não foi possível importar a imagem. Tente novamente ou envie um arquivo.'
				  )
	} finally {
		importing.value = false
		importController = null
	}
}

const images = createResource({
	url: 'lms.lms.api.get_unsplash_photos',
	makeParams: () => {
		return {
			keyword: search.value,
		}
	},
	auto: true,
	debounce: 500,
})

const hasImages = computed(() => images.data?.length > 0)

// `auto: true` calls the *debounced* fetch, so `loading` stays false for the
// whole debounce window. Keying the empty state off `loading` alone told a
// correctly configured site its Unsplash key was missing for those 500ms.
const hasFetched = computed(
	() => images.data !== null && images.data !== undefined
)

watch(
	() => search.value,
	() => {
		images.reload()
	}
)

const saveImage = (file) => {
	emit('select', file.file_url)
}

const validateFile = (file) => {
	let extension = file.name.split('.').pop().toLowerCase()
	if (!['jpg', 'jpeg', 'png'].includes(extension)) {
		return __('Only image file is allowed.')
	}
}
</script>
