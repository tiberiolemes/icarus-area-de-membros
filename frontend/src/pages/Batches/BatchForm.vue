<template>
	<FormFeedback ref="feedback" :errors="errors" @field-blur="touch">
		<FormDraftNotice :draft="draft" />
		<LoadError
			v-if="firstLoadError(batchDetail)"
			:error="firstLoadError(batchDetail)"
			@retry="reloadResource(batchDetail)"
		/>
		<SkeletonLoader v-else-if="!batchDetail.doc" variant="form" />
		<div v-else :inert="isSaving" class="">
			<div class="grid grid-cols-1 lg:grid-cols-[3fr,2fr]">
				<div v-if="batchDetail.doc" class="py-5 lg:h-[88vh] lg:overflow-y-auto">
					<div class="px-5 pb-5 space-y-5 border-b mb-5">
						<h2 class="text-base-semibold text-ink-gray-9">
							{{ __('Details') }}
						</h2>

						<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
							<FormControl
								v-model="batchDetail.doc.title"
								:description="textLengthInfo(batchDetail.doc.title, 140)"
								data-field="title"
								:error="errors.title"
								:label="__('Title')"
								:required="true"
								variant="outline"
								class="w-full"
							>
								<template #description>{{
									textLengthInfo(batchDetail.doc.title, 140)
								}}</template>
							</FormControl>
							<Link
								v-model="batchDetail.doc.category"
								doctype="LMS Category"
								:label="__('Category')"
								:inlineCreate="true"
								variant="outline"
								:onCreate="createLMSCategory"
								:categoryAvailability="true"
							/>
							<FormControl
								v-model="batchDetail.doc.start_date"
								data-field="start_date"
								:error="errors.start_date"
								:label="__('Batch Start Date')"
								type="date"
								:format="dateFormat"
								:required="true"
								variant="outline"
							/>
							<FormControl
								v-model="batchDetail.doc.end_date"
								data-field="end_date"
								:error="errors.end_date"
								:label="__('Batch End Date')"
								type="date"
								:format="dateFormat"
								:required="true"
								variant="outline"
							/>

							<FormControl
								v-model="batchDetail.doc.start_time"
								data-field="start_time"
								:error="errors.start_time"
								type="time"
								:label="__('Session Start Time')"
								:required="true"
								variant="outline"
							/>
							<FormControl
								v-model="batchDetail.doc.end_time"
								data-field="end_time"
								:error="errors.end_time"
								type="time"
								:label="__('Session End Time')"
								:required="true"
								variant="outline"
							/>
							<Combobox
								v-model="batchDetail.doc.timezone"
								data-field="timezone"
								:error="errors.timezone"
								:options="timezoneOptions"
								:placeholder="__('Select timezone')"
								:label="__('Timezone')"
								:required="true"
								variant="outline"
								class="w-full"
							/>

							<FormControl
								v-model="batchDetail.doc.seat_count"
								:label="__('Seat Count')"
								type="number"
								variant="outline"
								:placeholder="__('Number of seats available')"
							/>
						</div>
					</div>

					<div class="px-5 pb-5 space-y-5 border-b mb-5">
						<h2 class="text-base-semibold text-ink-gray-9">
							{{ __('Enrollment & Certification') }}
						</h2>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
							<BooleanSwitch
								size="sm"
								v-model="batchDetail.doc.allow_self_enrollment"
								:label="__('Allow Self Enrollment')"
								:description="
									__('Allow users to enroll in this batch on their own.')
								"
							/>
							<BooleanSwitch
								size="sm"
								v-model="batchDetail.doc.certification"
								:label="__('Certification')"
								:description="__('Issue certificates to batch participants.')"
							/>
							<div class="space-y-4">
								<BooleanSwitch
									size="sm"
									v-model="batchDetail.doc.paid_batch"
									:label="__('Paid Batch')"
									:description="__('Charge a fee for batch enrollment.')"
								/>
								<div
									v-if="batchDetail.doc.paid_batch"
									class="grid grid-cols-1 md:grid-cols-2 gap-3"
								>
									<FormControl
										v-model="batchDetail.doc.amount"
										data-field="amount"
										:error="errors.amount"
										:label="__('Amount')"
										type="number"
										variant="outline"
									/>
									<Link
										doctype="Currency"
										query="lms.lms.api.search_currencies"
										v-model="batchDetail.doc.currency"
										data-field="currency"
										:error="errors.currency"
										:filters="{ enabled: 1 }"
										:label="__('Currency')"
										variant="outline"
									/>
								</div>
							</div>
							<div class="space-y-4">
								<BooleanSwitch
									size="sm"
									v-model="batchDetail.doc.evaluation"
									:label="__('Evaluation')"
									:description="
										__('Enable evaluations for batch participants.')
									"
								/>
								<FormControl
									v-if="batchDetail.doc.evaluation"
									v-model="batchDetail.doc.evaluation_end_date"
									:label="__('Evaluation End Date')"
									type="date"
									:format="dateFormat"
									variant="outline"
								/>
							</div>
						</div>
					</div>

					<div class="px-5 pb-5 space-y-5 border-b mb-5">
						<h2 class="text-base-semibold text-ink-gray-9">
							{{ __('Batch overview') }}
						</h2>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
							<MultiLink
								v-model="instructors"
								data-field="instructors"
								:error="errors.instructors"
								doctype="User"
								url="lms.lms.api.search_users_by_role"
								:searchParams="{
									roles: JSON.stringify(['Batch Evaluator', 'Course Creator']),
								}"
								:label="__('Instructors')"
								:placeholder="__('Select instructors')"
								:required="true"
								:disabled="!batch.data?.can_change_instructors"
								variant="outline"
								:onCreate="() => (showMemberModal = true)"
							>
								<template #summary="{ selected, summary }">
									{{
										selected.length
											? summarisePeople(selected.map((o) => o.label))
											: summary
									}}
								</template>
							</MultiLink>
							<Select
								v-model="batchDetail.doc.medium"
								:label="__('Medium')"
								:options="mediumOptions"
								variant="outline"
								class="w-full"
							/>
							<Link
								ref="emailTemplateLinkRef"
								doctype="Email Template"
								:label="__('Enrollment Confirmation Email Template')"
								v-model="batchDetail.doc.confirmation_email_template"
								variant="outline"
								:onCreate="openEmailTemplateForm"
							/>
							<FormControl
								v-model="batchDetail.doc.description"
								data-field="description"
								:error="errors.description"
								:label="__('Short Description')"
								type="textarea"
								:placeholder="__('Short description of the batch')"
								:required="true"
								variant="outline"
								class="md:col-span-2"
							/>
						</div>
						<VideoPreviewField
							v-model="batchDetail.doc.video_link"
							:label="__('Preview Video')"
						/>
						<div class="space-y-1.5" data-field="batch_details">
							<InputLabel
								:id="batchDetailsLabelId"
								:for-id="batchDetailsId"
								:label="__('Batch Details')"
								:required="true"
							/>
							<div
								class="rounded-t-6 rounded-b-5 outline-none transition-[box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
							>
								<RichTextEditor
									:id="batchDetailsId"
									:ariaLabelledby="batchDetailsLabelId"
									:content="batchDetail.doc.batch_details"
									:ariaRequired="true"
									:ariaInvalid="Boolean(errors.batch_details)"
									:ariaDescribedby="
										errors.batch_details ? `${batchDetailsId}-error` : undefined
									"
									@change="(val: string) => updateBatchDetails(val)"
									:editable="true"
									:fixedMenu="true"
									minHeight="7rem"
									maxHeight="16rem"
								/>
								<InputError
									v-if="errors.batch_details"
									:id="`${batchDetailsId}-error`"
									:lines="[errors.batch_details]"
								/>
							</div>
						</div>
					</div>

					<div class="px-5 pb-5 space-y-5 border-b mb-5">
						<h2 class="text-base-semibold text-ink-gray-9">
							{{ __('Conferencing') }}
						</h2>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
							<Select
								v-model="batchDetail.doc.conferencing_provider"
								:options="conferencingOptions"
								:label="__('Conferencing Provider')"
								variant="outline"
								class="w-full"
							/>
							<Link
								v-if="batchDetail.doc.conferencing_provider === 'Zoom'"
								doctype="LMS Zoom Settings"
								:label="__('Zoom Account')"
								v-model="batchDetail.doc.zoom_account"
								variant="outline"
								:onCreate="
									(value, close) => {
										openSettings('zoom', close)
									}
								"
							/>
							<Link
								v-if="batchDetail.doc.conferencing_provider === 'Google Meet'"
								doctype="LMS Google Meet Settings"
								:label="__('Google Meet Account')"
								v-model="batchDetail.doc.google_meet_account"
								variant="outline"
								:onCreate="
									(value, close) => {
										openSettings('google-meet', close)
									}
								"
							/>
						</div>
					</div>

					<div class="px-5 pb-5 space-y-5">
						<h2 class="text-base-semibold text-ink-gray-9">
							{{ __('Meta Tags') }}
						</h2>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
							<FormControl
								v-model="meta.description"
								@input="markMetaDirty"
								:label="__('Meta Description')"
								type="textarea"
								variant="outline"
							/>
							<FormControl
								v-model="meta.keywords"
								@input="markMetaDirty"
								:label="__('Meta Keywords')"
								type="textarea"
								:placeholder="__('Comma separated keywords')"
								variant="outline"
							/>
							<Uploader
								v-model="batchDetail.doc.meta_image"
								:label="__('Meta Image')"
								type="image"
								:required="false"
							/>
						</div>
					</div>
				</div>
				<div class="border-s min-w-0">
					<div class="border-b p-4">
						<BatchCourses :batch="batch" />
					</div>
					<div class="p-4">
						<Assessments
							:batch="batch.data?.name"
							:can-manage="Boolean(batch.data?.can_manage)"
						/>
					</div>
				</div>
			</div>
		</div>
		<NewMemberModal
			v-model="showMemberModal"
			:defaultRoles="['batch_evaluator']"
			@created="onInstructorCreated"
		/>
	</FormFeedback>
