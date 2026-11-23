<template>
	<LoadError
		v-if="firstLoadError(courseResource)"
		:error="firstLoadError(courseResource)"
		@retry="reloadResource(courseResource)"
	/>
	<SkeletonLoader
		v-else-if="!courseResource.doc"
		variant="form"
		class="flex-1 min-h-0"
	/>
	<FormFeedback
		v-else
		data-tour-context="CourseDetail:settings"
		ref="feedback"
		:errors="errors"
		@field-blur="touch"
		class="flex-1 md:min-h-0"
	>
		<FormDraftNotice :draft="draft" />
		<div
			:inert="isSaving"
			class="grid grid-cols-1 flex-1 md:min-h-0 md:grid-cols-[70%,30%]"
		>
			<div class="space-y-8 p-5 md:overflow-y-auto">
				<CourseDetailsSection />
				<CourseOverviewSection />
				<CourseDangerZone
					ref="dangerZone"
					:course="courseResource.doc.name"
					:archived="Boolean(courseResource.doc.is_archived)"
					:blocked="isDirty || isSaving"
					@changed="reloadLifecycle"
					@purged="router.push({ name: 'Courses', query: { tab: 'created' } })"
				/>
			</div>
			<aside
				class="border-t md:overflow-y-auto md:border-s md:border-t-0 md:px-3"
			>
				<CoursePublishSettings />
			</aside>
		</div>
	</FormFeedback>
</template>

<script setup lang="ts">
import CourseDangerZone from '@/components/Courses/CourseDangerZone.vue'
import { reloadExistingCourseOutlines } from '@/utils/outlineCache'
import { createResource, createDocumentResource, toast } from 'frappe-ui'
import type { FrappeResourceError } from 'frappe-ui'
import {
	reportAutosaveError,
	resourceErrorMessage,
	reloadResource,
	submitResource,
} from '@/utils/resource'
import {
	computed,
	getCurrentInstance,
	inject,
	nextTick,
	onMounted,
	onBeforeUnmount,
	provide,
	reactive,
	ref,
	watch,
} from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { getMetaInfo, updateMetaInfo } from '@/utils'
import FormFeedback from '@/components/FormFeedback.vue'
import FormDraftNotice from '@/components/FormDraftNotice.vue'
import LoadError from '@/components/LoadError.vue'
import { firstLoadError } from '@/utils/loadError'
import { useDirtyGuard } from '@/composables/useDirtyGuard'
import { useFormDraft } from '@/composables/useFormDraft'
import { useFormValidation } from '@/composables/useFormValidation'
import { courseErrors, validateCourse } from '@/utils/courseForm'
import {
	useKeyboardShortcuts,
	saveShortcut,
} from '@/composables/useKeyboardShortcuts'
import { exportCourseAsZip } from '@/utils/exportCourse'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import CourseDetailsSection from '@/components/Courses/CourseDetailsSection.vue'
import CourseOverviewSection from '@/components/Courses/CourseOverviewSection.vue'
import CoursePublishSettings from '@/pages/Courses/CoursePublishSettings.vue'
import type { LMSCourse } from '@/types/lms/LMSCourse'
import type { CourseInstructor } from '@/types/lms/CourseInstructor'
import type { RelatedCourses as RelatedCoursesRow } from '@/types/lms/RelatedCourses'
import type {
	CourseDetails,
	CourseFormContext,
	CourseFormMeta,
	Resource,
	SessionUser,
} from '@/types'

interface DialogAction {
	label: string
	theme?: string
	variant?: string
	onClick: (context: { close: () => void }) => void | Promise<unknown>
}
type DialogFn = (opts: {
	title: string
	message: string
	actions: DialogAction[]
}) => void

interface CourseMenuItem {
	label: string
	icon: string
	theme?: string
	onClick: () => void
}

const props = defineProps<{
	course: Resource<CourseDetails | null>
}>()

const user = inject<SessionUser>('$user')!
const router = useRouter()
const app = getCurrentInstance()!
const { $dialog } = app.appContext.config.globalProperties as {
	$dialog: DialogFn
}

