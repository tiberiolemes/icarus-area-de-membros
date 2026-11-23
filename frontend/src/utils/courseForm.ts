import { requiredFields } from '@/composables/useFormValidation'
import type { LMSCourse } from '@/types/lms/LMSCourse'

// Client-side mirror of LMS Course's mandatory fields (lms_course.json `reqd`).
// `description` is a Text Editor field, so an "empty" editor still serializes to
// markup like "<p></p>", so strip tags; an image-only one still counts.
interface CourseValidationInput {
	doc: Pick<
		LMSCourse,
		| 'title'
		| 'description'
		| 'short_introduction'
		| 'paid_course'
		| 'paid_certificate'
		| 'currency'
		| 'course_price'
	> | null
	instructors: readonly string[]
}

export function courseErrors(
	input: CourseValidationInput,
): Record<string, string> {
	const { doc, instructors } = input
	if (!doc) return {}
	const errors = requiredFields(
		{ ...doc, instructors },
		{
			title: __('Title'),
			short_introduction: __('Short Introduction'),
			description: __('Description'),
			instructors: __('Instructor'),
		},
	)
	if (!instructors.length)
		errors.instructors = __('Add at least one {0} before saving.').format(
			__('Instructor'),
		)
	if (doc.paid_course || doc.paid_certificate) {
		const subject = doc.paid_course
			? __('paid courses')
			: __('paid certificates')
		if (!doc.currency)
			errors.currency = __('Currency is required for {0}.').format(subject)
		if (!(Number(doc.course_price) > 0))
			errors.course_price = __(
				'Price must be a positive number for {0}.',
			).format(subject)
	}
	return errors
}

export function validateCourse(input: CourseValidationInput): string | null {
	return Object.values(courseErrors(input))[0] ?? null
}
