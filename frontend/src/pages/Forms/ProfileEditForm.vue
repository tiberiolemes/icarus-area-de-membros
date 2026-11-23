<template>
	<FormShell
		:title="__('Edit Profile')"
		:loading="!refusal && !profileData"
		:message="refusal"
		@close="close"
	>
		<template #header-action>
			<Badge v-if="isDirty" theme="amber">
				{{ __('Not Saved') }}
			</Badge>
		</template>
		<template #default>
			<FormDraftNotice :draft="draft" />
			<FormFeedback ref="feedback" :errors="errors" @field-blur="touch">
				<div
					data-testid="profile-fields"
					:inert="updateProfile.loading"
					class="grid grid-cols-1 gap-6 text-base md:grid-cols-2 md:gap-10"
				>
					<div class="space-y-4">
						<Uploader
							v-model="profile.image"
							:label="__('Profile Image')"
							:required="false"
							shape="circle"
						/>
						<FormControl
							v-model="profile.first_name"
							:description="textLengthInfo(profile.first_name, 140)"
							data-field="first_name"
							:error="errors.first_name"
							:label="__('First Name')"
							:required="true"
						>
							<template #description>{{
								textLengthInfo(profile.first_name, 140)
							}}</template>
						</FormControl>
						<FormControl
							v-model="profile.last_name"
							:label="__('Last Name')"
							:description="
								[__('Optional'), textLengthInfo(profile.last_name, 140)].join(
									' · '
								)
							"
						>
							<template #description>{{
								[__('Optional'), textLengthInfo(profile.last_name, 140)].join(
									' · '
								)
							}}</template>
						</FormControl>
						<FormControl
							v-model="profile.headline"
							:label="__('Headline')"
							:description="
								[__('Optional'), textLengthInfo(profile.headline, 140)].join(
									' · '
								)
							"
						>
							<template #description>{{
								[__('Optional'), textLengthInfo(profile.headline, 140)].join(
									' · '
								)
							}}</template>
						</FormControl>
						<FormControl
							v-model="profile.linkedin"
							:label="__('LinkedIn ID')"
							:description="
								[__('Optional'), textLengthInfo(profile.linkedin, 140)].join(
									' · '
								)
							"
						>
							<template #description>{{
								[__('Optional'), textLengthInfo(profile.linkedin, 140)].join(
									' · '
								)
							}}</template>
						</FormControl>
						<FormControl
							v-model="profile.github"
							:label="__('GitHub ID')"
							:description="
								[__('Optional'), textLengthInfo(profile.github, 140)].join(
									' · '
								)
							"
						>
							<template #description>{{
								[__('Optional'), textLengthInfo(profile.github, 140)].join(
									' · '
								)
							}}</template>
						</FormControl>
						<FormControl
							v-model="profile.twitter"
							:label="__('Twitter ID')"
							:description="
								[__('Optional'), textLengthInfo(profile.twitter, 140)].join(
									' · '
								)
							"
						>
							<template #description>{{
								[__('Optional'), textLengthInfo(profile.twitter, 140)].join(
									' · '
								)
							}}</template>
						</FormControl>
					</div>
					<div class="space-y-4">
						<FormControl
							v-model="profile.open_to"
							type="select"
							:options="[
								{ label: '', value: '' },
								{ label: __('Open to Work'), value: 'Work' },
								{ label: __('Hiring'), value: 'Hiring' },
							]"
							:label="__('Open to')"
							:description="__('Optional')"
							:placeholder="__('Looking for new work or hiring talent?')"
						/>
						<Link
							:label="__('Language')"
							:description="__('Optional')"
							v-model="profile.language"
							doctype="Language"
						/>
						<div>
							<InputLabel :id="bioLabelId" :label="__('Bio')" class="mb-1.5" />
							<p :id="bioHelpId" class="mb-1.5 text-p-sm text-ink-gray-6">
								{{ __('Optional') }}
							</p>
							<RichTextEditor
								:ariaLabelledby="bioLabelId"
								:ariaDescribedby="bioHelpId"
								:fixedMenu="true"
								@change="(val) => (profile.bio = val)"
								:content="profile.bio"
								minHeight="280px"
							/>
						</div>
					</div>
				</div>
			</FormFeedback>
		</template>
		<template #actions>
			<HeaderButton
				data-testid="profile-save"
				:label="__('Save')"
				variant="solid"
				:loading="updateProfile.loading"
				@click="saveProfile()"
			/>
		</template>
	</FormShell>
</template>
<script setup>
import { textLengthInfo } from '@/utils/textLength'
import { Badge, createResource, FormControl, toast } from 'frappe-ui'
import { computed, inject, reactive, ref, useId, watch } from 'vue'
import { InputLabel } from 'frappe-ui/experimental'
import { useRouter } from 'vue-router'
import { sanitizeOnWrite } from '@/utils/sanitizeOnWrite'
import FormShell from '@/components/FormShell.vue'
import HeaderButton from '@/components/HeaderButton.vue'
import Link from '@/components/Controls/Link.vue'
import Uploader from '@/components/Controls/Uploader.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import { useFormRoute } from '@/composables/useFormRoute'
import FormFeedback from '@/components/FormFeedback.vue'
import FormDraftNotice from '@/components/FormDraftNotice.vue'
import {
	useFormValidation,
	requiredFields,
} from '@/composables/useFormValidation'
import { useFormDraft } from '@/composables/useFormDraft'
import { useDirtyGuard } from '@/composables/useDirtyGuard'
import { submitResource, resourceErrorMessage } from '@/utils/resource'

