<template>
	<LoadError
		v-if="topics?.error"
		:error="topics.error"
		compact
		@retry="refreshTopics"
	/>
	<p v-if="topics?.loading" role="status" class="mb-3 text-sm text-ink-gray-7">
		{{ __('Loading discussions...') }}
	</p>
	<p
		v-if="topics?.data?.selected_unavailable"
		role="status"
		class="mb-3 text-sm text-ink-gray-7"
	>
		{{ __('This discussion is no longer available.') }}
	</p>
	<div v-if="!showsEmptyState" data-tour="discussion">
		<Button
			v-if="!singleThread && !readOnlyMode"
			class="float-end"
			@click="openTopicModal()"
		>
			<template #prefix>
				<span class="lucide-plus size-4" />
			</template>
			{{ newTopicLabel }}
		</Button>
		<div
			ref="topicHeading"
			tabindex="-1"
			class="text-ink-gray-9"
			:class="headingSize === 'lg' ? 'text-lg-semibold' : 'text-2xl-semibold'"
		>
			{{ __(title) }}
		</div>
	</div>
	<div
		v-if="topics?.data?.topics?.length && !singleThread"
		class="mt-2 md:flex md:gap-5"
	>
		<!-- Master: topic list (always visible at md+; hidden on mobile while a
		     topic thread is open) -->
		<ul
			ref="topicList"
			class="md:w-2/5 md:shrink-0 md:max-h-[60vh] md:overflow-y-auto md:border-e md:pe-5 list-none"
			:class="{ 'hidden md:block': currentTopic }"
		>
			<li v-for="(topic, index) in topics.data.topics" :key="topic.name">
				<button
					type="button"
					data-testid="topic-row"
					@click="showReplies(topic)"
					class="flex items-center cursor-pointer py-4 px-2 rounded-5 w-full text-start"
					:class="[
						{ 'border-b': index + 1 != topics.data.topics.length },
						currentTopic?.name === topic.name ? 'bg-surface-gray-2' : '',
					]"
				>
					<UserAvatar :user="topic.user" size="xl" class="me-3" />
					<div class="min-w-0">
						<div class="text-base-semibold mb-1 text-ink-gray-7 truncate">
							{{ topic.title }}
						</div>
						<p class="text-sm text-ink-gray-7">
							{{ __(topic.lms_moderation_state || 'Pending') }}
						</p>
						<p v-if="topic.moderation_reason" class="text-sm text-ink-gray-7">
							{{ topic.moderation_reason }}
						</p>
						<div class="flex items-center text-ink-gray-6">
							<span class="text-sm">
								{{ topic.user.full_name }} ·
								{{ discussionDate(topic.created_at || topic.creation) }}
							</span>
							<span class="flex items-center gap-1 text-sm ms-3">
								<span class="lucide-message-square size-3.5" />
								{{
									(topic.reply_count === 1
										? __('{0} reply')
										: __('{0} replies')
									).format(topic.reply_count || 0)
								}}
							</span>
						</div>
					</div>
				</button>
			</li>
		</ul>
		<!-- Detail: selected topic's thread -->
		<div class="flex-1 min-w-0">
			<DiscussionReplies
				v-if="currentTopic"
				:key="currentTopic.name"
				:topic="currentTopic"
				:doctype="props.doctype"
				:docname="props.docname"
				v-model:showTopics="showTopics"
				@reply-count="updateReplyCount"
			/>
		</div>
	</div>
	<div v-else-if="singleThread && topics?.data">
		<DiscussionReplies
			:topic="topics.data"
			:singleThread="singleThread"
			:doctype="props.doctype"
			:docname="props.docname"
		/>
	</div>
	<SkeletonLoader v-else-if="topics?.loading && !topics.data" />
	<!-- Sits under a lesson, so it stays compact rather than filling the view. -->
	<EmptyStateLayout
		data-tour="discussion"
		v-else-if="!singleThread && topics?.data && !topics.error"
		class="!min-h-0 py-10"
		name="Discussions"
		icon="lucide-message-circle"
		width="lg"
		:title="
			emptyStateTitle
				? __(emptyStateTitle)
				: __('No {0} yet').format(__(title).toLowerCase())
		"
		:description="__(emptyStateText)"
	>
		<Button v-if="!readOnlyMode" variant="subtle" @click="openTopicModal()">
			<template #prefix>
				<span class="lucide-plus size-4" />
			</template>
			{{ newTopicLabel }}
		</Button>
	</EmptyStateLayout>
	<nav
		v-if="!singleThread && topics?.data?.total"
		:class="{ 'hidden md:flex': currentTopic }"
		class="mt-4 flex items-center gap-3"
		:aria-label="__('Discussion pages')"
		data-tour="discussion-topic-pages"
	>
		<Button
			type="button"
			class="min-h-11"
			:disabled="topics.loading || topics.data.page <= 1"
			:aria-label="__('Previous topics page')"
			@click="changePage(topics.data.page - 1, $event)"
			>{{ __('Previous') }}</Button
		>
		<p role="status" class="text-sm text-ink-gray-7">
			{{
				__('{0}–{1} of {2} discussions').format(
					topics.data.start,
					topics.data.end,
					topics.data.total
				)
			}}
		</p>
		<Button
			type="button"
			class="min-h-11"
			:disabled="topics.loading || topics.data.end >= topics.data.total"
			:aria-label="__('Next topics page')"
			@click="changePage(topics.data.page + 1, $event)"
			>{{ __('Next') }}</Button
		>
	</nav>
	<DiscussionModal
		:key="identity"
		v-model="showTopicModal"
		:title="newTopicLabel"
		:doctype="props.doctype"
		:docname="props.docname"
		@created="openCreatedTopic"
	/>
