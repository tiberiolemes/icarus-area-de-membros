<template>
	<FormFeedback ref="feedback" :errors="errors" @field-blur="touch">
		<FormDraftNotice :draft="draft" />
		<LoadError
			v-if="jobDetails?.get?.error && !jobDetails?.doc"
			:error="jobDetails.get.error"
			@retry="reloadResource(jobDetails)"
		/>
		<SkeletonLoader
			v-else-if="jobName !== 'new' && !jobDetails?.doc"
			variant="form"
		/>
		<div v-else :inert="isSaving" class="">
			<h1 class="sr-only">
				{{ jobName == 'new' ? __('New Job') : jobDetails.doc?.job_title }}
			</h1>
			<PageHeader :breadcrumbs="breadcrumbs">
				<template #actions>
					<Badge v-if="isDirty" theme="amber">
						{{ __('Not Saved') }}
					</Badge>
					<ShortcutTooltip
						:label="__('Save')"
						combo="Mod+S"
						:disabled="isMobile"
					>
						<HeaderButton
							:label="__('Save')"
							variant="solid"
							:loading="isSaving"
							@click="saveJob()"
						/>
					</ShortcutTooltip>
				</template>
			</PageHeader>
			<div class="">
				<div class="grid grid-cols-1 gap-5 px-5 lg:grid-cols-[70%,30%]">
					<div class="space-y-5 pt-5">
						<h2 class="text-ink-gray-9 font-semibold">
							{{ __('Job Details') }}
						</h2>
						<div class="grid grid-cols-1 gap-5 sm:grid-cols-3">
							<FormControl
								v-model="job.job_title"
								:description="textLengthInfo(job.job_title, 140)"
								data-field="job_title"
								:error="errors.job_title"
								:label="__('Title')"
								:required="true"
							>
								<template #description>{{
									textLengthInfo(job.job_title, 140)
								}}</template>
							</FormControl>
							<FormControl
								v-model="job.type"
								data-field="type"
								:error="errors.type"
								:label="__('Type')"
								type="select"
								:options="jobTypes"
								:required="true"
							/>
							<FormControl
								v-model="job.work_mode"
								data-field="work_mode"
								:error="errors.work_mode"
								:label="__('Work Mode')"
								type="select"
								:options="workModes"
								:required="false"
								:description="__('Optional')"
							/>
						</div>
						<div class="mb-4 space-y-1.5" data-field="description">
							<InputLabel
								:id="descriptionLabelId"
								:label="__('Description')"
								:required="true"
							/>
							<RichTextEditor
								:ariaLabelledby="descriptionLabelId"
								:content="job.description"
								:ariaRequired="true"
								:ariaInvalid="Boolean(errors.description)"
								:ariaDescribedby="
									errors.description ? `${descriptionLabelId}-error` : undefined
								"
								@change="(val) => (job.description = val)"
								:editable="true"
								:fixedMenu="true"
								minHeight="20rem"
								maxHeight="70vh"
							/>
							<InputError
								v-if="errors.description"
								:id="`${descriptionLabelId}-error`"
								:lines="[errors.description]"
							/>
						</div>
					</div>
					<div class="border-t lg:border-s lg:border-t-0 lg:h-[93vh]">
						<div v-if="jobName != 'new'" class="py-5 lg:p-5 space-y-5 border-b">
							<FormControl
								v-model="job.status"
								:label="__('Status')"
								type="select"
								:options="jobStatuses"
								:required="true"
							/>
						</div>
						<div class="py-5 lg:p-5 space-y-5 border-b">
							<h2 class="text-ink-gray-9 font-semibold">
								{{ __('Location') }}
							</h2>
							<FormControl
								v-model="job.location"
								:description="textLengthInfo(job.location, 140)"
								data-field="location"
								:error="errors.location"
								:label="__('City')"
								:required="true"
							>
								<template #description>{{
									textLengthInfo(job.location, 140)
								}}</template>
							</FormControl>
							<Link
								v-model="job.country"
								data-field="country"
								:error="errors.country"
								doctype="Country"
								:label="__('Country')"
								:required="true"
							/>
						</div>
						<div class="py-5 lg:p-5 space-y-5">
							<h2 class="text-ink-gray-9 font-semibold">
								{{ __('Company Details') }}
							</h2>
							<FormControl
								v-model="job.company_name"
								:description="textLengthInfo(job.company_name, 140)"
								data-field="company_name"
								:error="errors.company_name"
								:label="__('Company Name')"
								class="mb-4"
								:required="true"
							>
								<template #description>{{
									textLengthInfo(job.company_name, 140)
								}}</template>
							</FormControl>
							<FormControl
								v-model="job.company_website"
								:description="textLengthInfo(job.company_website, 140)"
								data-field="company_website"
								:error="errors.company_website"
								:label="__('Company Website')"
								:required="true"
							>
								<template #description>{{
									textLengthInfo(job.company_website, 140)
								}}</template>
							</FormControl>
							<FormControl
								v-model="job.company_email_address"
								:description="textLengthInfo(job.company_email_address, 140)"
								data-field="company_email_address"
								:error="errors.company_email_address"
								:label="__('Company Email Address')"
								class="mb-4"
								:required="true"
							>
								<template #description>{{
									textLengthInfo(job.company_email_address, 140)
								}}</template>
							</FormControl>
							<div
								data-field="company_logo"
								role="group"
								:aria-invalid="Boolean(errors.company_logo)"
								:aria-describedby="
									errors.company_logo
										? `${descriptionLabelId}-logo-error`
										: undefined
								"
							>
								<Uploader
									v-model="job.company_logo"
									:label="__('Company Logo')"
									:required="true"
								/>
								<InputError
									v-if="errors.company_logo"
									:id="`${descriptionLabelId}-logo-error`"
									:lines="[errors.company_logo]"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</FormFeedback>
