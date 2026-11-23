<template>
	<div class="p-3 h-full" data-tour="course-outline">
		<LoadError
			v-if="outline.error && !outline.data"
			:error="outline.error"
			@retry="reloadResource(outline)"
		/>
		<p
			v-if="allowEdit && changesPending"
			class="mb-3 text-p-base text-ink-gray-7"
		>
			{{
				__(
					'Aguarde o salvamento antes de arquivar, restaurar ou mover o conteúdo.'
				)
			}}
		</p>
		<div
			v-if="!hideHeader && title && (outline.data?.length || allowEdit)"
			class="flex items-center justify-between gap-x-2 mb-4 px-2"
			:class="{
				'sticky top-0 z-10 bg-surface-base border-b px-3 py-2.5 sm:px-5':
					allowEdit,
			}"
		>
			<div
				class="text-lg-semibold leading-5 text-ink-gray-9"
				:class="{ 'font-medium text-p-base': allowEdit }"
			>
				{{ __(title) }}
			</div>
			<Button
				size="sm"
				v-if="allowEdit"
				:disabled="courseArchived || changesPending || contentBusy"
				@click="openChapterForm()"
			>
				<template #prefix>
					<span class="lucide-plus size-4" />
				</template>
				{{ __('Add') }}
			</Button>
		</div>
		<div
			:class="{
				'border-2 rounded-5 py-2 px-2': showOutline && outline.data?.length,
			}"
		>
			<div v-if="allowEdit" class="mb-3">
				<Button
					icon-left="lucide-arrow-up-down"
					:disabled="courseArchived || changesPending || contentBusy"
					@click="openMove"
					>{{ __('Reordenar sem arrastar') }}</Button
				>
			</div>
			<OutlineMoveDialog
				v-if="allowEdit && showMove"
				v-model:open="showMove"
				:course="courseName"
				:chapters="outline.data || []"
				:courseArchived="courseArchived"
				@changed="reloadResource(outline)"
			/>
			<Draggable
				:list="outline.data"
				:disabled="
					!allowEdit ||
					chapterRenaming ||
					courseArchived ||
					changesPending ||
					contentBusy
				"
				filter=".archived-chapter"
				:preventOnFilter="false"
				item-key="name"
				group="chapters"
				v-bind="outlineDragOptions"
				@end="updateChapterOrder"
			>
				<template #item="{ element: chapter }">
					<div
						class="chapter-item"
						:class="{
							'archived-chapter':
								chapter.is_archived || chapter.effective_is_archived,
						}"
					>
						<ChapterRow
							:chapter="chapter"
							:courseName="courseName"
							:allowEdit="allowEdit"
							:courseArchived="courseArchived"
							:changesPending="changesPending || contentBusy"
							:inlineSelect="inlineSelect"
							:editorLinks="editorLinks"
							:selectedLessonNumber="selectedLessonNumber"
							@select-lesson="(payload) => emit('select-lesson', payload)"
							@edit-chapter="openChapterForm"
							@rename-chapter="renameChapter"
							@renaming-change="(v) => (chapterRenaming = v)"
							@delete-chapter="trashChapter"
							@restore-chapter="restoreChapterState"
							@delete-lesson="
								({ lesson, chapter: chapterName }) =>
									trashLesson(lesson, chapterName)
							"
							@restore-lesson="restoreLessonState"
							@move-lesson="updateOutline"
							@create-lesson="({ chapter }) => emit('add-lesson', { chapter })"
						/>
					</div>
				</template>
			</Draggable>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Button, createResource, toast } from 'frappe-ui'
