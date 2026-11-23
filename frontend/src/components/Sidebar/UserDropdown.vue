<template>
	<div class="p-2">
		<Dropdown :options="userDropdownOptions">
			<template #item-suffix="{ selected }">
				<span
					v-if="selected"
					class="lucide-check size-4 text-ink-gray-7"
					aria-hidden="true"
				/>
			</template>
			<template v-slot="{ open, close }">
				<button
					class="flex min-h-12 items-center rounded-5 py-1 duration-300 ease-in-out"
					:class="
						isCollapsed
							? 'px-0 w-auto'
							: open
							? 'bg-surface-base shadow-sm px-2 w-52'
							: 'hover:bg-surface-gray-3 px-2 w-52'
					"
				>
					<div
						class="flex min-w-0 flex-1 gap-2"
						:class="
							branding.data?.banner_image
								? 'flex-col items-start'
								: 'items-center'
						"
					>
						<img
							v-if="branding.data?.banner_image"
							:src="safeUrl(branding.data?.banner_image.file_url)"
							alt=""
							class="h-8 shrink-0 rounded-4 px-1 object-contain"
							:class="[
								isCollapsed ? 'w-8' : 'w-40',
								branding.data.banner_image.file_url ===
								'/assets/lms/images/assinatura-tiberio.svg'
									? 'dark:invert'
									: '',
							]"
							data-brand-logo
						/>
						<LMSLogo v-else class="w-8 h-8 rounded-4 flex-shrink-0" />
						<div
							class="flex min-w-0 flex-1 flex-col text-start duration-300 ease-in-out"
							:class="
								isCollapsed
									? 'opacity-0 ms-0 w-0 overflow-hidden'
									: 'opacity-100 w-auto'
							"
						>
							<div
								:class="
									branding.data?.banner_image
										? 'sr-only'
										: 'text-p-base-medium text-ink-gray-9'
								"
							>
								<span
									v-if="
										branding.data?.app_name &&
										!/^Frappe(?: Learning)?$/i.test(branding.data.app_name)
									"
								>
									{{ branding.data?.app_name }}
								</span>
								<span v-else>Tibério Lemes</span>
							</div>
							<div
								v-if="userResource.data"
								class="break-words text-p-sm text-ink-gray-7"
							>
								{{ userResource.data?.full_name }}
							</div>
						</div>
					</div>
					<div
						class="duration-300 ease-in-out"
						:class="
							isCollapsed
								? 'opacity-0 ms-0 w-0 overflow-hidden'
								: 'opacity-100 ms-2 w-auto'
						"
					>
						<span class="lucide-chevron-down h-4 w-4 text-ink-gray-7" />
					</div>
				</button>
			</template>
		</Dropdown>
	</div>
	<SettingsModal v-if="canOpenSettings()" />
</template>

<script setup>
import { sessionStore } from '@/stores/session'
import { call, createResource, Dropdown, toast } from 'frappe-ui'
import { useRouter } from 'vue-router'
import { setThemePreference, themePreference } from '@/utils/theme'
import { usersStore } from '@/stores/user'
import { useSettings } from '@/stores/settings'
import { h, computed, shallowRef, watch } from 'vue'
import { createDialog } from '@/utils/dialogs'
import LMSLogo from '@/components/Icons/LMSLogo.vue'
import SettingsModal from '@/components/Settings/Settings.vue'
import { canOpenSettings } from '@/components/Settings/settings'
import { pushSettingsHash } from '@/composables/useSettingsHash'
import { safeUrl } from '@/utils/safeUrl'

const router = useRouter()
const session = sessionStore()
const { logout, branding } = session
let { userResource } = usersStore()
const settingsStore = useSettings()
let { isLoggedIn } = sessionStore()
const $dialog = createDialog

const props = defineProps({
	isCollapsed: {
		type: Boolean,
		default: false,
	},
})

const apps = shallowRef()
const appIdentity = computed(() => {
	const user = userResource.data
	return user?.name &&
		user.name === session.user &&
		user.sitename &&
		user.user_type === 'System User'
		? JSON.stringify([user.sitename, user.name])
		: null
})
watch(
	appIdentity,
	(key, _previous, onCleanup) => {
		apps.value = undefined
		if (!key) return
		const resource = createResource({
			url: 'frappe.apps.get_apps',
			transform: (data) => [deskApp(), ...siblingApps(data)],
			onError: () => {},
		})
		apps.value = { key, resource }
		onCleanup(() => resource.abort())
		resource.fetch().catch(() => {})
	},
	{ immediate: true }
)

function deskApp() {
	return {
		name: 'frappe',
		logo: '/assets/lms/images/desk.png',
		title: __('Desk'),
		route: '/desk/learning',
	}
}

