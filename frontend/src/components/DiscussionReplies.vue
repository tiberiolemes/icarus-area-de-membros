<template>
	<div class="mt-6">
		<LoadError
			v-if="replies.error"
			:error="replies.error"
			compact
			@retry="reloadReplies"
		/>
		<SkeletonLoader v-else-if="replies.loading && !replies.data" />
		<div v-if="!singleThread" class="flex items-center mb-5 md:hidden">
			<Button
				variant="outline"
				class="text-p-base-medium"
				:label="__('Back to topics')"
				@click="showTopics = true"
			>
				<template #icon>
					<span class="lucide-chevron-left size-5 text-ink-gray-7" />
				</template>
			</Button>
			<span class="text-lg-semibold ms-2 text-ink-gray-9">
				{{ topic.title }}
			</span>
		</div>
		<div
			v-if="!singleThread"
			class="hidden md:block text-lg-semibold mb-5 text-ink-gray-9"
		>
			{{ topic.title }}
		</div>

		<div
			v-if="singleThread && replies.data && !threadRows.length"
			class="mb-5 flex items-center gap-3 rounded-5 bg-surface-gray-1 p-4"
		>
			<span
				class="lucide-message-circle size-5 shrink-0 text-ink-gray-5"
				aria-hidden="true"
			/>
			<div class="space-y-0.5">
				<div class="text-base-medium text-ink-gray-8">
					{{ __('Start the conversation') }}
				</div>
				<div class="text-p-sm text-ink-gray-6">
					{{
						__(
							'Ask a question or share something useful. Approved messages are visible to authorized participants.'
						)
					}}
				</div>
			</div>
		</div>

		<section class="mb-5" :aria-label="__('Your reply')">
			<ErrorMessage v-if="saveError" :message="saveError" class="my-3" />
			<RichTextEditor
				v-if="renderEditor && !readOnlyMode"
				ref="newReplyEditor"
				:ariaRequired="true"
				:ariaInvalid="Boolean(replyErrors.new)"
				:ariaDescribedby="
					replyErrors.new ? `${replyErrorPrefix}-new` : undefined
				"
				@blur="validateReply('new', newReply)"
				:ariaLabel="__('Your reply')"
				:content="newReply"
				:mentions="mentionUsers"
				@change="(val) => (newReply = val)"
				:placeholder="__('Type your reply here...')"
				:fixedMenu="true"
				minHeight="7rem"
			/>
			<InputError
				v-if="replyErrors.new"
				:id="`${replyErrorPrefix}-new`"
				:lines="[replyErrors.new]"
			/>
			<p role="status" class="my-3 text-sm text-ink-gray-7">
				{{ __('Messages are published after manual approval.') }}
			</p>
			<Button
				v-if="!readOnlyMode"
				:loading="newReplyResource.loading"
				@click="postReply()"
				>{{ __('Post') }}</Button
			>
		</section>
		<ul class="list-none">
			<li v-for="(reply, index) in threadRows" :key="reply.name">
				<div
					class="py-3"
					:class="{ 'border-b': index + 1 != threadRows.length }"
				>
					<div class="flex items-center justify-between mb-2">
						<div class="flex items-center text-ink-gray-6">
							<UserAvatar :user="reply.user" class="me-2" />
							<span>
								{{ reply.user.full_name }}
							</span>
							<span class="text-sm ms-2">
								{{ discussionDate(reply.created_at || reply.creation) }}
							</span>
						</div>
						<Dropdown
							v-if="
								user.data.name == reply.owner &&
								!isEditing(reply) &&
								!readOnlyMode
							"
							:options="[
								{
									label: __('Edit'),
									onClick() {
										startEdit(reply)
									},
								},
								{
									label: __('Withdraw message'),
									onClick() {
										deleteReply(reply)
									},
								},
							]"
						>
							<template #default>
								<Button variant="ghost" :label="__('Reply actions')">
									<template #icon>
										<span class="lucide-more-horizontal size-4" />
									</template>
								</Button>
							</template>
						</Dropdown>
						<div v-if="isEditing(reply)">
							<Button
								variant="ghost"
								:loading="savingReply === reply.name"
								:disabled="Boolean(savingReply) && savingReply !== reply.name"
								@click="postEdited(reply)"
							>
								{{ __('Post') }}
							</Button>
							<Button
								variant="ghost"
								@click="discardEdit(reply)"
								:disabled="savingReply === reply.name"
							>
								{{ __('Discard') }}
							</Button>
						</div>
					</div>
					<p class="mb-2 text-sm text-ink-gray-7">
						{{ __(reply.lms_moderation_state || 'Pending') }}
					</p>
					<p
						v-if="reply.moderation_reason"
						class="mb-2 text-sm text-ink-gray-7"
					>
						{{ reply.moderation_reason }}
					</p>
					<RichTextEditor
						:ref="
							(element) => {
								if (element) replyEditors.set(reply.name, element)
								else replyEditors.delete(reply.name)
							}
						"
						:ariaInvalid="Boolean(replyErrors[reply.name])"
						:ariaDescribedby="
							replyErrors[reply.name]
								? `${replyErrorPrefix}-${index}`
								: undefined
						"
						@blur="
							() => {
								if (isEditing(reply))
									validateReply(reply.name, editing[reply.name])
							}
						"
						:ariaLabel="__('Reply by {0}').format(reply.user.full_name)"
						:content="isEditing(reply) ? editing[reply.name] : reply.reply"
						@change="
							(val) => {
								if (isEditing(reply)) editing[reply.name] = val
							}
						"
						:editable="isEditing(reply) && savingReply !== reply.name"
						:fixedMenu="isEditing(reply)"
						:variant="isEditing(reply) ? 'outline' : 'ghost'"
						:editorClass="
							isEditing(reply)
								? 'prose-table:table-fixed prose-td:p-2 prose-th:p-2 prose-td:border prose-th:border prose-td:border-outline-gray-2 prose-th:border-outline-gray-2 prose-td:relative prose-th:relative prose-th:bg-surface-gray-2 prose-sm'
								: 'prose-sm'
						"
					/>
					<InputError
						v-if="replyErrors[reply.name]"
						:id="`${replyErrorPrefix}-${index}`"
						:lines="[replyErrors[reply.name]]"
					/>
				</div>
			</li>
		</ul>
		<div
			v-if="replies.data?.total && !replies.error"
			class="mt-4 flex flex-wrap items-center gap-3"
		>
			<p role="status">
				{{
					__('Responses {0}–{1} of {2}').format(
						replies.data.start,
						replies.data.end,
						replies.data.total
					)
				}}
			</p>
			<Button
				v-if="!page && replies.data.total > 3"
				:disabled="replies.loading"
				@click="changePage(1)"
				>{{ __('Show more responses') }}</Button
			>
			<template v-if="page">
				<Button :disabled="replies.loading" @click="changePage(page - 1)">{{
					__('Previous')
				}}</Button>
				<Button
					:disabled="replies.loading || replies.data.end >= replies.data.total"
					@click="changePage(page + 1)"
					>{{ __('Next') }}</Button
				>
			</template>
		</div>

		<Dialog
			:open="Boolean(replyToDelete)"
			:title="__('Withdraw message')"
			:message="__('Withdraw this message? Its history will be preserved.')"
			size="sm"
			@update:open="
				(open) => {
					if (!open && !deletingReply) replyToDelete = null
				}
			"
		>
			<template #actions>
				<Button
					:label="__('Cancel')"
					:disabled="deletingReply"
					@click="replyToDelete = null"
				/>
				<Button
					:label="__('Withdraw message')"
					theme="red"
					variant="solid"
					:loading="deletingReply"
					@click="confirmDelete"
				/>
			</template>
		</Dialog>
	</div>
