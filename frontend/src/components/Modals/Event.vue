<template>
	<Dialog v-model:open="dialogOpen" size="2xl" bare>
		<template #default>
			<div
				class="flex max-h-[85dvh] flex-col overflow-y-auto text-base sm:flex-row"
			>
				<div class="flex w-full min-w-0 flex-col break-words p-5 sm:w-1/2">
					<div class="mb-4 flex items-start justify-between gap-3">
						<Dialog.Title class="text-lg-semibold">{{
							event.title
						}}</Dialog.Title
						><Button
							variant="ghost"
							icon="lucide-x"
							:aria-label="__('Close')"
							@click="dialogOpen = false"
						/>
					</div>
					<Dialog.Description class="sr-only">{{
						__('Dados da avaliação e emissão de certificado.')
					}}</Dialog.Description>

					<div class="flex flex-col space-y-4 text-sm text-ink-gray-8">
						<Tooltip :text="__('Email ID')">
							<div class="flex max-w-full items-center gap-x-2 w-fit">
								<span class="lucide-user h-4 w-4" />
								<span class="min-w-0 break-all">
									{{ event.member }}
								</span>
							</div>
						</Tooltip>
						<Tooltip :text="__('Course')">
							<a
								:href="`/lms/courses/${event.course}`"
								v-external
								class="flex gap-x-2 w-fit cursor-pointer"
							>
								<span class="lucide-book-open h-4 w-4" />
								<span>
									{{ event.course_title }}
								</span>
							</a>
						</Tooltip>
						<Tooltip v-if="event.batch_title" :text="__('Batch')">
							<a
								:href="`/lms/batches/${event.batch_name}#students`"
								v-external
								class="flex gap-x-2 w-fit cursor-pointer"
							>
								<span class="lucide-users h-4 w-4" />
								<span>
									{{ event.batch_title }}
								</span>
							</a>
						</Tooltip>
						<Tooltip :text="__('Date')">
							<div class="flex max-w-full items-center gap-x-2 w-fit">
								<span class="lucide-calendar h-4 w-4" />
								<span>
									{{ dayjs(event.date).format('DD/MM/YYYY') }}
								</span>
							</div>
						</Tooltip>
						<Tooltip :text="__('Time')">
							<div class="flex max-w-full items-center gap-x-2 w-fit">
								<span class="lucide-clock h-4 w-4" />
								<span>
									{{ formatTime(event.start_time) }} -
									{{ formatTime(event.end_time) }}
								</span>
							</div>
						</Tooltip>
						<Tooltip v-if="event.timezone" :text="__('Timezone')">
							<div class="flex max-w-full items-center gap-x-2 w-fit">
								<span class="lucide-globe h-4 w-4" />
								<span>
									{{ formatTimezone(event.timezone, event.date) }}
								</span>
							</div>
						</Tooltip>
					</div>
					<div class="flex items-center gap-x-2 mt-auto">
						<Button
							v-if="certificate.name"
							@click="openCertificate(certificate)"
							class="w-full"
						>
							<template #prefix>
								<span class="lucide-file-text h-4 w-4" />
							</template>
							{{ __('View Certificate') }}
						</Button>
						<Button
							v-else-if="userIsEvaluator()"
							@click="openCallLink(event.venue)"
							class="w-full"
						>
							<template #prefix>
								<span class="lucide-video h-4 w-4" />
							</template>
							<span>
								{{ __('Join Meeting') }}
							</span>
						</Button>
					</div>
				</div>
				<Tabs
					:tabs="tabs"
					v-model="activeTab"
					class="w-full min-w-0 border-t sm:w-1/2 sm:border-s sm:border-t-0"
				>
					<template #tab-panel="{ tab }">
						<div
							v-if="tab.value === 'evaluation'"
							class="flex flex-col space-y-4 p-5"
						>
							<div class="flex items-center justify-between gap-4">
								<Rating
									v-model="evaluation.rating"
									@update:model-value="evaluationDirty = true"
									:label="__('Rating')"
									:disabled="!userIsEvaluator()"
								/>
								<div class="w-1/2">
									<FormControl
										type="select"
										:options="statusOptions"
										v-model="evaluation.status"
										@update:model-value="evaluationDirty = true"
										:label="__('Status')"
										:disabled="!userIsEvaluator()"
									/>
								</div>
							</div>
							<FormControl
								type="textarea"
								v-model="evaluation.summary"
								@update:model-value="evaluationDirty = true"
								:label="__('Summary')"
								:rows="7"
								:disabled="!userIsEvaluator()"
							/>
							<Button
								v-if="userIsEvaluator()"
								variant="solid"
								:loading="evaluationResource.loading"
								@click="saveEvaluation()"
							>
								{{ __('Save') }}
							</Button>
						</div>
						<div v-else class="flex flex-col space-y-4 p-5">
							<BooleanSwitch
								size="sm"
								v-model="certificate.published"
								@update:model-value="certificateDirty = true"
								:label="__('Published')"
								:description="
									__('Make this certificate visible to the participant.')
								"
								:disabled="!userIsEvaluator()"
							/>
							<Link
								v-model="certificate.template"
								@update:model-value="certificateDirty = true"
								:label="__('Template')"
								doctype="Print Format"
								:disabled="!userIsEvaluator()"
								:filters="{
									doc_type: 'LMS Certificate',
								}"
							/>
							<FormControl
								type="date"
								:format="dateFormat"
								v-model="certificate.issue_date"
								@update:model-value="certificateDirty = true"
								:disabled="!userIsEvaluator()"
								:label="__('Issue Date')"
							/>
							<FormControl
								type="date"
								:format="dateFormat"
								v-model="certificate.expiry_date"
								@update:model-value="certificateDirty = true"
								:disabled="!userIsEvaluator()"
								:label="__('Expiry Date')"
							/>
							<Button
								v-if="userIsEvaluator()"
								variant="solid"
								:loading="certificateResource.loading"
								@click="saveCertificate()"
							>
								{{ __('Save') }}
							</Button>
						</div>
					</template>
				</Tabs>
			</div>
		</template>
	</Dialog>
	<Dialog
		v-model:open="confirmDiscard"
		:title="__('Descartar alterações?')"
		:message="
			__(
				'Há alterações não salvas nesta avaliação. Feche somente se desejar descartá-las.'
			)
		"
		:actions="discardActions"
	/>
