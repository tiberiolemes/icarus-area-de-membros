<template>
	<Dialog
		v-model:open="open"
		:title="singularize(props.title)"
		size="2xl"
		:actions="[
			{
				label: __('Post'),
				variant: 'solid',
				onClick: ({ close }) => submitTopic(close),
			},
		]"
	>
		<template #default>
			<div class="flex flex-col gap-4">
				<ErrorMessage v-if="saveError" :message="saveError" />
				<div ref="titleField">
					<FormControl
						v-model="topic.title"
						:description="textLengthInfo(topic.title, 140)"
						:label="__('Title')"
						type="text"
						variant="outline"
						maxlength="140"
					>
						<template #description>{{
							textLengthInfo(topic.title, 140)
						}}</template>
					</FormControl>
					<InputError v-if="errors.title" :lines="[errors.title]" />
				</div>
				<div>
					<InputLabel
						:id="detailsLabelId"
						class="mb-1.5"
						:label="__('Details')"
					/>
					<RichTextEditor
						ref="detailsEditor"
						:ariaLabelledby="detailsLabelId"
						:content="topic.reply"
						@change="(val) => (topic.reply = val)"
						:editable="true"
						:fixedMenu="true"
						minHeight="7rem"
					/>
					<InputError v-if="errors.reply" :lines="[errors.reply]" />
				</div>
			</div>
		</template>
	</Dialog>
</template>
<script setup>
import { textLengthInfo } from '@/utils/textLength'
import { call, Dialog, ErrorMessage, FormControl } from 'frappe-ui'
import { reactive, ref, useId, watch } from 'vue'
import { InputError, InputLabel } from 'frappe-ui/experimental'
import { singularize } from '@/utils'
import { useTelemetry } from '@framework/ui/telemetry/index'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { hasContent } from '@/composables/useFormValidation'
import { useDirtyGuard } from '@/composables/useDirtyGuard'
import { resourceErrorMessage } from '@/utils/resource'

const open = defineModel('modelValue')
const emit = defineEmits(['created'])
const { capture } = useTelemetry()
const detailsLabelId = useId()
const saving = ref(false)
const saveError = ref('')
const errors = reactive({ title: '', reply: '' })
const titleField = ref(null)
const detailsEditor = ref(null)

const props = defineProps({
	title: {
		type: String,
		required: true,
	},
	doctype: {
		type: String,
		required: true,
	},
	docname: {
		type: String,
		required: true,
	},
})

const topic = reactive({
	title: '',
	reply: '',
})
useDirtyGuard(() => Boolean(topic.title.trim() || hasContent(topic.reply)))
watch(
	() => topic.title,
	() => {
		if (errors.title && topic.title.trim()) errors.title = ''
	}
)
watch(
	() => topic.reply,
	() => {
		if (errors.reply && hasContent(topic.reply)) errors.reply = ''
	}
)

const submitTopic = (close) => {
	if (saving.value) return
	saveError.value = ''
	errors.title = topic.title.trim() ? '' : __('Title cannot be empty.')
	errors.reply = hasContent(topic.reply) ? '' : __('Details cannot be empty.')
	if (errors.title || errors.reply) {
		if (errors.title) titleField.value?.querySelector('input')?.focus()
		else detailsEditor.value?.focus()
		return
	}
	saving.value = true
	// Returned so the Dialog keeps Post loading, and so disabled, until the
	// topic and its first reply are saved.
	return call('lms.lms.moderation.create_topic', {
		doctype: props.doctype,
		docname: props.docname,
		title: topic.title,
		reply: topic.reply,
	})
		.then((data) => {
			topic.title = ''
			topic.reply = ''
			capture('discussion_topic_created')
			close()
			emit('created', data.name)
		})
		.catch((err) => {
			saveError.value = resourceErrorMessage(err)
		})
		.finally(() => {
			saving.value = false
		})
}
</script>
