import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import {
	clearVideoPositions,
	useVideoPositions,
	type VideoPosition,
} from '@/composables/useVideoPositions'

const SOURCE = '/private/files/aula.mp4'
vi.mock('frappe-ui', () => ({ call: vi.fn() }))
const deferred = () => {
	let resolve!: (value: VideoPosition[]) => void
	let reject!: (reason: unknown) => void
	const promise = new Promise<VideoPosition[]>((yes, no) => {
		resolve = yes
		reject = no
	})
	return { promise, resolve, reject }
}
const scopes: ReturnType<typeof effectScope>[] = []
const setup = (request: ReturnType<typeof vi.fn>) => {
	const actor = ref('student@example.test'),
		lesson = ref('lesson-one')
	const scope = effectScope()
	scopes.push(scope)
	const state = scope.run(() =>
		useVideoPositions({
			actor: () => actor.value,
			lesson: () => lesson.value,
			enabled: () => Boolean(actor.value),
			request,
		})
	)!
	return { state, actor, lesson }
}
const point = (watch_time: number) => [{ source: SOURCE, watch_time }]
beforeEach(() => clearVideoPositions())
afterEach(() => {
	scopes.splice(0).forEach((scope) => scope.stop())
	clearVideoPositions()
	document.cookie = 'user_id=;Max-Age=0'
})

describe('video position recovery', () => {
	it('serializes and coalesces own saves while preserving the maximum pending point', async () => {
		const first = deferred(),
			second = deferred()
		const request = vi
			.fn()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise)
		const { state } = setup(request)
		state.capture(point(3))
		state.capture(point(8))
		state.capture(point(7))
		expect(request).toHaveBeenCalledTimes(1)
		first.resolve(point(3))
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(2)
		expect(request.mock.calls[1][1].videos).toEqual(point(8))
		second.resolve(point(8))
		await flushPromises()
		state.capture(point(8))
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(2)
		expect(state.unsaved.value).toBe(false)
	})

	it('does not post again after conflict or failed reread until a valid read and explicit recovery', async () => {
		const request = vi
			.fn()
			.mockRejectedValueOnce({
				exc_type: 'VideoPositionConflictError',
				status: 409,
			})
			.mockRejectedValueOnce(Error('read failed'))
			.mockResolvedValueOnce(point(7))
			.mockResolvedValueOnce(point(12))
		const { state } = setup(request)
		state.capture(point(8))
		await flushPromises()
		state.capture(point(12))
		state.capture(point(10))
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(2)
		expect(request.mock.calls[1][0]).toBe('lms.lms.api.get_video_positions')
		expect(state.unsaved.value).toBe(true)
		await state.retry()
		expect(request).toHaveBeenCalledTimes(2)
		await state.review()
		expect(request).toHaveBeenCalledTimes(3)
		expect(state.canRetry.value).toBe(true)
		await state.retry()
		expect(request.mock.calls[3][1].videos).toEqual(point(12))
		expect(state.unsaved.value).toBe(false)
	})

	it('does not let a delayed response to another lesson mutate the current recovery state', async () => {
		const old = deferred()
		const request = vi
			.fn()
			.mockReturnValueOnce(old.promise)
			.mockResolvedValueOnce(point(4))
		const { state, lesson } = setup(request)
		state.capture(point(8))
		lesson.value = 'lesson-two'
		state.capture(point(4))
		await flushPromises()
		old.reject({ exc_type: 'VideoPositionConflictError' })
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(2)
		expect(state.unsaved.value).toBe(false)
		lesson.value = 'lesson-one'
		expect(state.unsaved.value).toBe(true)
		expect(state.canRetry.value).toBe(false)
	})

	it('discards the previous actor queue and rejects callbacks after logout', async () => {
		const old = deferred()
		const request = vi
			.fn()
			.mockReturnValueOnce(old.promise)
			.mockResolvedValueOnce(point(4))
		const { state, actor } = setup(request)
		state.capture(point(3))
		state.capture(point(8))
		actor.value = 'other@example.test'
		state.capture(point(4))
		old.resolve(point(3))
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(2)
		clearVideoPositions()
		state.capture(point(5))
		clearVideoPositions()
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(2)
		expect(state.unsaved.value).toBe(false)
	})

	it('never stores credentials or signed URLs as pending payloads', async () => {
		const request = vi.fn().mockResolvedValue([])
		const { state } = setup(request)
		state.capture([
			{
				source: 'https://video.example.test/a.mp4?token=secret',
				watch_time: 4,
			},
		])
		await flushPromises()
		expect(request).not.toHaveBeenCalled()
		expect(state.unsupported.value).toBe(true)
	})

	it('blocks an unconfirmed success rather than posting in a loop', async () => {
		const request = vi.fn().mockResolvedValue([])
		const { state } = setup(request)
		state.capture(point(8))
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(2)
		expect(state.unsaved.value).toBe(true)
		state.capture(point(9))
		await flushPromises()
		expect(request).toHaveBeenCalledTimes(2)
	})
})
