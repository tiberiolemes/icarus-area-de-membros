type StudyPlayer = {
	currentTime: number
	paused?: boolean
	ended?: boolean
	elements: { container?: HTMLElement }
	on: (event: string, handler: () => void) => void
	off?: (event: string, handler: () => void) => void
}
const playing = new Map<StudyPlayer, number>()
let actorGeneration = 0

// Covers Plyr's iframe providers through its own validated player event API.
export function registerStudyPlayer(player: StudyPlayer) {
	const container = player.elements?.container
	if (!container) return
	let lastInput = -Infinity
	let approvedGeneration = -1
	let inputGeneration = -1
	const currentInput = (event: Event) => {
		if (event.isTrusted) {
			lastInput = Date.now()
			inputGeneration = actorGeneration
		}
	}
	const play = () => {
		if (Date.now() - lastInput < 10000 && inputGeneration === actorGeneration)
			approvedGeneration = actorGeneration
		if (approvedGeneration === actorGeneration)
			playing.set(player, player.currentTime)
	}
	const pause = () => playing.delete(player)
	const destroy = () => {
		pause()
		container.removeEventListener('pointerdown', currentInput, true)
		container.removeEventListener('keydown', currentInput, true)
		for (const [event, handler] of handlers) player.off?.(event, handler)
	}
	const handlers: [string, () => void][] = [
		['play', play],
		['pause', pause],
		['ended', pause],
		['destroyed', destroy],
	]
	container.addEventListener('pointerdown', currentInput, true)
	container.addEventListener('keydown', currentInput, true)
	for (const [event, handler] of handlers) player.on(event, handler)
}

export function advancingStudyVideo() {
	let active = false
	for (const [player, position] of playing) {
		if (
			!player.elements?.container?.isConnected ||
			player.paused ||
			player.ended
		) {
			playing.delete(player)
			continue
		}
		if (document.visibilityState === 'visible' && player.currentTime > position)
			active = true
		playing.set(player, player.currentTime)
	}
	return active
}
export function clearStudyActivity() {
	playing.clear()
	actorGeneration++
}
