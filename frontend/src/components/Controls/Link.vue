<template>
	<div
		:data-field="attrs['data-field']"
		:class="attrs.class as any"
		:style="attrs.style as any"
	>
		<Combobox
			:open="isOpen"
			:modelValue="value"
			:options="resolvedOptions"
			:placeholder="attrs.placeholder as string"
			:disabled="attrs.readonly as boolean"
			:size="(attrs.size as ComboboxSize) || 'sm'"
			:aria-label="label ? undefined : (attrs['aria-label'] as string)"
			:autocomplete="attrs.autocomplete as string"
			:variant="attrs.variant as ComboboxVariant"
			:align="props.align"
			:loading="options.loading"
			:filterable="false"
			:label="label ? __(label) : undefined"
			:required="required"
			:description="description"
			:error="error"
			@update:modelValue="onSelect"
			@update:query="onQuery"
			@update:open="onOpen"
			class="w-full"
		>
			<template #footer>
				<div
					data-popover-footer-sticky
					@keydown.enter="checkCategory && $event.stopPropagation()"
					class="-m-1 border-t border-outline-gray-2 bg-surface-elevation-2 p-2 mt-1"
				>
					<div v-if="creating" class="flex flex-wrap items-center gap-1">
						<button
							class="p-1 rounded-4 hover:bg-surface-gray-3 text-ink-gray-5"
							:aria-label="__('Cancel')"
							type="button"
							@click="creating = false"
						>
							<span class="lucide-arrow-left size-4" />
						</button>
						<FormControl
							v-model="newItemName"
							:description="textLengthInfo(newItemName, 140)"
							class="flex-1 min-w-0"
							:disabled="categorySaving"
							size="sm"
							:placeholder="__(props.inlineCreatePlaceholder)"
							:aria-label="checkCategory ? __('Category name') : undefined"
							@keyup.enter="submitCreate"
						>
							<template #description>{{
								textLengthInfo(newItemName, 140)
							}}</template>
						</FormControl>
						<Button
							variant="solid"
							size="sm"
							:disabled="
								!newItemName.trim() ||
								(checkCategory && !availability.available.value) ||
								categorySaving
							"
							:loading="categorySaving"
							:aria-label="__('Create')"
							@click="submitCreate"
						>
							{{ __('Create') }}
						</Button>
						<p
							v-if="checkCategory && availability.message.value"
							role="status"
							class="w-full text-sm text-ink-gray-7"
						>
							{{ availability.message.value }}
						</p>
						<Button
							v-if="checkCategory && availability.state.value === 'error'"
							class="min-h-11"
							type="button"
							@click="availability.check()"
							>{{ __('Try again') }}</Button
						>
						<ErrorMessage v-if="categoryError" :message="categoryError" />
					</div>
					<div v-else class="flex flex-wrap justify-between gap-2">
						<Button
							variant="ghost"
							size="sm"
							:aria-label="__('Clear')"
							@click="clearValue"
						>
							{{ __('Clear') }}
						</Button>
						<Button
							v-if="props.onCreate"
							variant="ghost"
							size="sm"
							:aria-label="__('Create New')"
							@click="handleCreate"
						>
							<template #prefix>
								<span class="lucide-plus size-4" />
							</template>
							{{ __('Create New') }}
						</Button>
					</div>
				</div>
			</template>
		</Combobox>
	</div>
</template>

<script setup lang="ts">
import { textLengthInfo } from '@/utils/textLength'
import {
	Combobox,
	Button,
	FormControl,
	ErrorMessage,
	createResource,
	toast,
} from 'frappe-ui'
import { useCategoryAvailability } from '@/composables/useCategoryAvailability'
import { resourceErrorMessage } from '@/utils/resource'
import type { ComboboxOptionValue } from 'frappe-ui'
import { useDebounceFn, watchDebounced } from '@vueuse/core'
import { useAttrs, computed, ref, watch, onScopeDispose } from 'vue'
import { useSettings } from '@/stores/settings'
import type { Resource } from '@/types'
import { countryLabel } from '@/utils/countryNames'
import { nativeCategoryLabel } from '@/utils/locale'

type ComboboxSize = 'xs' | 'sm' | 'md' | 'lg'
type ComboboxVariant = 'subtle' | 'outline' | 'ghost'

interface LinkOption {
	label: string
	value: string
	description?: string
}

type CreateHandler = (
	value: string | null,
	close?: () => void
) => void | Promise<string | undefined>

const props = withDefaults(
	defineProps<{
		doctype: string
		filters?: Record<string, unknown>
		/** A whitelisted search_link `query`, for doctypes the user cannot read. */
		query?: string
		modelValue?: string
		label?: string
		description?: string
		error?: string
		required?: boolean
		inlineCreate?: boolean
		categoryAvailability?: boolean
		inlineCreatePlaceholder?: string
		onCreate?: CreateHandler
		// Where the popover hangs off the control. `end` is the trailing edge in
		// either direction, so a control near the end of a row opens inwards.
		align?: 'start' | 'center' | 'end'
	}>(),
	{ inlineCreatePlaceholder: 'Enter...', align: 'start' }
)