</template>
<script setup>
import { textLengthInfo } from '@/utils/textLength'
import FormFeedback from '@/components/FormFeedback.vue'
import FormDraftNotice from '@/components/FormDraftNotice.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import LoadError from '@/components/LoadError.vue'
import { useFormDraft } from '@/composables/useFormDraft'
import { useDirtyGuard } from '@/composables/useDirtyGuard'
import {
	useFormValidation,
	requiredFields,
} from '@/composables/useFormValidation'
import {
	Badge,
	FormControl,
	createDocumentResource,
	createResource,
	usePageMeta,
	toast,
} from 'frappe-ui'
import { computed, inject, onMounted, reactive, ref, useId, watch } from 'vue'
import { sessionStore } from '@/stores/session'
import { useRouter } from 'vue-router'
import { sanitizeOnWrite } from '@/utils/sanitizeOnWrite'
import { useScreenSize } from '@/utils/composables'
import Link from '@/components/Controls/Link.vue'
import Uploader from '@/components/Controls/Uploader.vue'
import PageHeader from '@/components/Layouts/PageHeader.vue'
import HeaderButton from '@/components/HeaderButton.vue'
import ShortcutTooltip from '@/components/ShortcutTooltip.vue'
import {
	useKeyboardShortcuts,
	saveShortcut,
} from '@/composables/useKeyboardShortcuts'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { InputLabel, InputError } from 'frappe-ui/experimental'
import {
	submitResource,
	resourceErrorMessage,
	reloadResource,
} from '@/utils/resource'

const user = inject('$user')
const router = useRouter()
const { brand } = sessionStore()
const { isMobile } = useScreenSize()
const descriptionLabelId = useId()
const isDirty = ref(false)
const originalJobData = ref(null)

const props = defineProps({
	jobName: {
		type: String,
		default: 'new',
	},
})

onMounted(() => {
	if (!user.data) {
		router.push({
			name: 'Jobs',
		})
	}

	if (props.jobName != 'new') reloadResource(jobDetails)
})

useKeyboardShortcuts({
	ignoreTyping: false,
	shortcuts: [saveShortcut(() => saveJob())],
})

const job = reactive({
	job_title: '',
	type: '',
	work_mode: '',
	location: '',
	country: '',
	status: 'Open',
	description: '',
	company_name: '',
	company_website: '',
	company_email_address: '',
	company_logo: '',
})

originalJobData.value = JSON.parse(JSON.stringify(job))

const jobDetails = createDocumentResource({
	doctype: 'Job Opportunity',
	name: props.jobName != 'new' ? props.jobName : undefined,
	onError(err) {
		toast.error(resourceErrorMessage(err))
		console.error(err)
	},
	auto: props.jobName != 'new',
})