</template>
<script setup>
import { reloadResource } from '@/utils/resource'
import { createResource, Button } from 'frappe-ui'
import UserAvatar from '@/components/UserAvatar.vue'
import { discussionDate } from '@/utils/discussion'
import EmptyStateLayout from '@/components/Layouts/EmptyStateLayout.vue'
import {
	computed,
	ref,
	shallowRef,
	nextTick,
	watch,
	onMounted,
	inject,
	onUnmounted,
} from 'vue'
import { useRoute } from 'vue-router'
import LoadError from '@/components/LoadError.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import DiscussionReplies from '@/components/DiscussionReplies.vue'
import DiscussionModal from '@/components/Modals/DiscussionModal.vue'
import { getScrollContainer } from '@/utils/scrollContainer'

const showTopics = ref(true)
const currentTopic = ref(null)
const socket = inject('$socket')
const user = inject('$user')
const showTopicModal = ref(false)
const route = useRoute()
const topicHeading = ref(null)
const topicList = ref(null)
const view = shallowRef(null)
const topics = computed(() => view.value?.resource)
let requestedPage = 1
let selectedName = ''
const newTopicLabel = computed(() =>
	props.doctype === 'Course Lesson' ? __('New Question') : __('New Discussion')
)
const readOnlyMode = window.read_only_mode

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
	emptyStateTitle: {
		type: String,
		default: '',
	},
	emptyStateText: {
		type: String,
		default: 'Start a Discussion',
	},
	singleThread: {
		type: Boolean,
		default: false,
	},
	scrollToBottom: {
		type: Boolean,
		default: false,
	},
	headingSize: {
		type: String,
		default: '2xl',
		validator: (size) => ['lg', '2xl'].includes(size),
	},
})