const emit = defineEmits<{
	(e: 'update:modelValue', value: string): void
	(e: 'change', value: string): void
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const valuePropPassed = computed<boolean>(() => 'value' in attrs)

const creating = ref<boolean>(false)
const newItemName = ref<string>('')
const isOpen = ref<boolean>(false)
const checkCategory = computed(
	() => props.categoryAvailability && props.doctype === 'LMS Category'
)
let alive = true
onScopeDispose(() => {
	alive = false
})
const categorySaving = ref(false)
const categoryError = ref('')
const availability = useCategoryAvailability(
	() => newItemName.value,
	() => Boolean(checkCategory.value && creating.value && isOpen.value)
)
watch(availability.identity, () => {
	categoryError.value = ''
	categorySaving.value = false
})
watch(isOpen, (open) => {
	if (!open) creating.value = false
})
let loaded = false

const value = computed<string>(() =>
	valuePropPassed.value ? (attrs.value as string) : props.modelValue
)

const searchTransform = (data: LinkOption[]): LinkOption[] =>
	data.map((o) => {
		const rawLabel = o.label || o.value
		const label = linkLabel(rawLabel)
		// Drop the description when it just repeats the label.
		const hasDescription = o.description && o.description !== rawLabel
		return hasDescription
			? { label, value: o.value, description: o.description }
			: { label, value: o.value }
	})

const linkLabel = (label: string) =>
	props.doctype === 'Country'
		? countryLabel(label)
		: props.doctype === 'LMS Category'
		? nativeCategoryLabel(label)
		: label

const options = createResource({
	url: 'frappe.desk.search.search_link',
	method: 'POST',
	auto: false,
	transform: searchTransform,
}) as Resource<LinkOption[] | null>

// A preselected value arrives as a raw docname. Resolve its title (the link's
// label) so the control shows e.g. the course title instead of "abce1234".
const currentLabel = ref<string>('')
let resolvedFor = ''

const titleResource = createResource({
	url: 'frappe.desk.search.search_link',
	method: 'POST',
	auto: false,
	transform: searchTransform,
	onSuccess(data: LinkOption[]) {
		const match = (data || []).find((o) => o.value === resolvedFor)
		if (match) currentLabel.value = match.label
	},
}) as Resource<LinkOption[] | null>

watch(
	value,
	(v) => {
		if (!v) {
			currentLabel.value = ''
			resolvedFor = ''
			return
		}
		// Skip if the value is already known (just picked, or already resolved).
		if (v === resolvedFor || options.data?.some((o) => o.value === v)) return
		resolvedFor = v
		titleResource.update({
			params: {
				txt: v,
				doctype: props.doctype,
				query: props.query,
				filters: JSON.stringify(props.filters),
			},
		})
		titleResource.reload()
	},
	{ immediate: true }
)

const resolvedOptions = computed<LinkOption[]>(() => {
	const list = options.data || []
	const current = value.value
	if (current && !list.some((o) => o.value === current)) {
		const label = currentLabel.value || current
		return [{ label: linkLabel(label), value: current }, ...list]
	}
	return list
})

function reload(txt: string = ''): void {
	loaded = true
	options.update({
		params: {
			txt,
			doctype: props.doctype,
			query: props.query,
			filters: JSON.stringify(props.filters),
		},
	})
	options.reload()
}

function onOpen(open: unknown): void {
	isOpen.value = open as boolean
	if (isOpen.value && !loaded) reload('')
}

const onQuery = useDebounceFn((txt: unknown) => reload(txt as string), 300)

// Settings drawer (UserDropdown) is where users add Categories, Course
// Evaluators, etc. Refresh options once it closes so newly-created
// linked records show up without a full reload.
const settingsStore = useSettings()
watchDebounced(
	() => settingsStore.isSettingsOpen,
	(isOpen, wasOpen) => {
		if (wasOpen && !isOpen && loaded) reload('')
	},
	{ debounce: 200 }
)

function onSelect(val: unknown): void {
	const selected = val as ComboboxOptionValue | null
	emit(
		valuePropPassed.value ? 'change' : 'update:modelValue',
		selected == null ? '' : String(selected)
	)
}

function clearValue(): void {
	emit(valuePropPassed.value ? 'change' : 'update:modelValue', '')
}

function handleCreate(): void {
	if (props.inlineCreate) {
		creating.value = true
		return
	}
	// Close the dropdown so it doesn't stack on top of the modal onCreate opens.
	isOpen.value = false
	props.onCreate?.(null)
}

async function submitCreate(): Promise<void> {
	const name = newItemName.value.trim()
	if (!name || !props.onCreate) return
	if (checkCategory.value) {
		if (!availability.available.value || categorySaving.value) return
		const key = availability.identity.value
		categorySaving.value = true
		categoryError.value = ''
		try {
			const created = await props.onCreate(name)
			if (!alive || key !== availability.identity.value) return
			if (!created) throw new Error('Category creation did not return a name')
			onSelect(created)
			creating.value = false
			newItemName.value = ''
			reload('')
			toast.success(__('Category created successfully'))
		} catch (error) {
			if (alive && key === availability.identity.value)
				categoryError.value = resourceErrorMessage(
					error,
					__('Unable to create category')
				)
		} finally {
			if (alive && key === availability.identity.value)
				categorySaving.value = false
		}
		return
	}
	props.onCreate(name, () => {
		creating.value = false
		newItemName.value = ''
		reload('')
	})
}

defineExpose({ reload })
</script>
