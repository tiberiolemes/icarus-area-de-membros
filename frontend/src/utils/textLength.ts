import { translate } from '@/translationMessages'

// Match Frappe's len(cstr(value)): Unicode code points, with no truncation of drafts.
export function textLengthInfo(value: unknown, maximum: number): string {
	const count = Array.from(String(value ?? '')).length
	return count > maximum
		? translate('{0} of {1} characters. Shorten this text before saving.', [count, maximum])
		: translate('{0} of {1} characters', [count, maximum])
}