const identity = computed(() =>
	JSON.stringify([
		user?.data?.name,
		user?.data?.sitename,
		props.doctype,
		props.docname,
		props.singleThread,
	])
)
const loadTopics = (page = requestedPage, focusFrom = null) => {
	const key = identity.value
	if (!user?.data?.name || user.data.name === 'Guest') return
	requestedPage = page
	const prior = view.value?.key === key ? topics.value?.data : null
	topics.value?.abort()
	const resource = createResource({
		url: 'lms.lms.utils.get_discussion_topics',
		params: {
			doctype: props.doctype,
			docname: props.docname,
			single_thread: props.singleThread,
			page,
			discussion: selectedName || undefined,
		},
		initialData: prior,
		onSuccess(data) {
			if (view.value?.resource !== resource || identity.value !== key) return
			if (props.singleThread) return
			requestedPage = data.page
			currentTopic.value =
				data.selected_topic || (selectedName ? null : currentTopic.value)
			if (data.selected_topic) showReplies(data.selected_topic)
			if (data.selected_unavailable) selectedName = ''
			if (
				!currentTopic.value &&
				!data.selected_unavailable &&
				data.topics.length &&
				window.matchMedia?.('(min-width: 768px)').matches
			)
				showReplies(data.topics[0])
			const url = new URL(window.location.href)
			url.searchParams.set('topics_page', String(data.page))
			if (data.selected_unavailable) {
				url.searchParams.delete('discussion')
				url.searchParams.delete('discussion_page')
			}
			window.history.replaceState(window.history.state, '', url)
			if (focusFrom)
				nextTick(() => {
					if (
						view.value?.resource === resource &&
						identity.value === key &&
						(document.activeElement === focusFrom ||
							document.activeElement === document.body)
					)
						(
							topicList.value?.querySelector('button') || topicHeading.value
						)?.focus()
				})
		},
		onError(error) {
			if (view.value?.resource !== resource || identity.value !== key) return
			if ([401, 403].includes(error?.status || error?.httpStatus)) {
				resource.setData(null)
				currentTopic.value = null
			}
		},
	})
	view.value = { key, resource }
	return reloadResource(resource)
}
const refreshTopics = () => loadTopics()
const changePage = (page, event) => loadTopics(page, event?.currentTarget)
watch(
	identity,
	() => {
		topics.value?.abort()
		view.value = null
		currentTopic.value = null
		showTopics.value = true
		showTopicModal.value = false
		const url = new URL(window.location.href)
		selectedName = url.searchParams.get('discussion') || ''
		requestedPage = Number(url.searchParams.get('topics_page')) || 1
		loadTopics()
	},
	{ immediate: true }
)
watch(
	() => [route?.query?.discussion, route?.query?.topics_page],
	([name, page]) => {
		const nextName = typeof name === 'string' ? name : ''
		const nextPage = Number(page) || 1
		if (nextName !== selectedName || nextPage !== requestedPage) {
			selectedName = nextName
			if (!nextName) {
				currentTopic.value = null
				showTopics.value = true
			}
			loadTopics(nextPage)
		}
	}
)
defineExpose({ reload: refreshTopics })
onMounted(() => {
	socket.on('lms_discussion_changed', refreshTopics)
	window.addEventListener('focus', refreshTopics)

	if (props.scrollToBottom) {
		setTimeout(() => {
			scrollToEnd()
		}, 100)
	}
})

const scrollToEnd = () => {
	let scrollContainer = getScrollContainer()
	scrollContainer.scrollTop = scrollContainer.scrollHeight
}

// An empty or failed list gets the whole area; the heading and its New button
// would only repeat what the empty state already says and offers.
const showsEmptyState = computed(
	() =>
		(props.singleThread && Boolean(topics.value?.error)) ||
		(!props.singleThread &&
			topics.value?.data &&
			!topics.value.data.topics?.length)
)

watch(
	() => [user?.data?.name, user?.data?.user_image],
	([name, image], [priorName, priorImage]) => {
		if (name === priorName && image !== priorImage) refreshTopics()
	}
)

const showReplies = (topic) => {
	selectedName = topic.name
	showTopics.value = false
	currentTopic.value = topic
	const url = new URL(window.location.href)
	if (url.searchParams.get('discussion') !== topic.name)
		url.searchParams.delete('discussion_page')
	url.searchParams.set('discussion', topic.name)
	window.history.replaceState(window.history.state, '', url)
}

const updateReplyCount = (name, count) => {
	const topic = topics.value?.data?.topics?.find((topic) => topic.name === name)
	if (topic) topic.reply_count = count
	if (currentTopic.value?.name === name) currentTopic.value.reply_count = count
}

// On wide screens the thread sits beside the list, so open the newest question
// instead of leaving that side empty. Phones show the list or a thread, not
// both, so they keep the list.
// DiscussionReplies' back button (shown only on mobile) sets showTopics = true;
// treat that as "deselect" so the master list returns on small screens.
watch(showTopics, (visible) => {
	if (visible) {
		currentTopic.value = null
		selectedName = ''
		const url = new URL(window.location.href)
		url.searchParams.delete('discussion')
		url.searchParams.delete('discussion_page')
		window.history.replaceState(window.history.state, '', url)
	}
})

const openTopicModal = () => {
	showTopicModal.value = true
}

// After a new question is posted, jump straight into its thread instead of
// leaving the user on the list.
const openCreatedTopic = (topicName) => {
	selectedName = topicName
	return loadTopics(1)
}

onUnmounted(() => {
	topics.value?.abort()
	view.value = null
	socket.off('lms_discussion_changed', refreshTopics)
	window.removeEventListener('focus', refreshTopics)
})
</script>
