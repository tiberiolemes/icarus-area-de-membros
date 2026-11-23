import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
const state = vi.hoisted(() => ({ submit: vi.fn() }))
vi.mock('frappe-ui', () => ({
	createResource: () => ({ submit: state.submit, abort: vi.fn() }),
}))
import { useReportResource } from '@/composables/useReportResource'
function deferred() {
	let resolve!: (value: unknown) => void, reject!: (error: unknown) => void
	const promise = new Promise((a, b) => {
		resolve = a
		reject = b
	})
	return { promise, resolve, reject }
}
describe('report response sequencing', () => {
	it('ignores a slow older reply after the period changed', async () => {
		const first = deferred(),
			second = deferred()
		state.submit
			.mockReset()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise)
		const scope = effectScope(),
			report = scope.run(() => useReportResource('report'))!
		const a = report.submit({ period: 'old' }),
			b = report.submit({ period: 'new' })
		second.resolve({ count: 7 })
		await b
		first.resolve({ count: 99 })
		await a
		expect(report.data).toEqual({ count: 7 })
		expect(report.loading).toBe(false)
		scope.stop()
	})
	it('keeps the last confirmed data and a retryable error after a failed refresh', async () => {
		state.submit
			.mockReset()
			.mockResolvedValueOnce({ count: 3 })
			.mockRejectedValueOnce({ status: 500 })
			.mockResolvedValueOnce({ count: 4 })
		const scope = effectScope(),
			report = scope.run(() => useReportResource('report'))!
		await report.submit({ period: 'month' })
		await report.reload()
		expect(report.data).toEqual({ count: 3 })
		expect(report.error).toEqual({ status: 500 })
		await report.reload()
		expect(report.data).toEqual({ count: 4 })
		expect(report.error).toBeNull()
		scope.stop()
	})
})