const isDirty = ref<boolean>(false)
const saveInFlight = ref(false)
const instructors = ref<string[]>([])
const related_courses = ref<string[]>([])
let metaDirty = false
provide('markCourseMetaDirty', () => {
	metaDirty = true
	markDirty()
})
const meta = reactive<CourseFormMeta>({ description: '', keywords: '' })

const courseResource = createDocumentResource({
	doctype: 'LMS Course',
	name: props.course.data?.name,
	auto: true,
}) as Resource<LMSCourse | null>

// Set while the form is being populated from a server fetch so the resulting
// field updates don't arm autosave (mirrors the lesson editor's load guard).
let applyingServerData = false

// Tracks the last validation error surfaced to the user so a repeated autosave
// attempt with the same unmet requirement doesn't re-toast on every keystroke.
let lastAutoSaveError: string | null = null

const validateForm = (): string | null =>
	validateCourse({
		doc: courseResource.doc ?? null,
		instructors: instructors.value,
	})

// Debounced so a burst of edits collapses into a single save shortly after the
// user pauses. When a mandatory field is empty or the price is invalid, the
// autosave can't succeed. Surface the reason once and keep the "Not Saved"
// badge (isDirty stays true) so the change isn't silently lost.
let disposed = false
onBeforeUnmount(() => {
	disposed = true
})
const autoSave = useDebounceFn((): void => {
	if (disposed || !isDirty.value) return
	const error = validateForm()
	if (error) {
		if (error !== lastAutoSaveError) {
			validation.validate()
			lastAutoSaveError = error
		}
		return
	}
	lastAutoSaveError = null
	updateCourse({ silent: true })
}, 1000)

const markDirty = (): void => {
	if (applyingServerData) return
	isDirty.value = true
	autoSave()
}

const courseFormContext: CourseFormContext = {
	resource: courseResource,
	instructors,
	relatedCourses: related_courses,
	meta,
	markDirty,
}
provide<CourseFormContext>('courseForm', courseFormContext)

onMounted(() => {
	if (!user.data?.is_moderator && !user.data?.is_instructor) {
		router.push({ name: 'Courses' })
	}
})

useKeyboardShortcuts({ shortcuts: [saveShortcut(() => submitCourse())] })

watch(
	() => courseResource.doc,
	() => {
		// A failed/empty fetch still fires this watch; the body assumes a
		// loaded doc.
		if (!courseResource.doc) return
		applyingServerData = true
		if (!metaDirty) getMetaInfo('courses', courseResource.doc?.name, meta)
		updateCourseData()
		checkPermission()
		nextTick(() => {
			applyingServerData = false
		})
	},
	{ immediate: true }
)

function updateCourseData(): void {
	const doc = courseResource.doc
	if (!doc) return
	Object.keys(doc).forEach((key) => {
		if (key === 'instructors') {
			instructors.value = []
			doc.instructors?.forEach((i: CourseInstructor) => {
				if (i.instructor) instructors.value.push(i.instructor)
			})
		} else if (key === 'related_courses') {
			related_courses.value = []
			doc.related_courses?.forEach((c: RelatedCoursesRow) => {
				if (c.course) related_courses.value.push(c.course)
			})
		}
	})
	const checkboxes: (keyof LMSCourse)[] = [
		'published',
		'upcoming',
		'disable_self_learning',
		'enforce_lesson_completion',
		'paid_course',
		'featured',
		'enable_certification',
		'paid_certificate',
	]
	for (const key of checkboxes) {
		;(doc as Record<string, unknown>)[key] = doc[key] ? true : false
	}
}

const feedback = ref<InstanceType<typeof FormFeedback> | null>(null)
const validation = useFormValidation(() =>
	courseErrors({
		doc: courseResource.doc ?? null,
		instructors: instructors.value,
	})
)
const { errors, touch } = validation
provide('courseValidation', validation)
const draftKeys = [
	'title',
	'short_introduction',
	'description',
	'category',
	'tags',
]
const draft = useFormDraft({
	user: () => user.data?.name,
	form: () => `course:${props.course.data?.name}`,
	ready: () => Boolean(courseResource.doc),
	read: () =>
		Object.fromEntries(
			draftKeys.map((key) => [key, (courseResource.doc as any)?.[key] ?? ''])
		),
	apply: (data) => {
		Object.assign(courseResource.doc!, data)
		markDirty()
	},
})