watch(
	() => jobDetails?.doc,
	() => {
		if (!jobDetails.doc || isDirty.value) return
		if (jobDetails.doc.owner != user.data?.name && !user.data?.is_moderator) {
			router.push({
				name: 'Jobs',
			})
		}

		if (jobDetails.doc) {
			Object.assign(job, jobDetails.doc)
			originalJobData.value = JSON.parse(JSON.stringify(jobDetails.doc))
		}
	}
)

watch(
	job,
	() => {
		isDirty.value = Object.keys(job).some((key) => {
			return job[key] != originalJobData.value?.[key]
		})
	},
	{ deep: true }
)

const newJob = createResource({ url: 'frappe.client.insert' })

// jobDetails is undefined for a new job: createDocumentResource needs a name.
const isSaving = computed(
	() => newJob.loading || Boolean(jobDetails?.setValue.loading)
)

const feedback = ref(null)
const { errors, touch, validate } = useFormValidation(() =>
	requiredFields(job, {
		job_title: __('Title'),
		type: __('Type'),
		description: __('Description'),
		company_name: __('Company Name'),
		location: __('City'),
		country: __('Country'),
		company_website: __('Company Website'),
		company_logo: __('Company Logo'),
		company_email_address: __('Company Email Address'),
	})
)
const draftKeys = [
	'job_title',
	'type',
	'work_mode',
	'description',
	'company_name',
	'location',
	'country',
]
const draft = useFormDraft({
	user: () => user.data?.name,
	form: () => `job:${props.jobName}`,
	ready: () => props.jobName === 'new' || Boolean(jobDetails?.doc),
	read: () => Object.fromEntries(draftKeys.map((key) => [key, job[key] ?? ''])),
	apply: (data) => Object.assign(job, data),
})
useDirtyGuard(
	() => isDirty.value,
	() => {
		draft.clear()
		isDirty.value = false
	}
)

const saveJob = () => {
	if (isSaving.value || (props.jobName !== 'new' && !jobDetails?.doc)) return
	validateJobFields()
	if (!validate()) {
		feedback.value?.focusFirst()
		return
	}
	if (jobDetails?.doc) editJobDetails()
	else createNewJob()
}

const createNewJob = () => {
	return submitResource(
		newJob,
		{
			doc: {
				doctype: 'Job Opportunity',
				company_logo: job.company_logo,
				...job,
			},
		},
		{
			onSuccess(data) {
				draft.markSaved()
				isDirty.value = false
				router.push({
					name: 'JobDetail',
					params: {
						job: data.name,
					},
				})
			},
			onError(err) {
				toast.error(resourceErrorMessage(err))
				console.error(err)
			},
		}
	)
}

const editJobDetails = () => {
	return submitResource(
		jobDetails.setValue,
		{
			company_logo: job.company_logo,
			...job,
		},
		{
			onSuccess(data) {
				draft.markSaved()
				isDirty.value = false
				reloadResource(jobDetails)
				router.push({
					name: 'JobDetail',
					params: {
						job: props.jobName,
					},
				})
			},
			onError(err) {
				toast.error(resourceErrorMessage(err))
				console.error(err)
			},
		}
	)
}

const validateJobFields = () => {
	Object.keys(job).forEach((key) => {
		if (typeof job[key] === 'string') {
			job[key] = sanitizeOnWrite(job[key])
		}
	})
}

const jobTypes = computed(() => {
	return [
		{ label: __('Full Time'), value: 'Full Time' },
		{ label: __('Part Time'), value: 'Part Time' },
		{ label: __('Contract'), value: 'Contract' },
		{ label: __('Freelance'), value: 'Freelance' },
	]
})

const workModes = computed(() => {
	return [
		{ label: __('On site'), value: 'On-site' },
		{ label: __('Hybrid'), value: 'Hybrid' },
		{ label: __('Remote'), value: 'Remote' },
	]
})

const jobStatuses = computed(() => {
	return [
		{ label: __('Open'), value: 'Open' },
		{ label: __('Closed'), value: 'Closed' },
	]
})

const breadcrumbs = computed(() => {
	let crumbs = [
		{
			label: __('Jobs'),
			route: { name: 'Jobs' },
		},
		{
			label: props.jobName == 'new' ? __('New Job') : jobDetails.doc?.job_title,
			route:
				props.jobName == 'new'
					? {}
					: { name: 'JobDetail', params: { job: props.jobName } },
		},
	]
	return crumbs
})

usePageMeta(() => {
	return {
		title: props.jobName == 'new' ? __('New Job') : jobDetails.doc?.job_title,
		icon: brand.favicon,
	}
})
</script>
