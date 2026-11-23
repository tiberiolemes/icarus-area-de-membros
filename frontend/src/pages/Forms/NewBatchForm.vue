<template>
	<FormShell
		:title="__('New Batch')"
		size="3xl"
		:message="refusal"
		@close="close"
	>
		<template #default>
			<FormDraftNotice :draft="draft" />
			<FormFeedback ref="feedback" :errors="errors" @field-blur="touch">
				<div
					data-testid="new-batch-fields"
					:inert="batches.insert.loading"
					class="text-base"
				>
					<div class="grid grid-cols-1 md:grid-cols-3 gap-5">
						<FormControl
							v-model="batch.title"
							:description="textLengthInfo(batch.title, 140)"
							data-field="title"
							:error="errors.title"
							:label="__('Title')"
							:required="true"
							variant="outline"
							autocomplete="off"
						>
							<template #description>{{
								textLengthInfo(batch.title, 140)
							}}</template>
						</FormControl>
						<FormControl
							v-model="batch.start_date"
							data-field="start_date"
							:error="errors.start_date"
							:label="__('Start Date')"
							type="date"
							:format="dateFormat"
							:required="true"
							variant="outline"
						/>
						<FormControl
							v-model="batch.end_date"
							data-field="end_date"
							:error="errors.end_date"
							:label="__('End Date')"
							type="date"
							:format="dateFormat"
							:required="true"
							variant="outline"
						/>
						<FormControl
							v-model="batch.start_time"
							data-field="start_time"
							:error="errors.start_time"
							type="time"
							:label="__('Start Time')"
							:required="true"
							variant="outline"
						/>
						<FormControl
							v-model="batch.end_time"
							data-field="end_time"
							:error="errors.end_time"
							type="time"
							:label="__('End Time')"
							:required="true"
							variant="outline"
						/>
						<Combobox
							v-model="batch.timezone"
							data-field="timezone"
							:error="errors.timezone"
							:options="timezoneOptions"
							:placeholder="__('Select timezone')"
							:label="__('Timezone')"
							:required="true"
							variant="outline"
							class="w-full"
						/>
						<Link
							v-model="batch.category"
							doctype="LMS Category"
							:label="__('Category')"
							variant="outline"
							:onCreate="createLMSCategory"
							:categoryAvailability="true"
							:inlineCreate="true"
						/>
						<FormControl
							v-model="batch.seat_count"
							:label="__('Seat Count')"
							type="number"
							:required="false"
							variant="outline"
						/>
						<Select
							v-model="batch.medium"
							:label="__('Medium')"
							:options="mediumOptions"
							variant="outline"
							class="w-full"
						/>
					</div>

					<div class="space-y-5 border-t mt-5 pt-5">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
							<FormControl
								v-model="batch.description"
								data-field="description"
								:error="errors.description"
								:label="__('Description')"
								type="textarea"
								:required="true"
								variant="outline"
							/>
							<MultiLink
								v-model="batch.instructors"
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
						</div>
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
									:content="batch.batch_details"
									:ariaRequired="true"
									:ariaInvalid="Boolean(errors.batch_details)"
									:ariaDescribedby="
										errors.batch_details ? `${batchDetailsId}-error` : undefined
									"
									@change="(val: string) => (batch.batch_details = val)"
									:editable="true"
									:fixedMenu="true"
									minHeight="10rem"
									maxHeight="14rem"
								/>
								<InputError
									v-if="errors.batch_details"
									:id="`${batchDetailsId}-error`"
									:lines="[errors.batch_details]"
								/>
							</div>
						</div>
					</div>
				</div>
			</FormFeedback>
		</template>
		<template #actions>
			<HeaderButton
				data-testid="new-batch-save"
				:label="__('Create')"
				variant="solid"
				:loading="batches.insert.loading"
				@click="saveBatch()"
			/>
		</template>
	</FormShell>
	<NewMemberModal
		v-model="showMemberModal"
		:defaultRoles="['batch_evaluator']"
		@created="onInstructorCreated"
	/>
</template>
<script setup lang="ts">
import { textLengthInfo } from '@/utils/textLength'
import {
	Combobox,
	FormControl,
	createListResource,
	createResource,
	toast,
} from 'frappe-ui'
import type { FrappeResourceError } from 'frappe-ui'
import { useOnboarding } from '@framework/ui/components/Onboarding/index'
import { seesOnboarding } from '@/utils/onboarding'
import { useTelemetry } from '@framework/ui/telemetry/index'
import { computed, inject, onMounted, onBeforeUnmount, ref } from 'vue'
import { createLMSCategory, cleanError } from '@/utils'
import { getDateFormat } from '@/utils/format'
import { sanitizeStringFields } from '@/utils/sanitizeOnWrite'
import FormFeedback from '@/components/FormFeedback.vue'
import FormDraftNotice from '@/components/FormDraftNotice.vue'
import { useFormDraft } from '@/composables/useFormDraft'
import { useFormValidation } from '@/composables/useFormValidation'
import FormShell from '@/components/FormShell.vue'
import HeaderButton from '@/components/HeaderButton.vue'
import { useFormRoute } from '@/composables/useFormRoute'
import MultiLink from '@/components/Controls/MultiLink.vue'
import { summarisePeople } from '@/utils/peopleSummary'
import Link from '@/components/Controls/Link.vue'
import Select from '@/components/Controls/Select.vue'
import NewMemberModal from '@/components/Modals/NewMemberModal.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import {
	InputLabel,
	InputError,
	useInputLabeling,
} from 'frappe-ui/experimental'
import { submitResource } from '@/utils/resource'
import { batchErrors } from '@/utils/batchForm'
import { filledFields, takeFormSource } from '@/composables/formTracking'