</template>
<script setup>
import {
	Button,
	Dialog,
	FormControl,
	Rating,
	Tabs,
	Tooltip,
	createResource,
	toast,
} from 'frappe-ui'
import { submitResource, resourceErrorMessage } from '@/utils/resource'
import BooleanSwitch from '@/components/Controls/BooleanSwitch.vue'
import { inject, reactive, watch, ref, computed } from 'vue'
import { formatTime } from '@/utils'
import { formatTimezone } from '@/utils/timezone'
import { getDateFormat } from '@/utils/format'
import Link from '@/components/Controls/Link.vue'
import { openExternal } from '@/utils/openExternal'

const show = defineModel()
const evaluationDirty = ref(false),
	certificateDirty = ref(false),
	confirmDiscard = ref(false)
const dialogOpen = computed({
	get: () => show.value,
	set: (value) => {
		if (!value && (evaluationDirty.value || certificateDirty.value))
			confirmDiscard.value = true
		else show.value = value
	},
})
const discardActions = computed(() => [
	{ label: __('Continuar editando'), onClick: ({ close }) => close() },
	{
		label: __('Descartar alterações'),
		theme: 'red',
		onClick: ({ close }) => {
			evaluationDirty.value = false
			certificateDirty.value = false
			show.value = false
			close()
		},
	},
])

const user = inject('$user')
const dayjs = inject('$dayjs')
const activeTab = ref('evaluation')
const dateFormat = getDateFormat()
const showCertification = ref(false)
const evaluation = reactive({})
const certificate = reactive({})

const props = defineProps({
	event: {
		type: [Object, null],
		required: true,
	},
})

watch(user, () => {
	if (userIsEvaluator()) {
		defaultTemplate.reload()
	}
})

const userIsEvaluator = () => {
	return user.data && user.data.name == props.event.evaluator
}

const defaultTemplate = createResource({
	url: 'frappe.client.get_value',
	makeParams(values) {
		return {
			doctype: 'Property Setter',
			fieldname: 'value',
			filters: {
				doc_type: 'LMS Certificate',
				property: 'default_print_format',
			},
		}
	},
	onSuccess(data) {
		certificate.template = data.value
	},
})

const openCallLink = (link) => {
	openExternal(link)
}

