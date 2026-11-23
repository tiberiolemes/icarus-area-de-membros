import { describe, expect, it, vi } from 'vitest'
import { createResource, getCachedResource, setConfig } from 'frappe-ui'
import { reloadExistingCourseOutlines } from '@/utils/outlineCache'

let serial = 0
describe('existing native outline snapshots', () => {
	it('does not instantiate or fetch absent variants', async () => {
		const fetcher = vi.fn()
		setConfig('resourceFetcher', fetcher)
		const course = `quality-empty-${++serial}`
		await reloadExistingCourseOutlines(course)
		expect(fetcher).not.toHaveBeenCalled()
		expect(getCachedResource(['course_outline', course])).toBeNull()
		expect(
			getCachedResource(['course_outline_student', course, 'progress'])
		).toBeNull()
	})
	it('refreshes each present native read once without any new mutation', async () => {
		const course = `quality-cache-${++serial}`
		const fetcher = vi.fn().mockResolvedValue([])
		setConfig('resourceFetcher', fetcher)
		const current = createResource({
			url: 'outline-read',
			cache: ['course_outline', course],
			params: { course, progress: false },
		})
		createResource({
			url: 'outline-read',
			cache: ['course_outline_student', course, 'progress'],
			params: { course, progress: true },
		})
		await reloadExistingCourseOutlines(course, current)
		expect(fetcher).toHaveBeenCalledTimes(2)
		expect(fetcher.mock.calls.map(([request]) => request.params)).toEqual([
			{ course, progress: false },
			{ course, progress: true },
		])
		expect(
			getCachedResource(['course_outline_student', course, 'no-progress'])
		).toBeNull()
	})
	it('absorbs read failures without rejecting a confirmed write or repeating it', async () => {
		const course = `quality-cache-error-${++serial}`
		setConfig(
			'resourceFetcher',
			vi.fn().mockRejectedValue(new Error('read failed'))
		)
		const read = createResource({
			url: 'outline-read',
			cache: ['course_outline', course],
		})
		await expect(reloadExistingCourseOutlines(course)).resolves.toHaveLength(1)
		expect(read.error).toBeTruthy()
	})
})
