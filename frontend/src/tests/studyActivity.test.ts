import { afterEach, expect, it, vi } from 'vitest'
import {
	advancingStudyVideo,
	clearStudyActivity,
	registerStudyPlayer,
} from '@/utils/studyActivity'

afterEach(() => {
	clearStudyActivity()
	document.body.innerHTML = ''
	vi.restoreAllMocks()
})
it('keeps an explicitly started iframe lesson active only while advancing, pauses, and revokes activity with the actor', () => {
	Object.defineProperty(document, 'visibilityState', {
		configurable: true,
		value: 'visible',
	})
	const container = document.createElement('div')
	document.body.append(container)
	const events = new Map<string, () => void>()
	const player = {
		currentTime: 0,
		paused: false,
		elements: { container },
		on: (event, handler) => events.set(event, handler),
		off: vi.fn(),
	}
	const listeners = vi.spyOn(container, 'addEventListener')
	registerStudyPlayer(player)
	events.get('play')!()
	player.currentTime = 1
	expect(advancingStudyVideo()).toBe(false)
	const input = listeners.mock.calls.find(
		([event]) => event === 'pointerdown',
	)![1] as (event: any) => void
	input({ isTrusted: true })
	events.get('play')!()
	player.currentTime = 2
	expect(advancingStudyVideo()).toBe(true)
	expect(advancingStudyVideo()).toBe(false)
	events.get('pause')!()
	player.currentTime = 3
	expect(advancingStudyVideo()).toBe(false)
	events.get('play')!()
	player.currentTime = 4
	expect(advancingStudyVideo()).toBe(true)
	clearStudyActivity()
	// An actor change requires fresh, intentional interaction with the player.
	events.get('play')!()
	player.currentTime = 5
	expect(advancingStudyVideo()).toBe(false)
	events.get('destroyed')!()
	expect(player.off).toHaveBeenCalledTimes(4)
})
