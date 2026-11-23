<template>
	<main
		class="mx-auto w-full max-w-6xl p-4 md:p-8"
		:data-tour-context="`Community:${
			!access.data?.can_access && tab === 'posts'
				? 'inactive'
				: tab === 'access'
				? 'grants'
				: tab
		}`"
	>
		<h1 class="mb-2 text-2xl font-semibold text-ink-gray-9">
			{{ __('Community') }}
		</h1>
		<p class="mb-5 text-ink-gray-7">{{ access.data?.title }}</p>
		<LoadError
			v-if="access.error"
			:error="access.error"
			@retry="access.reload()"
		/>
		<p v-else-if="access.loading && !access.data" role="status">
			{{ __('Loading…') }}
		</p>
		<template v-if="access.data">
			<nav
				v-if="access.data.is_admin"
				class="mb-6 flex flex-wrap gap-2"
				:aria-label="__('Community administration')"
			>
				<Button
					v-for="item in tabs"
					:key="item.value"
					:variant="tab === item.value ? 'solid' : 'outline'"
					:aria-pressed="tab === item.value"
					@click="selectTab(item.value)"
					>{{ __(item.label) }}</Button
				>
			</nav>
			<section v-show="tab === 'posts'" data-tour="community-posts">
				<Discussions
					v-if="access.data.can_access"
					ref="discussionRef"
					:title="__('Community posts')"
					doctype="LMS Community"
					:docname="access.data.name"
					:emptyStateText="__('Start a Discussion')"
				/>
				<div v-else class="py-5">
					<h2 class="mb-2 text-lg font-semibold">
						{{ __('Community access is not active') }}
					</h2>
					<p>
						{{
							__(
								'Your course history is preserved. Contact the administration to review community access.'
							)
						}}
					</p>
					<ul class="mt-4 space-y-2">
						<li v-for="grant in access.data.grants" :key="grant.name">
							{{ __(grant.state) }} · {{ discussionDate(grant.starts_at) }} –
							{{ discussionDate(grant.ends_at) }}
						</li>
					</ul>
				</div>
			</section>
			<section
				v-if="tab === 'queue' && access.data.is_admin"
				data-tour="moderation-queue"
			>
				<h2 class="mb-3 text-lg font-semibold">
					{{ __('Manual approval queue') }}
				</h2>
				<Button :disabled="Boolean(busy)" @click="loadQueue">{{
					__('Refresh')
				}}</Button>
				<FormControl
					type="select"
					:label="__('Publication state')"
					:options="states"
					v-model="queueState"
					@change="changeQueueState"
				/>
				<p v-if="!queueRows.length && !busy" class="my-5">
					{{ __('No messages in this state.') }}
				</p>
				<article
					v-for="row in queueRows"
					:key="`${row.doctype}:${row.name}`"
					class="border-b py-5"
				>
					<h3 class="mb-2 font-semibold">{{ row.title || __('Response') }}</h3>
					<p class="mb-3 text-sm text-ink-gray-7">
						{{ row.author }} · {{ discussionDate(row.created_at) }} ·
						{{ __(row.lms_moderation_state) }}
					</p>
					<RichTextEditor
						:content="row.reply || ''"
						:editable="false"
						variant="ghost"
					/>
					<FormControl
						v-model="reasons[row.name]"
						class="mt-3"
						:label="__('Decision reason (required when refusing)')"
					/>
					<div v-if="!readOnlyMode" class="mt-3 flex gap-2">
						<Button
							:disabled="Boolean(busy)"
							:loading="busy === `${row.name}:Approved`"
							@click="moderate(row, 'Approved')"
							>{{ __('Approve') }}</Button
						>
						<Button
							:disabled="Boolean(busy)"
							:loading="busy === `${row.name}:Rejected`"
							@click="moderate(row, 'Rejected')"
							>{{ __('Refuse') }}</Button
						>
					</div>
				</article>
				<div class="mt-4 flex gap-3">
					<Button
						:disabled="Boolean(busy) || !queueOffset"
						@click="moveQueue(-20)"
						>{{ __('Previous') }}</Button
					>
					<Button
						:disabled="Boolean(busy) || !queueHasMore"
						@click="moveQueue(20)"
						>{{ __('Next') }}</Button
					>
				</div>
			</section>
			<section
				v-if="tab === 'access' && access.data.is_admin"
				data-tour="community-grants"
			>
				<h2 class="mb-3 text-lg font-semibold">
					{{ __('Annual community access') }}
				</h2>
				<p class="mb-4 text-ink-gray-7">
					{{
						__(
							'Dates use the site timezone: {0}. Blank end uses the configured annual term.'
						).format(access.data.timezone)
					}}
				</p>
				<form
					v-if="!readOnlyMode"
					class="grid gap-4 md:grid-cols-2"
					@submit.prevent="grantAccess"
				>
					<FormControl
						v-model="grantForm.member"
						:description="textLengthInfo(grantForm.member, 140)"
						:label="__('Member login')"
						type="email"
						required
					>
						<template #description>{{
							textLengthInfo(grantForm.member, 140)
						}}</template>
					</FormControl>
					<FormControl v-model="grantForm.reason" :label="__('Grant reason')" />
					<FormControl
						v-model="grantForm.starts_on"
						:label="__('Access starts on')"
						type="datetime-local"
					/>
					<FormControl
						v-model="grantForm.ends_on"
						:label="__('Access ends on')"
						type="datetime-local"
					/>
					<Button
						type="submit"
						variant="solid"
						:loading="busy === 'grant'"
						:disabled="Boolean(busy)"
						>{{ __('Grant access') }}</Button
					>
				</form>
				<ul class="mt-6 list-none">
					<li v-for="grant in grants" :key="grant.name" class="border-b py-4">
						<p class="font-medium">
							{{ grant.member }} · {{ __(grant.state) }}
						</p>
						<p class="my-2 text-sm">
							{{ discussionDate(grant.starts_at) }} –
							{{ discussionDate(grant.ends_at) }}
						</p>
						<p class="text-sm">
							{{ grant.reason }} {{ grant.revocation_reason }}
						</p>
						<template v-if="!grant.revoked_on && !readOnlyMode">
							<FormControl
								v-model="reasons[grant.name]"
								:label="__('Revocation reason')"
								class="my-3"
							/>
							<Button :disabled="Boolean(busy)" @click="revokeTarget = grant">{{
								__('Revoke access')
							}}</Button>
						</template>
					</li>
				</ul>
				<div class="mt-4 flex gap-3">
					<Button
						:disabled="Boolean(busy) || !grantOffset"
						@click="moveGrants(-20)"
						>{{ __('Previous') }}</Button
					>
					<Button
						:disabled="Boolean(busy) || grants.length < 20"
						@click="moveGrants(20)"
						>{{ __('Next') }}</Button
					>
				</div>
			</section>
		</template>
		<ErrorMessage v-if="error" :message="error" class="mt-4" />
		<p v-if="message" role="status" class="mt-4 text-ink-gray-8">
			{{ message }}
		</p>
		<Dialog
			:open="Boolean(revokeTarget)"
			:title="__('Revoke access')"
			:message="
				__(
					'Revoke this grant? Other individual grants and history are preserved.'
				)
			"
			@update:open="
				(open) => {
					if (!open && !busy) revokeTarget = null
				}
			"
		>
			<template #actions>
				<Button :disabled="Boolean(busy)" @click="revokeTarget = null">{{
					__('Cancel')
				}}</Button>
				<Button :loading="busy === 'revoke'" @click="revokeAccess">{{
					__('Revoke access')
				}}</Button>
			</template>
		</Dialog>
	</main>
</template>

<script setup>
import { textLengthInfo } from '@/utils/textLength'
import {
	computed,
	inject,
	onMounted,
	onUnmounted,
	reactive,
	ref,
	watch,
} from 'vue'
import {
	Button,
	Dialog,
	ErrorMessage,
	FormControl,
	call,
	createResource,
} from 'frappe-ui'
import Discussions from '@/components/Discussions.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import LoadError from '@/components/LoadError.vue'
import { discussionDate } from '@/utils/discussion'
import { resourceErrorMessage } from '@/utils/resource'
import { useDirtyGuard } from '@/composables/useDirtyGuard'

const user = inject('$user')
const readOnlyMode = window.read_only_mode
const socket = inject('$socket')
const access = createResource({
	url: 'lms.lms.community.get_access',
	auto: true,
})
const tab = ref('posts')
const tabs = [
	{ value: 'posts', label: 'Community posts' },
	{ value: 'queue', label: 'Manual approval queue' },
	{ value: 'access', label: 'Annual community access' },
]
const states = computed(() =>
	['Pending', 'Approved', 'Rejected'].map((value) => ({
		value,
		label: __(value),
	}))
)
const discussionRef = ref(null)
const busy = ref('')
const error = ref('')
const message = ref('')
const queueState = ref('Pending')
const queueOffset = ref(0)
const queueRows = ref([])
const queueHasMore = ref(false)
const grants = ref([])
const grantOffset = ref(0)
const reasons = reactive({})
const revokeTarget = ref(null)
const grantForm = reactive({
	member: '',
	starts_on: '',
	ends_on: '',
	reason: '',
})
const requestKey = ref(crypto.randomUUID())
watch(grantForm, () => {
	requestKey.value = crypto.randomUUID()
})
useDirtyGuard(() =>
	Boolean(
		grantForm.member || grantForm.reason || Object.values(reasons).some(Boolean)
	)
)

const run = async (key, action) => {
	if (busy.value) return
	busy.value = key
	error.value = ''
	message.value = ''
	try {
		await action()
	} catch (err) {
		error.value = message.value
			? __('The change was saved. Refresh the list to update this view.')
			: resourceErrorMessage(err)
	} finally {
		busy.value = ''
	}
}
const loadQueue = () =>
	run('queue', async () => {
		const data = await call('lms.lms.moderation.queue', {
			state: queueState.value,
			start: queueOffset.value,
		})
		queueRows.value = data.rows
		queueHasMore.value = data.has_more
	})
const loadGrants = () =>
	run('grants', async () => {
		grants.value = await call('lms.lms.community.list_grants', {
			start: grantOffset.value,
		})
	})
const selectTab = (value) => {
	tab.value = value
	if (value === 'queue') loadQueue()
	if (value === 'access') loadGrants()
}
const changeQueueState = () => {
	queueOffset.value = 0
	loadQueue()
}
const moveQueue = (delta) => {
	queueOffset.value += delta
	loadQueue()
}
const moveGrants = (delta) => {
	grantOffset.value += delta
	loadGrants()
}
const moderate = (row, state) =>
	run(`${row.name}:${state}`, async () => {
		await call('lms.lms.moderation.decide', {
			doctype: row.doctype,
			name: row.name,
			state,
			reason: reasons[row.name] || '',
			expected_modified: row.modified,
		})
		delete reasons[row.name]
		message.value = __('Decision recorded.')
		const data = await call('lms.lms.moderation.queue', {
			state: queueState.value,
			start: queueOffset.value,
		})
		queueRows.value = data.rows
		queueHasMore.value = data.has_more
		message.value = __('Decision recorded.')
	})
const grantAccess = () =>
	run('grant', async () => {
		await call('lms.lms.community.grant_access', {
			...grantForm,
			request_key: requestKey.value,
			starts_on: grantForm.starts_on || null,
			ends_on: grantForm.ends_on || null,
		})
		Object.assign(grantForm, {
			member: '',
			starts_on: '',
			ends_on: '',
			reason: '',
		})
		requestKey.value = crypto.randomUUID()
		message.value = __('Access granted.')
		grants.value = await call('lms.lms.community.list_grants', {
			start: grantOffset.value,
		})
		message.value = __('Access granted.')
	})
const revokeAccess = () =>
	run('revoke', async () => {
		await call('lms.lms.community.revoke_access', {
			grant: revokeTarget.value.name,
			reason: reasons[revokeTarget.value.name] || '',
		})
		delete reasons[revokeTarget.value.name]
		revokeTarget.value = null
		message.value = __('Access revoked. History preserved.')
		grants.value = await call('lms.lms.community.list_grants', {
			start: grantOffset.value,
		})
		message.value = __('Access revoked. History preserved.')
	})
const refreshAccess = () => access.reload()
watch(
	() => user?.data?.user_image,
	() => discussionRef.value?.reload()
)
onMounted(() => {
	window.addEventListener('focus', refreshAccess)
	socket.on('lms_community_access_changed', refreshAccess)
})
onUnmounted(() => {
	window.removeEventListener('focus', refreshAccess)
	socket.off('lms_community_access_changed', refreshAccess)
})
</script>
