<template>
	<section class="space-y-5 border-t pt-6">
		<div class="text-base-semibold text-ink-gray-9">
			{{ __('Course overview') }}
		</div>
		<div class="space-y-1.5" data-field="description">
			<InputLabel
				:id="descriptionLabelId"
				:for-id="descriptionId"
				:label="__('Course Description')"
				:required="true"
			/>
			<div
				class="rounded-t-6 rounded-b-5 outline-none transition-[box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
			>
				<RichTextEditor
					:id="descriptionId"
					:ariaLabelledby="descriptionLabelId"
					:ariaRequired="true"
					:ariaInvalid="Boolean(errors.description)"
					:ariaDescribedby="errors.description ? descriptionErrorId : undefined"
					:content="doc.description"
					@change="
						(val) => {
							doc.description = val
							markDirty()
						}
					"
					:editable="true"
					:fixedMenu="true"
					minHeight="7rem"
				/>
			</div>
			<InputError
				v-if="errors.description"
				:id="descriptionErrorId"
				:lines="[errors.description]"
			/>
		</div>
		<MultiLink
			v-model="relatedCourses"
			doctype="LMS Course"
			:filters="{ name: ['!=', resource.doc?.name], published: 1 }"
			:label="__('Related Courses')"
			:placeholder="__('Select related courses')"
			:emptyText="__('No other published courses available')"
			variant="outline"
			@update:modelValue="markDirty()"
		/>
	</section>

	<section class="space-y-5 border-t pt-6">
		<div>
			<div class="text-base-semibold text-ink-gray-9">
				{{ __('Meta Tags') }}
			</div>
			<div class="mt-1 text-p-sm text-ink-gray-6">
				{{
					__(
						'These tags help search engines describe and rank your course in results.',
					)
				}}
			</div>
		</div>
		<FormControl
			v-model="meta.description"
			:label="__('Meta description')"
			type="textarea"
			:placeholder="__('A short summary of the course for search results.')"
			variant="outline"
			@input="markMetaDirty()"
		/>
		<FormControl
			v-model="meta.keywords"
			:label="__('Meta keywords')"
			type="textarea"
			:placeholder="__('Comma separated keywords for SEO')"
			variant="outline"
			@input="markMetaDirty()"
		/>
	</section>
</template>

<script setup lang="ts">
import { FormControl } from 'frappe-ui'
import { computed, inject, useId } from 'vue'
import MultiLink from '@/components/Controls/MultiLink.vue'
import type { CourseFormContext } from '@/types'
import RichTextEditor from '@/components/RichTextEditor.vue'
import type { useFormValidation } from '@/composables/useFormValidation'
import { InputLabel, InputError } from 'frappe-ui/experimental'

const { resource, relatedCourses, meta, markDirty } =
	inject<CourseFormContext>('courseForm')!
const markMetaDirty = inject<() => void>('markCourseMetaDirty', markDirty)
const doc = computed(() => resource.doc)
const { errors } = inject<Pick<ReturnType<typeof useFormValidation>, 'errors'>>(
	'courseValidation',
	{ errors: computed<Record<string, string>>(() => ({})) },
)
const descriptionErrorId = useId()
const descriptionId = useId()
const descriptionLabelId = useId()
</script>
