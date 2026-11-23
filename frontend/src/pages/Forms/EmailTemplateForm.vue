<template>
	<FormShell
		:title="__('New Email Template')"
		size="lg"
		:message="refusal"
		@close="close"
	>
		<template #default>
			<FormDraftNotice :draft="draft" />
			<FormFeedback ref="feedback" :errors="errors" @field-blur="touch">
				<div
					data-testid="email-template-fields"
					:inert="createTemplate.loading"
					class="space-y-4"
				>
					<FormControl
						v-model="template.name"
						:description="textLengthInfo(template.name, 140)"
						data-field="name"
						:error="errors.name"
						type="text"
						:label="__('Name')"
						:required="true"
						:placeholder="__('Batch Enrollment Confirmation')"
					>
						<template #description>{{
							textLengthInfo(template.name, 140)
						}}</template>
					</FormControl>
					<FormControl
						v-model="template.subject"
						:description="textLengthInfo(template.subject, 140)"
						data-field="subject"
						:error="errors.subject"
						type="text"
						:label="__('Subject')"
						:required="true"
						:placeholder="
							__('Your enrollment in {{ batch_name }} is confirmed')
						"
					>
						<template #description>{{
							textLengthInfo(template.subject, 140)
						}}</template>
					</FormControl>
					<BooleanSwitch
						v-model="template.use_html"
						size="sm"
						:label="__('Use HTML')"
						:description="__('Use HTML content for the email response')"
					/>
					<FormControl
						v-if="template.use_html"
						v-model="template.response_html"
						data-field="response_html"
						:error="errors.response_html"
						type="textarea"
						:label="__('Content')"
						:required="true"
						:placeholder="htmlPlaceholder"
					/>
					<div
						v-else
						role="group"
						data-field="response"
						:aria-labelledby="contentLabelId"
						class="space-y-1.5"
					>
						<InputLabel
							:id="contentLabelId"
							:label="__('Content')"
							:required="true"
						/>
						<RichTextEditor
							:ariaLabelledby="contentLabelId"
							:content="template.response"
							:ariaRequired="true"
							:ariaInvalid="Boolean(errors.response)"
							:ariaDescribedby="
								errors.response ? `${contentLabelId}-error` : undefined
							"
							:editable="true"
							:fixedMenu="true"
							:placeholder="richPlaceholder"
							minHeight="7rem"
							maxHeight="18rem"
							@change="(val) => (template.response = val)"
						/>
						<InputError
							v-if="errors.response"
							:id="`${contentLabelId}-error`"
							:lines="[errors.response]"
						/>
					</div>
				</div>
			</FormFeedback>
		</template>
		<template #actions>
			<HeaderButton
				data-testid="email-template-save"
				:label="__('Create')"
				variant="solid"
				:loading="createTemplate.loading"
				@click="submit"
			/>
		</template>
	</FormShell>
</template>
<script setup>
import { textLengthInfo } from '@/utils/textLength'
import {
	FormControl,
	createResource,
	getCachedListResource,
	toast,
} from 'frappe-ui'
import { computed, inject, reactive, ref, useId } from 'vue'
import { useRoute } from 'vue-router'
import BooleanSwitch from '@/components/Controls/BooleanSwitch.vue'
import { InputLabel, InputError } from 'frappe-ui/experimental'
import FormFeedback from '@/components/FormFeedback.vue'
import FormDraftNotice from '@/components/FormDraftNotice.vue'
import { useFormDraft } from '@/composables/useFormDraft'
import {
	useFormValidation,
	requiredFields,
} from '@/composables/useFormValidation'
import FormShell from '@/components/FormShell.vue'
import HeaderButton from '@/components/HeaderButton.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { cleanError } from '@/utils'
import { batchRouteLocation } from '@/composables/useBatchForms'
import { useFormRoute } from '@/composables/useFormRoute'
import { submitResource } from '@/utils/resource'

const props = defineProps({
	batchName: {
		type: String,
		required: true,
	},
})

const user = inject('$user')
const route = useRoute()
const readOnlyMode = window.read_only_mode
const contentLabelId = useId()