const props = defineProps({
	username: {
		type: String,
		required: true,
	},
	// Handed down by Profile.vue's router-view, which is the only thing that can
	// mount this route — the profile fetch is the parent's, not ours. Optional so
	// a missing binding degrades to the "Loading..." branch instead of throwing;
	// saving is blocked there too, or an empty form would post over a real user.
	profile: {
		type: Object,
		default: null,
	},
})

const user = inject('$user')
const router = useRouter()
const bioLabelId = useId()
const bioHelpId = useId()
const readOnlyMode = window.read_only_mode
const isDirty = ref(false)

const parent = {
	name: 'ProfileAbout',
	params: { username: props.username },
}
const { close, saveAndReplace } = useFormRoute(parent)

// Lifted off Profile.vue's `isSessionUser() && !readOnlyMode` gate on the Edit
// Profile button. A URL does not go through a button. Compared on `username`
// rather than the fetched profile's docname so it holds before that fetch lands.
//
// UX gate, not an authorization boundary — Frappe's own DocPerms on User are.
const refusal = computed(() => {
	if (readOnlyMode) return __('This site is in read-only mode.')
	if (user.data?.username !== props.username)
		return __('You can only edit your own profile.')
	return ''
})

const profileData = computed(() => props.profile?.data ?? null)

const profile = reactive({
	first_name: '',
	last_name: '',
	headline: '',
	language: '',
	bio: '',
	image: '',
	open_to: '',
	linkedin: '',
	github: '',
	twitter: '',
})

// Every key above is a User fieldname except `image`, which edits `user_image`.
const serverField = (key) => (key === 'image' ? 'user_image' : key)

const hasLanguageChanged = computed(
	() => profile.language !== (profileData.value?.language ?? '')
)

const updateProfile = createResource({
	url: 'frappe.client.set_value',
	makeParams() {
		return {
			doctype: 'User',
			name: user.data?.name,
			fieldname: {
				user_image: profile.image || null,
				...profile,
			},
		}
	},
})

const feedback = ref(null)
const { errors, touch, validate } = useFormValidation(() =>
	requiredFields(profile, { first_name: __('First Name') })
)
let savedSnapshot = ''

const saveProfile = () => {
	if (refusal.value || !profileData.value || updateProfile.loading) return
	if (!validate()) {
		feedback.value?.focusFirst()
		return
	}

	// Read before submitting: the computed is live against the parent resource,
	// which onSuccess reloads out from under it.
	const languageChanged = hasLanguageChanged.value

	profile.bio = sanitizeOnWrite(profile.bio)
	submitResource(
		updateProfile,
		{},
		{
			onSuccess() {
				savedSnapshot = JSON.stringify(profile)
				isDirty.value = false
				draft.markSaved()
				// The modal also wrote set_value's raw User doc straight into the
				// parent resource. Dropped: that resource holds get_profile_details'
				// payload, and the page behind this one is now visible, so it would
				// render a half-shaped profile for the tick before the reload lands.
				props.profile?.reload()
				user.reload?.()
				toast.success(__('Profile updated successfully'))
				if (languageChanged) {
					// A language change only takes effect after the whole SPA reloads,
					// which is what the modal did. Going through location rather than
					// the router so the reload lands on the profile, not back here.
					window.location.href = router.resolve(parent).href
					return
				}
				saveAndReplace(parent)
			},
			onError(err) {
				toast.error(resourceErrorMessage(err))
			},
		}
	)
}

watch(
	profile,
	() => {
		const data = profileData.value
		if (!data) return
		isDirty.value = JSON.stringify(profile) !== savedSnapshot
	},
	{ deep: true }
)

// `immediate`, unlike the modal's copy of this watcher: a modal was created
// before its parent had fetched anything, so the change alone was enough. This
// route only mounts once that fetch has landed, so without it the form is blank.
watch(
	profileData,
	(data) => {
		if (!data || isDirty.value) return
		for (const key of Object.keys(profile)) {
			profile[key] = data[serverField(key)] ?? ''
		}
		savedSnapshot = JSON.stringify(profile)
		isDirty.value = false
	},
	{ immediate: true }
)
const draftKeys = [
	'first_name',
	'last_name',
	'headline',
	'bio',
	'language',
	'open_to',
]
const draft = useFormDraft({
	user: () => user.data?.name,
	form: () => `profile:${props.username}`,
	read: () => Object.fromEntries(draftKeys.map((key) => [key, profile[key]])),
	apply: (data) => Object.assign(profile, data),
	ready: () => Boolean(profileData.value),
	canEdit: () => !refusal.value,
})
useDirtyGuard(
	() => isDirty.value,
	() => {
		draft.clear()
		isDirty.value = false
	}
)
</script>
