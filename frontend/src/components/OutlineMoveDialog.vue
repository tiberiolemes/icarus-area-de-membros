<template>
	<Dialog v-model:open="open" :title="__('Mover capítulo ou aula')">
		<template #default>
			<div class="space-y-4">
				<FormControl
					v-model="kind"
					type="select"
					:label="__('O que deseja mover?')"
					:options="[
						{ value: 'lesson', label: __('Aula') },
						{ value: 'chapter', label: __('Capítulo') },
					]"
					:disabled="saving"
				/>
				<FormControl
					v-model="selected"
					type="select"
					:label="kind === 'lesson' ? __('Aula') : __('Capítulo')"
					:options="items"
					:disabled="saving"
				/>
				<FormControl
					v-if="kind === 'lesson'"
					v-model="target"
					type="select"
					:label="__('Capítulo de destino')"
					:options="targets"
					:disabled="saving"
				/>
				<FormControl
					v-model="position"
					type="select"
					:label="__('Nova posição')"
					:options="positions"
					:disabled="saving"
				/>
				<ErrorMessage :message="error" />
			</div>
		</template>
		<template #actions
			><Button :disabled="saving" @click="open = false">{{
				__('Cancelar')
			}}</Button
			><Button
				variant="solid"
				:disabled="!valid"
				:loading="saving"
				@click="move"
				>{{ __('Mover') }}</Button
			></template
		>
	</Dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
	Button,
	createResource,
	Dialog,
	ErrorMessage,
	FormControl,
} from 'frappe-ui'
import { resourceErrorMessage } from '@/utils/resource'
import type { OutlineChapter } from '@/types'
const props = defineProps<{
	course: string
	chapters: OutlineChapter[]
	courseArchived?: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [] }>()
const kind = ref('lesson'),
	selected = ref(''),
	target = ref(''),
	position = ref('0'),
	saving = ref(false),
	error = ref('')
const items = computed(() =>
	kind.value === 'chapter'
		? props.chapters
				.filter(
					(chapter) => !chapter.is_archived && !chapter.effective_is_archived
				)
				.map((chapter) => ({
					value: chapter.name,
					label: chapter.title,
				}))
		: props.chapters
				.filter(
					(chapter) => !chapter.is_archived && !chapter.effective_is_archived
				)
				.flatMap((chapter) =>
					(chapter.lessons || [])
						.filter(
							(lesson) => !lesson.is_archived && !lesson.effective_is_archived
						)
						.map((lesson) => ({
							value: lesson.name,
							label: `${chapter.title} · ${lesson.title}`,
						}))
				)
)
const targets = computed(() =>
	props.chapters
		.filter(
			(chapter) =>
				!chapter.is_scorm_package &&
				!chapter.is_archived &&
				!chapter.effective_is_archived
		)
		.map((chapter) => ({ value: chapter.name, label: chapter.title }))
)
const source = computed(() =>
	props.chapters.find((chapter) =>
		chapter.lessons?.some((lesson) => lesson.name === selected.value)
	)
)
const positions = computed(() => {
	const count =
		kind.value === 'chapter'
			? props.chapters.length
			: (
					props.chapters.find((chapter) => chapter.name === target.value)
						?.lessons || []
			  ).filter((lesson) => lesson.name !== selected.value).length + 1
	return Array.from({ length: count }, (_, index) => ({
		value: String(index),
		label: __('Posição {0}').format(index + 1),
	}))
})
const valid = computed(
	() =>
		!props.courseArchived &&
		items.value.some((item) => item.value === selected.value) &&
		positions.value.some((item) => item.value === position.value) &&
		(kind.value === 'chapter' ||
			targets.value.some((item) => item.value === target.value))
)
watch(
	[open, kind],
	() => {
		selected.value = items.value[0]?.value || ''
		error.value = ''
	},
	{ immediate: true }
)
watch(selected, () => {
	target.value = source.value?.name || targets.value[0]?.value || ''
	position.value = '0'
})
watch(target, () => {
	position.value = '0'
})
const chapterMove = createResource({ url: 'lms.lms.api.update_chapter_index' }),
	lessonMove = createResource({ url: 'lms.lms.api.update_lesson_index' })
async function move() {
	if (!valid.value || saving.value) return
	saving.value = true
	error.value = ''
	try {
		if (kind.value === 'chapter')
			await chapterMove.submit({
				course: props.course,
				chapter: selected.value,
				idx: Number(position.value),
			})
		else
			await lessonMove.submit({
				lesson: selected.value,
				sourceChapter: source.value!.name,
				targetChapter: target.value,
				idx: Number(position.value),
			})
		emit('changed')
		open.value = false
	} catch (reason) {
		error.value = resourceErrorMessage(reason)
	} finally {
		saving.value = false
	}
}
</script>