</template>
<script setup lang="ts">
import { textLengthInfo } from '@/utils/textLength'
import {
	computed,
	getCurrentInstance,
	inject,
	onMounted,
	onBeforeUnmount,
	reactive,
	ref,
	toRaw,
	watch,
	nextTick,
} from 'vue'
import {
	Combobox,
	FormControl,
	createDocumentResource,
	createResource,
	toast,
	call,
} from 'frappe-ui'
import type { FrappeResourceError } from 'frappe-ui'
import {
	reportAutosaveError,
	submitResource,
	reloadResource,
} from '@/utils/resource'
import {
	InputLabel,
	InputError,
	useInputLabeling,
} from 'frappe-ui/experimental'
import { useDebounceFn } from '@vueuse/core'
import BooleanSwitch from '@/components/Controls/BooleanSwitch.vue'
import {
	createLMSCategory,
	getMetaInfo,
	openSettings,
	updateMetaInfo,
} from '@/utils'
import FormFeedback from '@/components/FormFeedback.vue'
import FormDraftNotice from '@/components/FormDraftNotice.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import LoadError from '@/components/LoadError.vue'
import { firstLoadError } from '@/utils/loadError'
import { useFormDraft } from '@/composables/useFormDraft'
import { useDirtyGuard } from '@/composables/useDirtyGuard'
import { useFormValidation } from '@/composables/useFormValidation'
import { batchErrors, validateBatch } from '@/utils/batchForm'
import { getDateFormat } from '@/utils/format'
import {
	useKeyboardShortcuts,
	saveShortcut,
} from '@/composables/useKeyboardShortcuts'
import { useRoute, useRouter } from 'vue-router'
import Uploader from '@/components/Controls/Uploader.vue'
import VideoPreviewField from '@/components/Controls/VideoPreviewField.vue'
import MultiLink from '@/components/Controls/MultiLink.vue'
import { summarisePeople } from '@/utils/peopleSummary'
import Link from '@/components/Controls/Link.vue'
import Select from '@/components/Controls/Select.vue'
import BatchCourses from '@/pages/Batches/components/BatchCourses.vue'
import Assessments from '@/pages/Batches/components/Assessments.vue'
import NewMemberModal from '@/components/Modals/NewMemberModal.vue'
import { openBatchForm } from '@/composables/useBatchForms'
import type { LMSBatch } from '@/types/lms/LMSBatch'
import type { CourseInstructor } from '@/types/lms/CourseInstructor'
import type { Resource, BatchDetails, SessionUser } from '@/types'
import RichTextEditor from '@/components/RichTextEditor.vue'

