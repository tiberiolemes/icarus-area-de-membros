import { requiredFields } from '@/composables/useFormValidation'
import type { LMSBatch } from '@/types/lms/LMSBatch'

// Client-side mirror of LMS Batch's mandatory fields (lms_batch.json `reqd`).
// `batch_details` is a Text Editor field, so an "empty" editor still serializes
// to markup like "<p></p>", so strip tags before treating it as filled. An
// image-only value has no text but is not empty.
type BatchFields = Pick<
	LMSBatch,
	| 'title'
	| 'start_date'
	| 'end_date'
	| 'start_time'
	| 'end_time'
	| 'timezone'
	| 'description'
	| 'batch_details'
	| 'paid_batch'
	| 'amount'
	| 'currency'
>

// Nullable so the create form's unset dates and times pass as-is.
interface BatchValidationInput {
	doc: { [K in keyof BatchFields]: BatchFields[K] | null } | null
	instructors: readonly string[]
}

export function batchErrors(
	input: BatchValidationInput,
): Record<string, string> {
	const { doc, instructors } = input
	if (!doc) return {}
	const errors = requiredFields(
		{ ...doc, instructors },
		{
			title: __('Title'),
			start_date: __('Batch Start Date'),
			end_date: __('Batch End Date'),
			start_time: __('Session Start Time'),
			end_time: __('Session End Time'),
			timezone: __('Timezone'),
			description: __('Short Description'),
			batch_details: __('Batch Details'),
			instructors: __('Instructor'),
		},
	)
	if (!instructors.length)
		errors.instructors = __('Add at least one {0} before saving.').format(
			__('Instructor'),
		)
	if (doc.paid_batch) {
		if (!doc.currency)
			errors.currency = __('Currency is required for {0}.').format(
				__('paid batches'),
			)
		if (!(Number(doc.amount) > 0))
			errors.amount = __('Amount must be a positive number for {0}.').format(
				__('paid batches'),
			)
	}
	return errors
}

export function validateBatch(input: BatchValidationInput): string | null {
	return Object.values(batchErrors(input))[0] ?? null
}
