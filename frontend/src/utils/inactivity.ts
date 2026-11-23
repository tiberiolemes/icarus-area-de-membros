import { advancingStudyVideo, clearStudyActivity } from '@/utils/studyActivity'

type Status = {
	user: string
	remaining: number
	idle_seconds: number
	warning_seconds: number
}
type Options = {
	actor: string
	request: (active: boolean) => Promise<Status>
	onState: (remaining: number, warning: boolean) => void
	onExpired: (reason: 'expired' | 'unverified') => void
	onError: () => void
	isHuman?: (event: Event) => boolean
}

// Only input and explicitly started, advancing study video renew human activity.
export function monitorInactivity(options: Options) {
	let stopped = false
	let inFlight: Promise<boolean> | null = null
	let deadline = 0
	let warningSeconds = 60
	let dirty = false
	let nextCheck = 0
	let nextActivity = 0
	let lastInput = -Infinity
	let expired = false
	const playing = new Map<HTMLMediaElement, number>()
	const human = options.isHuman || ((event: Event) => event.isTrusted)
	function input(event: Event) {
		if (!human(event) || expired) return
		lastInput = Date.now()
		dirty = true
	}
	function play(event: Event) {
		if (
			!(event.target instanceof HTMLMediaElement) ||
			Date.now() - lastInput > 10000
		)
			return
		playing.set(event.target, event.target.currentTime)
	}
	function pause(event: Event) {
		if (event.target instanceof HTMLMediaElement) playing.delete(event.target)
	}
	async function sync(active: boolean): Promise<boolean> {
		if (stopped) return false
		if (inFlight) return inFlight
		inFlight = (async () => {
			try {
				const result = await options.request(active)
				if (stopped) return false
				if (result.user !== options.actor || result.remaining <= 0) {
					expired = true
					options.onExpired('expired')
					return false
				}
				deadline = Date.now() + result.remaining * 1000
				warningSeconds = result.warning_seconds
				expired = false
				nextCheck = Date.now() + 30000
				if (active) nextActivity = Date.now() + 15000
				options.onState(
					Math.ceil(result.remaining),
					result.remaining <= warningSeconds,
				)
				return true
			} catch (error: any) {
				if (stopped) return false
				if (
					[401, 403].includes(error?.httpStatus ?? error?.status) ||
					['AuthenticationError', 'SessionExpired'].includes(error?.exc_type)
				) {
					expired = true
					options.onExpired('expired')
				} else {
					nextCheck = Date.now() + 15000
					nextActivity = Date.now() + 15000
					options.onError()
					if (deadline && Date.now() >= deadline) {
						expired = true
						options.onExpired('unverified')
					}
				}
				return false
			} finally {
				inFlight = null
			}
		})()
		return inFlight
	}
	function tick() {
		if (stopped || expired) return
		if (advancingStudyVideo()) dirty = true
		for (const [video, position] of playing) {
			if (!video.isConnected || video.paused || video.ended) {
				playing.delete(video)
				continue
			}
			if (
				(document.visibilityState === 'visible' ||
					document.pictureInPictureElement === video) &&
				video.currentTime > position
			)
				dirty = true
			playing.set(video, video.currentTime)
		}
		if (dirty && !inFlight && Date.now() >= nextActivity) {
			dirty = false
			void sync(true)
		} else if (!inFlight && Date.now() >= nextCheck) void sync(false)
		if (deadline) {
			const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
			options.onState(remaining, remaining <= warningSeconds)
			// The server decides whether this tab or another has kept the session alive.
			if (!remaining && !inFlight) void sync(false)
		}
	}
	const events = ['pointerdown', 'keydown', 'touchstart', 'wheel']
	for (const event of events)
		document.addEventListener(event, input, { capture: true, passive: true })
	document.addEventListener('play', play, true)
	document.addEventListener('pause', pause, true)
	document.addEventListener('ended', pause, true)
	const timer = setInterval(tick, 1000)
	void sync(false)
	return {
		async continue() {
			// Wait for a read in progress, then send the explicit continuation.
			if (inFlight) await inFlight
			return sync(true)
		},
		stop() {
			stopped = true
			clearInterval(timer)
			for (const event of events)
				document.removeEventListener(event, input, true)
			document.removeEventListener('play', play, true)
			document.removeEventListener('pause', pause, true)
			document.removeEventListener('ended', pause, true)
			playing.clear()
			clearStudyActivity()
		},
	}
}