const { capture } = useTelemetry()
const batchCreated = ref(false)
const { updateOnboardingStep } = useOnboarding('learning')
const dateFormat = getDateFormat()
const user = inject<any>('$user')
const showMemberModal = ref(false)
const { inputId: batchDetailsId, labelId: batchDetailsLabelId } =
	useInputLabeling({})

const { close, saveAndReplace } = useFormRoute({ name: 'Batches' })

// Its own list resource — but the cache key is deliberately byte-identical to
// Batches.vue:167. createListResource returns the cached instance and discards
// this call's options (listResource.js:15-22), so a saved batch shows up in the
// list purely because insert.onSuccess refetches THAT instance (:123-126).
// Disambiguating either key — a filter, a tab, a start — silently breaks that.
const batches = createListResource({
	doctype: 'LMS Batch',
	url: 'lms.lms.utils.get_batches',
	cache: ['batches', user.data?.name],
	pageLength: 24,
})

// Copied from Batches.vue:358-364. The list page gates the button; a URL does
// not go through the button.
const canCreateBatch = computed(() => {
	// Cast because Window has no read_only_mode declaration; same shape as
	// CourseCardOverlay.vue:161, the other typed SFC that reads this flag.
	if ((window as Window & { read_only_mode?: boolean }).read_only_mode)
		return false
	return Boolean(
		user.data?.is_moderator ||
			user.data?.is_instructor ||
			user.data?.is_evaluator
	)
})

const refusal = computed(() =>
	canCreateBatch.value ? null : __('You are not permitted to create a batch.')
)

type Batch = {
	title: string
	start_date: string | null
	end_date: string | null
	start_time: string | null
	end_time: string | null
	timezone: string | null
	description: string
	batch_details: string
	instructors: string[]
	category: string | null
	seat_count: number
	medium: string | null
}

const batch = ref<Batch>({
	title: '',
	start_date: null,
	end_date: null,
	start_time: null,
	end_time: null,
	timezone: null,
	description: '',
	batch_details: '',
	instructors: [],
	category: null,
	seat_count: 0,
	medium: null,
})

const onInstructorCreated = (user: any) => {
	batch.value.instructors = [...batch.value.instructors, user.name]
}

const feedback = ref<InstanceType<typeof FormFeedback> | null>(null)
const { errors, touch, validate } = useFormValidation(() =>
	batchErrors({ doc: batch.value, instructors: batch.value.instructors })
)
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
	'seat_count',
	'medium',
]
const draft = useFormDraft({
	user: () => user.data?.name,
	form: () => 'new-batch',
	canEdit: () => canCreateBatch.value,
	read: () =>
		Object.fromEntries(
			draftKeys.map((key) => [key, (batch.value as any)[key] ?? ''])
		),
	apply: (data) => Object.assign(batch.value, data),
})

const saveBatch = () => {
	if (!canCreateBatch.value || batches.insert.loading) return
	sanitizeStringFields(batch.value as Record<string, unknown>)
	if (!validate()) {
		feedback.value?.focusFirst()
		return
	}
	submitResource(
		batches.insert,
		{
			...batch.value,
			instructors: batch.value.instructors.map((instructor) => ({
				instructor: instructor,
			})),
		},
		{
			onSuccess(data: any) {
				draft.markSaved()
				batchCreated.value = true
				toast.success(__('Batch created successfully'))
				// replace, not push: the form entry is consumed so Back reaches
				// the list rather than a stale empty form.
				saveAndReplace({
					name: 'BatchDetail',
					params: { batchName: data.name },
					hash: '#settings',
				})
				if (seesOnboarding(user.data)) {
					updateOnboardingStep('create_first_batch')
				}
			},
			onError(err: FrappeResourceError) {
				const message = err.messages?.[0]
				toast.error(message ? cleanError(message) : __('Error creating batch'))
				console.error(err)
			},
		}
	)
}

const keyboardShortcut = (e: KeyboardEvent) => {
	if (
		e.key === 's' &&
		(e.ctrlKey || e.metaKey) &&
		e.target &&
		e.target instanceof HTMLElement &&
		!e.target.classList.contains('ProseMirror')
	) {
		saveBatch()
		e.preventDefault()
	}
}

onMounted(() => {
	window.addEventListener('keydown', keyboardShortcut)
	capture('batch_form_opened', { source: takeFormSource() })
})

onBeforeUnmount(() => {
	window.removeEventListener('keydown', keyboardShortcut)
	if (!batchCreated.value) {
		capture('batch_form_closed', {
			// Which fields were filled when the form was left, to see where
			// people stop.
			filled_fields: filledFields(batch.value),
		})
	}
})

const timezoneResource = createResource({
	url: 'frappe.geo.country_info.get_country_timezone_info',
	auto: true,
	transform: (data: any) => data.all_timezones,
})

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
</script>