const { close, saveAndReplace } = useFormRoute(
	batchRouteLocation('BatchDetail', props.batchName, route.hash)
)

// The modal had no gate of its own — it was unreachable except through
// BatchDetail's settings tab, which is `is_moderator || is_evaluator`
// (BatchDetail.vue:178-180). A URL does not go through that tab, so the tab's
// check has to be restated here.
//
// UX gate, not an authorization boundary — Email Template's server-side
// permission check is.
const refusal = computed(() => {
	if (readOnlyMode) return __('This site is in read-only mode.')
	if (!user.data?.is_moderator && !user.data?.is_evaluator) {
		return __('You do not have permission to create email templates.')
	}
	return ''
})

const template = reactive({
	name: '',
	subject: '',
	use_html: false,
	response: '',
	response_html: '',
})

const htmlPlaceholder = __(
	'<p>Dear {{ member_name }},</p>\n\n<p>You have been enrolled in our upcoming batch {{ batch_name }}.</p>\n\n<p>Thanks,</p>\n<p>Frappe Learning</p>'
)
const richPlaceholder = __(
	'Dear {{ member_name }},\n\nYou have been enrolled in our upcoming batch {{ batch_name }}.\n\nThanks,\nFrappe Learning'
)

// Its own insert, not the parent list resource the modal borrowed through
// v-model — on a deep link no BatchForm is mounted to lend one. Deliberately a
// plain resource: a list resource's insert fires an unfiltered list fetch on
// every success, and this page never renders a list.
// `__newname` because Email Template autonames by Prompt.
const createTemplate = createResource({
	url: 'frappe.client.insert',
	makeParams() {
		return {
			doc: {
				doctype: 'Email Template',
				__newname: template.name,
				name: template.name,
				subject: template.subject,
				use_html: template.use_html ? 1 : 0,
				response: template.response,
				response_html: template.response_html,
			},
		}
	},
})

// Settings' template list shares this cache key. A lookup, NOT
// createListResource — a constructor here would win the cache and hand
// EmailTemplateList.vue an instance carrying this file's options. Null when
// nothing is mounted on that key, which is the common case.
const reloadTemplateList = () => {
	getCachedListResource('email-templates')?.reload()
}

const feedback = ref(null)
const { errors, touch, validate } = useFormValidation(() =>
	requiredFields(template, {
		name: __('Name'),
		subject: __('Subject'),
		[template.use_html ? 'response_html' : 'response']: __('Content'),
	})
)
const draft = useFormDraft({
	user: () => user.data?.name,
	form: () => `email-template:${props.batchName}`,
	canEdit: () => !refusal.value,
	read: () => ({ ...template }),
	apply: (data) => Object.assign(template, data),
})

const submit = () => {
	if (refusal.value || createTemplate.loading) return
	if (!validate()) {
		feedback.value?.focusFirst()
		return
	}
	submitResource(
		createTemplate,
		{},
		{
			onSuccess() {
				draft.markSaved()
				reloadTemplateList()
				toast.success(__('Email Template created successfully'))
				// The modal emitted `created` and BatchForm wrote the name into
				// confirmation_email_template. A route cannot emit, and on a deep
				// link there is no BatchForm to emit at, so the name is handed back
				// through the URL instead; BatchForm.vue adopts and strips it.
				//
				// The hash has to name the Settings tab when there isn't one to
				// carry over. BatchForm only exists on that tab, and a cold deep
				// link arrives with an empty hash, which TabbedDetailPage resolves
				// to tab 0 — so the adopter would never mount, the template would
				// be created with confirmation_email_template silently unset, and
				// the `?emailTemplate=` would sit in the URL until the user
				// happened to open Settings, at which point it would apply itself
				// and trip the dirty-autosave out of nowhere.
				saveAndReplace({
					name: 'BatchDetail',
					params: { batchName: props.batchName },
					hash: route.hash || '#settings',
					query: { emailTemplate: template.name },
				})
			},
			onError(err) {
				toast.error(
					cleanError(err.messages?.[0]) || __('Error creating email template')
				)
			},
		}
	)
}
</script>