interface DialogAction {
	label: string
	theme?: string
	variant?: string
	onClick: (ctx: { close: () => void }) => void
}
type DialogFn = (opts: {
	title: string
	message: string
	actions: DialogAction[]
}) => void

const props = defineProps<{
	batch: Resource<BatchDetails | null>
}>()

const router = useRouter()
const route = useRoute()
const user = inject<SessionUser>('$user')!
const instructors = ref<string[]>([])
const dateFormat = getDateFormat()
const app = getCurrentInstance()!
const { $dialog } = app.appContext.config.globalProperties as {
	$dialog: DialogFn
}
const isDirty = ref<boolean>(false)
const saveInFlight = ref(false)
const originalDoc = ref<LMSBatch | null>(null)
const { inputId: batchDetailsId, labelId: batchDetailsLabelId } =
	useInputLabeling({})
const showMemberModal = ref<boolean>(false)
const emailTemplateLinkRef = ref<{ reload: () => void } | null>(null)

const batchDetail = createDocumentResource({
	doctype: 'LMS Batch',
	name: props.batch.data?.name,
	auto: true,
}) as Resource<LMSBatch | null>

const openEmailTemplateForm = (): void => {
	openBatchForm(
		router,
		'NewBatchEmailTemplate',
		props.batch.data?.name ?? '',
		route.hash
	)
}