useDirtyGuard(
	() => isDirty.value,
	() => {
		draft.clear()
		isDirty.value = false
	}
)

const submitCourse = (): void => {
	if (isSaving.value) return
	if (!validation.validate()) {
		feedback.value?.focusFirst()
		return
	}
	lastAutoSaveError = null
	updateCourse()
}

const updateCourse = (opts: { silent?: boolean } = {}): void => {
	if (isSaving.value || !courseResource.doc) return
	const edits = JSON.parse(JSON.stringify(courseResource.doc))
	const editedInstructors = [...instructors.value]
	const editedRelated = [...related_courses.value]
	// Drop `modified` from the payload: this form does an intentional whole-doc
	// last-write-wins save, and sending a stale `modified` trips Frappe's
	// timestamp guard when the course was touched elsewhere (publish toggle,
	// lesson-editor autosave) since the form loaded.
	const docFields: Record<string, unknown> = { ...courseResource.doc }
	delete docFields.modified
	saveInFlight.value = true
	submitResource(
		courseResource.setValue,
		{
			...docFields,
			instructors: instructors.value.map((i) => ({ instructor: i })),
			related_courses: related_courses.value.map((c) => ({ course: c })),
		},
		{
			async onSuccess() {
				if (metaDirty) {
					try {
						await updateMetaInfo('courses', courseResource.doc?.name, meta)
						metaDirty = false
					} catch (error) {
						isDirty.value = true
						reportAutosaveError(error as FrappeResourceError)
						return
					}
				}
				if (!opts.silent) toast.success(__('Course updated successfully'))
				isDirty.value = false
				draft.markSaved()
				reloadResource(courseResource)
				// Refresh the shared course resource so sibling tabs (Overview,
				// Dashboard) reflect the saved changes without a page reload.
				reloadResource(props.course)
			},
			onError(err: FrappeResourceError) {
				edits.instructors = editedInstructors.map((instructor) => ({
					instructor,
				}))
				edits.related_courses = editedRelated.map((course) => ({ course }))
				courseResource.doc = edits
				instructors.value = editedInstructors
				related_courses.value = editedRelated
				isDirty.value = true
				reportAutosaveError(err, false)
			},
		}
	).finally(() => {
		saveInFlight.value = false
	})
}

function reloadLifecycle(result: { is_archived: 0 | 1; published: 0 | 1 }) {
	if (courseResource.doc) Object.assign(courseResource.doc, result)
	if (props.course.data) Object.assign(props.course.data, result)
	reloadResource(courseResource)
	reloadResource(props.course)
	reloadExistingCourseOutlines(props.course.data?.name || '')
}
const dangerZone = ref<InstanceType<typeof CourseDangerZone> | null>(null)
const trashCourse = (): void => dangerZone.value?.confirmArchive()

const courseMenu = computed<CourseMenuItem[]>(() => [
	{
		label: __('Export'),
		icon: 'lucide-download',
		onClick: () => exportCourseAsZip(courseResource.doc?.name),
	},
	{
		label: courseResource.doc?.is_archived
			? __('Restaurar curso')
			: __('Arquivar curso'),
		icon: 'lucide-archive',
		theme: courseResource.doc?.is_archived ? undefined : 'red',
		onClick: () => trashCourse(),
	},
])

function checkPermission(): void {
	if (user.data?.is_moderator) return
	const isInstructor = instructors.value?.some(
		(i: string) => i == user.data?.name
	)
	if (!isInstructor) router.push({ name: 'Courses' })
}

const isSaving = computed(
	() => saveInFlight.value || courseResource.setValue.loading
)

defineExpose({ isDirty, isSaving, submitCourse, trashCourse, courseMenu })
</script>
