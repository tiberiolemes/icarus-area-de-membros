import { describe, expect, it } from 'vitest'
import { failureReport } from '@/utils/failureReport'

describe('a report the learner may copy', () => {
	it('includes only a status, category and time, never the private request context', () => {
		const report = JSON.parse(
			failureReport(
				{
					status: 500,
					messages: ['private learner@email.test'],
					stack: 'private SQL',
					url: '/private?token=secret',
					exc_type: 'private document',
				},
				true,
			),
		)
		expect(report).toEqual({
			application: 'LMS',
			kind: 'server',
			status: 500,
			occurred_at: expect.any(String),
		})
		expect(JSON.stringify(report)).not.toMatch(/private|secret|email|token|SQL/)
	})
	it('rejects malformed status and distinguishes an expired session from a defect', () => {
		expect(
			JSON.parse(failureReport({ status: '500 password' }, true)).status,
		).toBeNull()
		expect(JSON.parse(failureReport({ status: 401 }, true)).kind).toBe('denied')
	})
})