// EmailTemplateForm is a route now, so it cannot emit `created` back at this
// component the way the modal did — it hands the new name over in the URL
// instead. Waits on the doc as well as the query because a deep-linked return
// remounts this form and the doc lands after the query does. The param is
// stripped once adopted, or a later reload would re-apply it over whatever the
// user picked since.
watch(
	[() => route.query.emailTemplate, () => batchDetail.doc],
	([created]) => {
		if (typeof created !== 'string' || !created || !batchDetail.doc) return
		batchDetail.doc.confirmation_email_template = created
		emailTemplateLinkRef.value?.reload()
		const query = { ...route.query }
		delete query.emailTemplate
		router.replace({ ...route, query })
	},
	{ immediate: true, flush: 'post' }
)

const updateBatchDetails = (value: string): void => {
	if (batchDetail.doc) batchDetail.doc.batch_details = value
}

const onInstructorCreated = (createdUser: { name: string }): void => {
	instructors.value = [...instructors.value, createdUser.name]
}

const meta = reactive<{ description: string; keywords: string }>({
	description: '',
	keywords: '',
})

let metaDirty = false
const markMetaDirty = () => {
	metaDirty = true
	isDirty.value = true
	autoSave()
}

const validateForm = (): string | null =>
	validateBatch({
		doc: batchDetail.doc ?? null,
		instructors: instructors.value,
	})

// Tracks the last validation error surfaced to the user so a repeated autosave
// attempt with the same unmet requirement doesn't re-toast on every keystroke.
let lastAutoSaveError: string | null = null

// Debounced so a burst of edits collapses into a single save shortly after the
// user pauses (mirrors CourseForm). When a mandatory field is empty or the
// amount is invalid, the autosave can't succeed. Surface the reason once and
// keep the "Not Saved" badge (isDirty stays true) so the change isn't lost.
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
	updateBatch({ silent: true })
}, 1000)

onMounted(() => {
	if (!user.data) window.location.href = '/login'
})

useKeyboardShortcuts({ shortcuts: [saveShortcut(() => submitBatch())] })

let applyingServerData = false
watch(
	() => batchDetail.doc,
	(doc, previous) => {
		if (!doc) return
		if (doc !== previous) {
			applyingServerData = true
			updateBatchData()
			if (!metaDirty) getMetaInfo('batches', doc.name, meta)
			nextTick(() => {
				applyingServerData = false
			})
		} else if (!applyingServerData && originalDoc.value) {
			isDirty.value = JSON.stringify(doc) !== JSON.stringify(originalDoc.value)
			if (isDirty.value) autoSave()
		}
	},
	{ deep: true, immediate: true }
)
watch(
	instructors,
	() => {
		if (!applyingServerData) {
			isDirty.value = true
			autoSave()
		}
	},
	{ deep: true }
)

function updateBatchData(): void {
	const doc = batchDetail.doc
	if (!doc) return
	instructors.value = (doc.instructors ?? [])
		.map((row) => row.instructor)
		.filter(Boolean) as string[]
	for (const key of ['start_time', 'end_time'] as const) {
		if (doc[key]) doc[key] = formatTime(doc[key])
	}
	for (const key of [
		'published',
		'paid_batch',
		'allow_self_enrollment',
		'certification',
		'evaluation',
	]) {
		;(doc as any)[key] = Boolean((doc as any)[key])
	}
	originalDoc.value = structuredClone(toRaw(doc))
}

function formatTime(timeStr: string): string {
	const [hours, minutes] = timeStr.split(':')
	const paddedHours = hours.length == 1 ? '0' + hours : hours
	return `${paddedHours}:${minutes}`
}

