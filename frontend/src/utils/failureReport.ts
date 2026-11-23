import { loadErrorKind } from '@/utils/loadError'

// Deliberately no URL, route params, actor, document, messages or stack. A
// server exception can contain private content even in its name/message.
export function failureReport(
	error: unknown,
	online = navigator.onLine,
): string {
	const status = (error as { status?: unknown } | null)?.status
	return JSON.stringify(
		{
			application: 'LMS',
			kind: loadErrorKind(error, online),
			status:
				typeof status === 'number' &&
				Number.isInteger(status) &&
				status >= 400 &&
				status <= 599
					? status
					: null,
			occurred_at: new Date().toISOString(),
		},
		null,
		2,
	)
}