const evaluationResource = createResource({
	url: 'lms.lms.api.save_evaluation_details',
	makeParams(values) {
		return {
			member: props.event.member,
			course: props.event.course,
			batch_name: props.event.batch_name,
			date_value: props.event.date,
			start_time: props.event.start_time,
			end_time: props.event.end_time,
			status: evaluation.status,
			rating: evaluation.rating,
			summary: evaluation.summary,
		}
	},
	auto: false,
	onSuccess(data) {
		evaluation.name = data.name
	},
})

const evaluationDetails = createResource({
	url: 'frappe.client.get',
	makeParams(values) {
		return {
			doctype: 'LMS Certificate Evaluation',
			filters: {
				member: props.event.member,
				course: props.event.course,
				batch_name: props.event.batch_name || ['is', 'not set'],
			},
		}
	},
	onSuccess(data) {
		for (const key in data) {
			if (key in evaluation) evaluation[key] = data[key]
			if (key == 'rating') evaluation.rating = data.rating * 5
			if (evaluation.status == 'Pass') showCertification.value = true
		}
	},
	auto: false,
})

const saveEvaluation = () => {
	if (evaluationResource.loading) return
	submitResource(
		evaluationResource,
		{},
		{
			onSuccess: () => {
				if (evaluation.status == 'Pass') {
					showCertification.value = true
				} else {
					show.value = false
				}
				evaluationDirty.value = false
				toast.success(__('Evaluation saved successfully'))
			},
			onError(err) {
				toast.warning(resourceErrorMessage(err))
			},
		}
	)
}

const certificateResource = createResource({
	url: 'lms.lms.api.save_certificate_details',
	makeParams(values) {
		return {
			member: props.event.member,
			course: props.event.course,
			batch_name: props.event.batch_name,
			published: certificate.published,
			issue_date: certificate.issue_date,
			expiry_date: certificate.expiry_date,
			template: certificate.template,
		}
	},
	auto: false,
	onSuccess(data) {
		certificate.name = data
	},
	onError(err) {
		toast.warning(resourceErrorMessage(err))
	},
})

const certificateDetails = createResource({
	url: 'frappe.client.get',
	makeParams(values) {
		return {
			doctype: 'LMS Certificate',
			filters: {
				member: props.event.member,
				course: props.event.course,
				batch_name: props.event.batch_name || ['is', 'not set'],
			},
		}
	},
	onSuccess(data) {
		for (const key in data) {
			if (key in certificate) certificate[key] = data[key]
			certificate.name = data.name
			showCertification.value = true
		}
	},
	onError(err) {
		certificate.template = defaultTemplate.data?.value
	},
	auto: false,
})

const saveCertificate = () => {
	if (certificateResource.loading) return
	submitResource(
		certificateResource,
		{},
		{
			onSuccess: () => {
				certificateDirty.value = false
				toast.success(__('Certificate saved successfully'))
			},
			onError(err) {
				toast.error(resourceErrorMessage(err))
			},
		}
	)
}

watch(show, () => {
	if (show.value) {
		evaluationDirty.value = false
		certificateDirty.value = false
		evaluation.rating = 0
		evaluation.status = 'Pending'
		evaluation.summary = ''
		evaluationDetails.reload()

		certificate.published = true
		certificate.issue_date = dayjs().format('YYYY-MM-DD')
		certificate.expiry_date = null
		certificate.template = null
		certificate.name = null
		certificateDetails.reload()
	}
})

const openCertificate = (certificate) => {
	openExternal(
		`/api/method/frappe.utils.print_format.download_pdf?doctype=LMS+Certificate&name=${
			certificate.name
		}&format=${encodeURIComponent(certificate.template)}&no_letterhead=1`
	)
}

const statusOptions = computed(() => {
	return [
		{
			value: 'Pending',
			label: __('Pending'),
		},
		{
			value: 'In Progress',
			label: __('In Progress'),
		},
		{
			value: 'Pass',
			label: __('Pass'),
		},
		{
			value: 'Fail',
			label: __('Fail'),
		},
	]
})

const tabs = computed(() => {
	const tabsArray = [
		{
			value: 'evaluation',
			label: __('Evaluation'),
			iconLeft: 'lucide-clipboard-list',
		},
	]

	if (showCertification.value) {
		tabsArray.push({
			value: 'certification',
			label: __('Certification'),
			iconLeft: 'lucide-graduation-cap',
		})
	}

	return tabsArray
})
</script>