</template>
<script setup>
import {
	call,
	createResource,
	Button,
	Dialog,
	Dropdown,
	ErrorMessage,
	toast,
} from 'frappe-ui'
import { InputError } from 'frappe-ui/experimental'
import { discussionDate } from '@/utils/discussion'
import UserAvatar from '@/components/UserAvatar.vue'
import {
	computed,
	ref,
	reactive,
	inject,
	onMounted,
	onUnmounted,
	useId,
	watch,
} from 'vue'
import { useTelemetry } from '@framework/ui/telemetry/index'
import RichTextEditor from '@/components/RichTextEditor.vue'
import LoadError from '@/components/LoadError.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import { useDirtyGuard } from '@/composables/useDirtyGuard'
import { hasContent } from '@/composables/useFormValidation'
import {
	submitResource,
	resourceErrorMessage,
	reloadResource,
} from '@/utils/resource'

const showTopics = defineModel('showTopics')
const emit = defineEmits(['reply-count'])
const newReply = ref('')
const socket = inject('$socket')
const user = inject('$user')
const allUsers = inject('$allUsers')
const mentionUsers = ref([])
const renderEditor = ref(false)
const readOnlyMode = window.read_only_mode
const { capture } = useTelemetry()

const props = defineProps({
	topic: {
		type: Object,
		required: true,
	},
	singleThread: {
		type: Boolean,
		default: false,
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

const page = ref(
	Math.max(
		0,
		Number(new URL(window.location.href).searchParams.get('discussion_page')) ||
			0
	)
)
const threadRows = computed(() =>
	replies.data && !replies.error
		? [replies.data.root, ...(replies.data.replies || [])].filter(Boolean)
		: []
)
const changePage = (value) => {
	page.value = value
	const url = new URL(window.location.href)
	url.searchParams.set('discussion', props.topic.name)
	url.searchParams.set('discussion_page', String(value))
	window.history.replaceState(window.history.state, '', url)
	return reloadReplies()
}
const reloadReplies = () => reloadResource(replies)
const refreshEvent = (event) => {
	if (!event?.topic || event.topic === props.topic.name) reloadReplies()
}
onMounted(() => {
	socket.on('lms_discussion_changed', refreshEvent)
	window.addEventListener('focus', refreshEvent)
	fetchMentionUsers()
})

const replies = createResource({
	url: 'lms.lms.utils.get_discussion_replies',
	cache: ['replies', props.topic.name],
	makeParams(values) {
		return {
			topic: props.topic.name,
			page: page.value,
		}
	},
	auto: true,
	onSuccess(data) {
		page.value = data.page
		emit('reply-count', props.topic.name, data.total)
	},
})

watch(() => user?.data?.user_image, reloadReplies)

const fetchMentionUsers = () => {
	// Render the editor right away; the @ menu reads mentionUsers live, so it
	// fills in once the user list resolves.
	renderEditor.value = true
	if (user.data?.is_student) return
	allUsers.reload(
		{ doctype: props.doctype, docname: props.docname },
		{
			onSuccess(data) {
				// The username is the stored id; the list and the mention show the name.
				mentionUsers.value = Object.values(data).map((user) => {
					return {
						value: user.username,
						label: user.full_name,
					}
				})
			},
		}
	)
}

const replyErrorPrefix = useId()
const replyErrors = reactive({})
const newReplyEditor = ref(null)
const replyEditors = new Map()
const validateReply = (name, value) => {
	replyErrors[name] = hasContent(value) ? '' : __('Reply cannot be empty.')
	return !replyErrors[name]
}
watch(newReply, (value) => {
	if (replyErrors.new) validateReply('new', value)
})

const newReplyResource = createResource({ url: 'frappe.client.insert' })

const postReply = () => {
	if (newReplyResource.loading) return
	saveError.value = ''
	if (!validateReply('new', newReply.value)) {
		newReplyEditor.value?.focus()
		return
	}
	submitResource(
		newReplyResource,
		{
			doc: {
				doctype: 'Discussion Reply',
				reply: newReply.value,
				topic: props.topic.name,
			},
		},
		{
			onSuccess() {
				newReply.value = ''
				replyErrors.new = ''
				reloadReplies()
				newReplyEditor.value?.focus()
				capture('discussion_reply_created')
			},
			onError(err) {
				saveError.value = resourceErrorMessage(err)
				toast.error(saveError.value)
			},
		}
	)
}

const editing = reactive({})
watch(
	editing,
	() => {
		for (const name of Object.keys(editing))
			if (replyErrors[name]) validateReply(name, editing[name])
	},
	{ deep: true }
)
const savingReply = ref(null)
const saveError = ref('')
const replyToDelete = ref(null)
const deletingReply = ref(false)
const isEditing = (reply) => Object.hasOwn(editing, reply.name)
const startEdit = (reply) => {
	replyErrors[reply.name] = ''
	editing[reply.name] = reply.reply
	saveError.value = ''
}
const discardEdit = (reply) => {
	delete replyErrors[reply.name]
	delete editing[reply.name]
	saveError.value = ''
}
useDirtyGuard(
	() =>
		hasContent(newReply.value) ||
		Object.entries(editing).some(
			([name, value]) =>
				value !== threadRows.value.find((reply) => reply.name === name)?.reply
		),
	() => {
		newReply.value = ''
		for (const name of Object.keys(editing)) delete editing[name]
	}
)
const postEdited = async (reply) => {
	if (savingReply.value || !isEditing(reply)) return
	if (!validateReply(reply.name, editing[reply.name])) {
		replyEditors.get(reply.name)?.focus()
		return
	}
	savingReply.value = reply.name
	saveError.value = ''
	try {
		await call('frappe.client.set_value', {
			doctype: 'Discussion Reply',
			name: reply.name,
			fieldname: 'reply',
			value: editing[reply.name],
		})
		delete editing[reply.name]
		await reloadReplies()
		toast.success(__('Saved'))
	} catch (err) {
		saveError.value = resourceErrorMessage(err)
		toast.error(saveError.value)
	} finally {
		savingReply.value = null
	}
}
const deleteReply = (reply) => {
	replyToDelete.value = reply
}
const confirmDelete = async () => {
	if (!replyToDelete.value || deletingReply.value) return
	deletingReply.value = true
	try {
		await call('lms.lms.moderation.withdraw', {
			name: replyToDelete.value.name,
		})
		delete editing[replyToDelete.value.name]
		replyToDelete.value = null
		await reloadReplies()
	} catch (err) {
		saveError.value = resourceErrorMessage(err)
		toast.error(saveError.value)
	} finally {
		deletingReply.value = false
	}
}

onUnmounted(() => {
	socket.off('lms_discussion_changed', refreshEvent)
	window.removeEventListener('focus', refreshEvent)
})
</script>