import type { FrappeResourceError } from 'frappe-ui'
import {
	resourceErrorMessage,
	reloadResource,
	submitResource,
} from '@/utils/resource'
import {
	computed,
	inject,
	nextTick,
	onBeforeUnmount,
	ref,
	shallowRef,
	watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Draggable from 'vuedraggable'

import OutlineMoveDialog from '@/components/OutlineMoveDialog.vue'
import LoadError from '@/components/LoadError.vue'
import ChapterRow from '@/components/ChapterRow.vue'
import { openFormRoute } from '@/composables/useFormRoute'
import type { OutlineChapter, OutlineLesson, Resource } from '@/types'
import { outlineDragOptions } from '@/utils/courseOutline'
import { reloadExistingCourseOutlines } from '@/utils/outlineCache'

interface DraggableEvent {
	item: { __draggable_context: { element: OutlineChapter | OutlineLesson } }
	from: { dataset: { chapter: string } }
	to: { dataset: { chapter: string } }
	newIndex: number
}

interface DialogAction {
	label: string
	theme?: string
	variant?: string
	onClick: (context: { close: () => void }) => void
}
type DialogFn = (opts: {
	title: string
	message: string
	actions: DialogAction[]
}) => void

import { getCurrentInstance } from 'vue'
const router = useRouter()
const route = useRoute()
// True while a ChapterRow is in inline-rename mode; locks chapter drag.
const chapterRenaming = ref<boolean>(false)
const showMove = ref(false)
const { $dialog } = getCurrentInstance()!.appContext.config
	.globalProperties as {
	$dialog: DialogFn
}

const emit = defineEmits<{
	'select-lesson': [{ chapterNumber: string; lessonNumber: string }]
	// Keyed delete signals so the parent can match the open lesson precisely. The
	// name is carried per emit (no shared slot), so concurrent deletes can't name
	// the wrong doc and an unrelated reload can't consume the signal.
	'lesson-deleted': [{ lesson: string }]
	'chapter-deleted': [{ chapter: string }]
	'content-state-changed': [
		{
			doctype: string
			name: string
			is_archived: 0 | 1
			archived_on?: string | null
		}
	]
	// The parent opens a draft lesson; nothing is created until it has a title.
	'add-lesson': [{ chapter: OutlineChapter }]
}>()

const props = withDefaults(
	defineProps<{
		courseName: string
		showOutline?: boolean
		title?: string
		allowEdit?: boolean
		getProgress?: boolean
		completedLesson?: string | null
		inlineSelect?: boolean
		editorLinks?: boolean
		selectedLessonNumber?: string
		hideHeader?: boolean
		courseArchived?: boolean
		changesPending?: boolean
	}>(),
	{
		showOutline: false,
		title: '',
		allowEdit: false,
		getProgress: false,
		inlineSelect: false,
		editorLinks: false,
		selectedLessonNumber: '',
		completedLesson: null,
		hideHeader: false,
		courseArchived: false,
		changesPending: false,
	}
)

const user = inject<{ data?: { name?: string } }>('$user')
let moveOpener: {
	element: HTMLButtonElement
	screen: string
	actor?: string
	course: string
} | null = null
let disposed = false
function openMove(event: MouseEvent) {
	moveOpener = {
		element: event.currentTarget as HTMLButtonElement,
		screen: route.fullPath,
		actor: user?.data?.name,
		course: props.courseName,
	}
	showMove.value = true
}
watch(showMove, async (open) => {
	if (open) return
	const opener = moveOpener
	moveOpener = null
	await nextTick()
	// Let the native dialog finish its own unmount focus restoration first.
	await nextTick()
	if (
		!disposed &&
		!showMove.value &&
		opener &&
		route.fullPath === opener.screen &&
		props.courseName === opener.course &&
		user?.data?.name === opener.actor &&
		opener.element.isConnected &&
		!opener.element.disabled &&
		opener.element.getClientRects().length &&
		!opener.element.closest('[hidden], [inert]')
	)
		opener.element.focus()
})
watch(
	() => [route.fullPath, props.courseName, user?.data?.name],
	() => {
		moveOpener = null
		showMove.value = false
	}
)
onBeforeUnmount(() => {
	disposed = true
	moveOpener = null
})

defineExpose({ openChapterForm })

function outlineResource() {
	const course = props.courseName
	const progress = props.allowEdit ? false : props.getProgress
	return createResource({
		url: 'lms.lms.utils.get_course_outline',
		cache: props.allowEdit
			? ['course_outline', course]
			: [
					'course_outline_student',
					course,
					progress ? 'progress' : 'no-progress',
			  ],
		params: { course, progress },
		auto: Boolean(course),
	}) as Resource<OutlineChapter[] | null>
}

const outline = shallowRef(outlineResource())

watch(
	[
		() => props.courseName,
		() => props.allowEdit,
		() => (props.allowEdit ? false : props.getProgress),
	],
	() => {
		outline.value = outlineResource()
	}
)

watch(
	() => props.completedLesson,
	(lessonName) => {
		if (!lessonName || !outline.value.data) return
		for (const chapter of outline.value.data) {
			const found = chapter.lessons?.find((l) => l.name === lessonName)
			if (found) {
				found.is_complete = true
				break
			}
		}
	}
)

const archiveLessonResource = createResource({
	url: 'lms.lms.api.archive_lesson',
})
const restoreLessonResource = createResource({
	url: 'lms.lms.api.restore_lesson',
})
const archiveChapterResource = createResource({
	url: 'lms.lms.api.archive_chapter',
})
const restoreChapterResource = createResource({
	url: 'lms.lms.api.restore_chapter',
})
const contentBusy = computed(() =>
	[
		archiveLessonResource,
		restoreLessonResource,
		archiveChapterResource,
		restoreChapterResource,
	].some((resource) => resource.loading)
)
const updateLessonIndex = createResource({
	url: 'lms.lms.api.update_lesson_index',
	makeParams(values: {
		lesson: string
		sourceChapter: string
		targetChapter: string
		idx: number
	}) {
		return values
	},
	onSuccess() {
		reloadResource(outline.value)
		toast.success(__('Lesson moved successfully'))
	},
	onError(error: unknown) {
		reloadResource(outline.value)
		toast.error(resourceErrorMessage(error))
	},
})

const updateChapterIndex = createResource({
	url: 'lms.lms.api.update_chapter_index',
	makeParams(values: { chapter: string; course: string; idx: number }) {
		return values
	},
	onSuccess() {
		reloadResource(outline.value)
		toast.success(__('Chapter moved successfully'))
	},
	onError(error: unknown) {
		reloadResource(outline.value)
		toast.error(resourceErrorMessage(error))
	},
})

const renameChapterResource = createResource({
	url: 'lms.lms.api.upsert_chapter',
	makeParams(values: { chapter: OutlineChapter; title: string }) {
		return {
			name: values.chapter.name,
			title: values.title,
			course: props.courseName,
			is_scorm_package: values.chapter.is_scorm_package ?? 0,
			scorm_package: values.chapter.scorm_package ?? null,
		}
	},
	onSuccess() {
		reloadResource(outline.value)
		toast.success(__('Chapter renamed successfully'))
	},
	onError(err: FrappeResourceError) {
		reloadResource(outline.value)
		toast.error(resourceErrorMessage(err, 'Error'))
	},
})

function renameChapter(payload: { chapter: OutlineChapter; title: string }) {
	submitResource(renameChapterResource, payload, {
		onError(error) {
			reloadResource(outline.value)
			toast.error(resourceErrorMessage(error))
		},
	})
}

function executeContentChange(
	resource: any,
	params: Record<string, string>,
	close?: () => void
) {
	if (props.changesPending || contentBusy.value) return
	const currentOutline = outline.value
	const course = props.courseName
	return submitResource(resource, params, {
		onSuccess(result: any) {
			for (const chapter of currentOutline.data || []) {
				const node =
					result.doctype === 'Course Chapter'
						? chapter.name === result.name
							? chapter
							: null
						: chapter.lessons?.find((lesson) => lesson.name === result.name)
				if (node)
					Object.assign(node, {
						is_archived: result.is_archived,
						archived_on: result.archived_on,
						effective_is_archived:
							result.is_archived ||
							props.courseArchived ||
							(result.doctype === 'Course Lesson' && chapter.is_archived)
								? 1
								: 0,
					})
			}
			if (result.doctype === 'Course Chapter') {
				const changed = currentOutline.data?.find(
					(chapter) => chapter.name === result.name
				)
				changed?.lessons?.forEach((lesson) => {
					lesson.effective_is_archived =
						props.courseArchived || changed.is_archived || lesson.is_archived
							? 1
							: 0
				})
			}
			reloadExistingCourseOutlines(course, currentOutline)
			emit('content-state-changed', result)
			toast.success(
				result.is_archived
					? __(
							'Conteúdo arquivado. O histórico e as matrículas anteriores foram preservados.'
					  )
					: __(
							'Conteúdo restaurado. O curso não foi republicado e os filhos arquivados permanecem arquivados.'
					  )
			)
			close?.()
		},
		onError(error) {
			toast.error(resourceErrorMessage(error))
		},
	})
}
function trashLesson(lessonName: string, chapterName: string) {
	$dialog({
		title: __('Arquivar esta aula?'),
		message: __(
			'A aula sai da oferta para novas matrículas. Conteúdo, referências, ordem e histórico das matrículas anteriores são preservados. Você poderá restaurá-la.'
		),
		actions: [
			{ label: __('Cancelar'), onClick: ({ close }) => close() },
			{
				label: __('Arquivar aula'),
				theme: 'red',
				variant: 'solid',
				onClick: ({ close }) =>
					executeContentChange(
						archiveLessonResource,
						{ lesson: lessonName, chapter: chapterName },
						close
					),
			},
		],
	})
}
function trashChapter(chapterName: string) {
	$dialog({
		title: __('Arquivar este capítulo?'),
		message: __(
			'O capítulo sai da oferta para novas matrículas. Aulas, referências, ordem, histórico e pacote SCORM são preservados. Restaurar o capítulo não restaura aulas arquivadas separadamente.'
		),
		actions: [
			{ label: __('Cancelar'), onClick: ({ close }) => close() },
			{
				label: __('Arquivar capítulo'),
				theme: 'red',
				variant: 'solid',
				onClick: ({ close }) =>
					executeContentChange(
						archiveChapterResource,
						{ chapter: chapterName },
						close
					),
			},
		],
	})
}
function restoreLessonState(lesson: string) {
	return executeContentChange(restoreLessonResource, { lesson })
}
function restoreChapterState(chapter: string) {
	return executeContentChange(restoreChapterResource, { chapter })
}

// openFormRoute, not a bare router.push: it stamps the history entry so the
// form's own back/Escape pops that one entry instead of replacing to the parent
// and leaving a duplicate behind.
//
// route.hash and route.query travel with it because CourseDetail reads its
// active tab off the hash and CourseEditor reads the open lesson off the query
// (design doc C2). Dropping either would reset the page behind the open form.
function openChapterForm(chapter: OutlineChapter | null = null) {
	openFormRoute(router, {
		name: 'ChapterForm',
		params: {
			courseName: props.courseName,
			chapterName: chapter?.name ?? 'new',
		},
		hash: route.hash,
		query: { ...route.query },
	})
}

function updateOutline(e: DraggableEvent) {
	submitResource(
		updateLessonIndex,
		{
			lesson: e.item.__draggable_context.element.name,
			sourceChapter: e.from.dataset.chapter,
			targetChapter: e.to.dataset.chapter,
			idx: e.newIndex,
		},
		{
			onError(error) {
				reloadResource(outline.value)
				toast.error(resourceErrorMessage(error))
			},
		}
	)
}

function updateChapterOrder(e: DraggableEvent) {
	submitResource(
		updateChapterIndex,
		{
			chapter: e.item.__draggable_context.element.name,
			course: props.courseName,
			idx: e.newIndex,
		},
		{
			onError(error) {
				reloadResource(outline.value)
				toast.error(resourceErrorMessage(error))
			},
		}
	)
}
</script>