function siblingApps(data) {
	return data
		.filter((app) => app.name !== 'lms')
		.map((app) => ({
			name: app.name,
			logo: app.logo,
			title: __(app.title),
			route: app.route,
		}))
}

const appMenuItems = computed(() => {
	const current = apps.value
	if (!current || current.key !== appIdentity.value) return []
	if (current.resource.loading)
		return [{ label: __('Loading...'), disabled: true }]
	if (current.resource.error)
		return [
			{
				label: __('Could not load apps. Try again.'),
				onClick: () => {
					if (apps.value === current && appIdentity.value === current.key)
						return current.resource.reload().catch(() => {})
				},
			},
		]
	return (current.resource.data || []).map((app) => ({
		label: app.title,
		onClick: () => {
			if (apps.value === current && appIdentity.value === current.key)
				window.location.href = app.route
		},
		slots: {
			prefix: () =>
				// alt="" deliberately: the row's own label names the app, and a
				// second announcement of it would only repeat. Without it a screen
				// reader falls back to reading the logo's filename.
				h('img', {
					class: 'size-4 shrink-0 rounded-4',
					src: app.logo,
					alt: '',
				}),
		},
	}))
})

const userDropdownOptions = computed(() => {
	return [
		{
			group: '',
			options: [
				{
					icon: 'lucide-user',
					label: __('My Profile'),
					onClick: () => {
						router.push(`/user/${userResource.data?.username}`)
					},
					condition: () => {
						return isLoggedIn
					},
				},
				{
					icon: 'lucide-sun-moon',
					label: __('Theme'),
					submenu: [
						{
							icon: 'lucide-sun',
							label: __('Light'),
							selected: themePreference.value === 'light',
							onClick: () => setThemePreference('light'),
						},
						{
							icon: 'lucide-moon',
							label: __('Dark'),
							selected: themePreference.value === 'dark',
							onClick: () => setThemePreference('dark'),
						},
						{
							icon: 'lucide-monitor',
							label: __('System'),
							selected: themePreference.value === 'system',
							onClick: () => setThemePreference('system'),
						},
					],
				},
				{
					icon: 'lucide-layout-grid',
					label: __('Apps'),
					submenu: appMenuItems.value,
					condition: () => {
						return !!appIdentity.value
					},
				},
				{
					icon: 'lucide-settings',
					label: __('Settings'),
					onClick: () => {
						pushSettingsHash(router)
					},
					condition: canOpenSettings,
				},
				{
					icon: 'lucide-wrench',
					label: __('Configuration'),
					submenu: [
						{
							icon: 'lucide-arrow-down-to-line',
							label: __('Import'),
							onClick: () => {
								router.push({
									name: 'DataImportList',
									query: { step: 'list' },
								})
							},
						},
					],
					condition: () => {
						return userResource.data?.is_moderator
					},
				},
				{
					label: __('Clear Demo Data'),
					icon: 'lucide-trash-2',
					onClick: () => {
						clearDemoDataConfirmation()
					},
					condition: () => {
						return (
							userResource.data?.is_moderator &&
							settingsStore.settings.data?.demo_data_present
						)
					},
				},
				{
					icon: 'lucide-log-out',
					label: __('Log out'),
					onClick: () => {
						logout.submit().then(() => {
							isLoggedIn = false
						})
					},
					condition: () => {
						return isLoggedIn
					},
				},
				{
					icon: 'lucide-log-in',
					label: __('Log in'),
					onClick: () => {
						window.location.href = '/login'
					},
					condition: () => {
						return !isLoggedIn
					},
				},
			],
		},
	]
})

const clearDemoDataConfirmation = () => {
	$dialog({
		title: __('Confirm clearing demo data?'),
		message: __(
			'Are you sure you want to clear the demo data? This would delete the course "A guide  to Frappe Learning" along with all its associated data. This action cannot be undone.'
		),
		actions: [
			{
				label: __('Confirm'),
				theme: 'red',
				variant: 'solid',
				onClick({ close }) {
					return clearDemoData(close)
				},
			},
		],
	})
}

const clearDemoData = (close) =>
	call('lms.lms.api.clear_demo_data')
		.then(() => {
			window.location.href = '/lms'
			toast.success(__('Demo data cleared successfully'))
		})
		.catch((error) => {
			close()
			toast.error(__(error.message || 'Error clearing demo data'))
			console.error('Error clearing demo data:', error)
		})
</script>

<style>
/*
 * frappe-ui's Dropdown content has no height bound, so a tall moderator menu
 * overflows the viewport and the boundary row (e.g. "Toggle Theme") is clipped.
 * reka exposes the room it has via --reka-popper-available-height; cap the menu
 * to it and scroll the overflow. Portaled to body, so this rule is global.
 */
.dropdown-content {
	max-height: var(--reka-popper-available-height);
	overflow-y: auto;
}
</style>
