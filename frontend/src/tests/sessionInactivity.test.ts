import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { monitorInactivity } from '@/utils/inactivity'

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(new Date('2026-11-21T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())
const status = (remaining = 7200, user = 'student') => ({
	user,
	remaining,
	idle_seconds: 7200,
	warning_seconds: 60,
})
function fixture(initialRemaining = 7200) {
	const request = vi.fn().mockResolvedValue(status(initialRemaining))
	const onState = vi.fn(),
		onExpired = vi.fn(),
		onError = vi.fn()
	const monitor = monitorInactivity({
		actor: 'student',
		request,
		onState,
		onExpired,
		onError,
	})
	return { request, onState, onExpired, onError, monitor }
}

describe('human inactivity', () => {
	it('drops an in-flight response when the actor monitor is disposed', async () => {
		let resolve
		const request = vi.fn(
			() =>
				new Promise<any>((done) => {
					resolve = done
				}),
		)
		const onState = vi.fn(),
			onExpired = vi.fn()
		const monitor = monitorInactivity({
			actor: 'student',
			request,
			onState,
			onExpired,
			onError: vi.fn(),
		})
		monitor.stop()
		resolve(status(1, 'another-user'))
		await vi.advanceTimersByTimeAsync(1)
		expect(onState).not.toHaveBeenCalled()
		expect(onExpired).not.toHaveBeenCalled()
		expect(vi.getTimerCount()).toBe(0)
	})
	it('polls without marking activity; synthetic events and realtime do not renew activity', async () => {
		const f = fixture()
		await vi.advanceTimersByTimeAsync(1)
		document.dispatchEvent(new Event('pointerdown'))
		document.dispatchEvent(new Event('mousemove'))
		document.dispatchEvent(new Event('message'))
		await vi.advanceTimersByTimeAsync(60000)
		expect(f.request.mock.calls.every(([active]) => active === false)).toBe(
			true,
		)
		f.monitor.stop()
	})
	it('warns at sixty seconds; explicit continuation uses the server and handles revocation', async () => {
		const f = fixture(61)
		await vi.advanceTimersByTimeAsync(1)
		await vi.advanceTimersByTimeAsync(1000)
		expect(f.onState).toHaveBeenLastCalledWith(60, true)
		f.request.mockResolvedValue(status(7200))
		expect(await f.monitor.continue()).toBe(true)
		expect(f.request).toHaveBeenLastCalledWith(true)
		expect(f.onState).toHaveBeenLastCalledWith(7200, false)
		f.request.mockRejectedValue({ httpStatus: 401 })
		await vi.advanceTimersByTimeAsync(31000)
		expect(f.onExpired).toHaveBeenCalledWith('expired')
		f.monitor.stop()
	})
	it('does not revive expired identity and cancels listeners/timers/in-flight actor updates', async () => {
		const f = fixture()
		await vi.advanceTimersByTimeAsync(1)
		f.request.mockResolvedValue(status(0))
		await vi.advanceTimersByTimeAsync(30000)
		expect(f.onExpired).toHaveBeenCalledWith('expired')
		f.monitor.stop()
		const calls = f.request.mock.calls.length
		document.dispatchEvent(new Event('keydown'))
		await vi.advanceTimersByTimeAsync(90000)
		expect(f.request).toHaveBeenCalledTimes(calls)
		expect(vi.getTimerCount()).toBe(0)
	})
	it('reports loss of verification honestly and can recover after reconnecting', async () => {
		const f = fixture(1)
		await vi.advanceTimersByTimeAsync(1)
		f.request.mockRejectedValue(new Error('offline'))
		await vi.advanceTimersByTimeAsync(2000)
		expect(f.onExpired).toHaveBeenCalledWith('unverified')
		f.request.mockResolvedValue(status())
		expect(await f.monitor.continue()).toBe(true)
		f.monitor.stop()
	})
	it('uses server activity from another tab and rejects a different actor', async () => {
		const f = fixture(2)
		await vi.advanceTimersByTimeAsync(1)
		f.request.mockResolvedValue(status(7000))
		await vi.advanceTimersByTimeAsync(2000)
		expect(f.onExpired).not.toHaveBeenCalled()
		f.request.mockResolvedValue(status(7000, 'another-user'))
		await f.monitor.continue()
		expect(f.onExpired).toHaveBeenCalledWith('expired')
		f.monitor.stop()
	})
	it('counts only a user-started advancing video, then stops on pause and on hidden autoplay', async () => {
		const request = vi.fn().mockResolvedValue(status())
		const video = document.createElement('video')
		document.body.append(video)
		Object.defineProperty(video, 'paused', { configurable: true, value: false })
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			value: 'visible',
		})
		const monitor = monitorInactivity({
			actor: 'student',
			request,
			onState: vi.fn(),
			onExpired: vi.fn(),
			onError: vi.fn(),
			isHuman: () => true,
		})
		await vi.advanceTimersByTimeAsync(1)
		video.dispatchEvent(new Event('play'))
		video.currentTime = 2
		await vi.advanceTimersByTimeAsync(1000)
		expect(request.mock.calls.filter(([active]) => active)).toHaveLength(0)
		document.dispatchEvent(new Event('pointerdown'))
		video.dispatchEvent(new Event('play'))
		video.currentTime = 3
		await vi.advanceTimersByTimeAsync(1000)
		expect(request).toHaveBeenLastCalledWith(true)
		video.dispatchEvent(new Event('pause'))
		const active = request.mock.calls.filter(([value]) => value).length
		video.currentTime = 5
		await vi.advanceTimersByTimeAsync(1000)
		expect(request.mock.calls.filter(([value]) => value)).toHaveLength(active)
		monitor.stop()
		video.remove()
	})
})