const feedback = ref<InstanceType<typeof FormFeedback> | null>(null)
const validation = useFormValidation(() =>
	batchErrors({ doc: batchDetail.doc ?? null, instructors: instructors.value })
)
const { errors, touch } = validation
const draftKeys = [
	'title',
	'start_date',
	'end_date',
	'start_time',
	'end_time',
	'timezone',
	'description',
	'batch_details',
	'category',
]
const draft = useFormDraft({
	user: () => user.data?.name,
	form: () => `batch:${props.batch.data?.name}`,
	ready: () => Boolean(batchDetail.doc),
	read: () =>
		Object.fromEntries(
			draftKeys.map((key) => [key, (batchDetail.doc as any)?.[key] ?? ''])
		),
	apply: (data) => {
		Object.assign(batchDetail.doc!, data)
		isDirty.value = true
	},
})
useDirtyGuard(
	() => isDirty.value,
	() => {
		draft.clear()
		isDirty.value = false
	}
)

const submitBatch = (): void => {
	if (isSaving.value) return
	if (!validation.validate()) {
		feedback.value?.focusFirst()
		return
	}
	lastAutoSaveError = null
	updateBatch()
}

const updateBatch = (opts: { silent?: boolean } = {}): void => {
	if (!batchDetail.doc || isSaving.value) return
	const edits = JSON.parse(JSON.stringify(batchDetail.doc))
	const editedInstructors = [...instructors.value]
	const baselineBeforeSave = originalDoc.value
		? structuredClone(toRaw(originalDoc.value))
		: null
	saveInFlight.value = true
	submitResource(
		batchDetail.setValue,
		{
			...batchDetail.doc,
			instructors: instructors.value.map((instructor) => ({
				instructor: instructor,
			})),
		},
		{
			async onSuccess(data: LMSBatch) {
				if (metaDirty) {
					try {
						await updateMetaInfo('batches', data.name, meta)
						metaDirty = false
					} catch (error) {
						isDirty.value = true
						reportAutosaveError(error as FrappeResourceError)
						return
					}
				}
				if (!opts.silent) toast.success(__('Batch updated successfully'))
				nextTick(() => {
					originalDoc.value = structuredClone(data)
					isDirty.value = false
					draft.markSaved()
				})
				// Refresh the shared batch resource so the Overview tab (which reads
				// title/description/batch_details from this same resource) reflects
				// the saved changes without a page reload (mirrors CourseForm).
				reloadResource(props.batch)
			},
			onError(err: FrappeResourceError) {
				edits.instructors = editedInstructors.map((instructor) => ({
					instructor,
				}))
				batchDetail.doc = edits
				instructors.value = editedInstructors
				isDirty.value = true
				nextTick(() => {
					originalDoc.value = baselineBeforeSave
					isDirty.value = true
				})
				reportAutosaveError(err, false)
			},
		}
	).finally(() => {
		saveInFlight.value = false
	})
}

const deleteBatch = (): void => {
	$dialog({
		title: __('Confirm your action to delete'),
		message: __(
			'Deleting this batch will also delete all its data including enrolled students, linked courses, assessments, feedback and discussions. Are you sure you want to continue?'
		),
		actions: [
			{
				label: __('Delete'),
				theme: 'red',
				variant: 'solid',
				onClick({ close }) {
					return trashBatch(close)
				},
			},
		],
	})
}

const trashBatch = (close: () => void): Promise<void> => {
	return call('lms.lms.api.delete_batch', {
		batch: props.batch.data?.name,
	}).then(() => {
		toast.success(__('Batch deleted successfully'))
		close()
		router.push({
			name: 'Batches',
		})
	})
}

const conferencingOptions = computed(() => {
	return [
		{
			label: '',
			value: '',
		},
		{
			label: __('Zoom'),
			value: 'Zoom',
		},
		{
			label: __('Google Meet'),
			value: 'Google Meet',
		},
	]
})

const timezoneResource = createResource({
	url: 'frappe.geo.country_info.get_country_timezone_info',
	auto: true,
	transform: (data: { all_timezones: string[] }) => data.all_timezones,
}) as Resource<string[]>

const timezoneOptions = computed(() =>
	(timezoneResource.data || []).map((tz: string) => ({ label: tz, value: tz }))
)

const mediumOptions = computed(() => {
	return [
		{
			label: __('Online'),
			value: 'Online',
		},
		{
			label: __('Offline'),
			value: 'Offline',
		},
	]
})

const isSaving = computed(
	() => saveInFlight.value || batchDetail.setValue.loading
)

defineExpose({
	submitBatch,
	deleteBatch,
	isDirty,
	isSaving,
})
</script>
