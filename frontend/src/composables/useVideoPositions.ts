import { computed, reactive, watch } from 'vue'
import { call } from 'frappe-ui'
import {
	safePendingVideoSource,
	videoSourceIdentity,
} from '@/utils/videoSource'

export type VideoPosition = { source: string; watch_time: number }
type Pending = {
	actor: string
	lesson: string
	positions: Map<string, number>
	saved: Map<string, number>
	saving: boolean
	blocked: boolean
	reading: boolean
	reviewed: boolean
	unsupported: boolean
}
const pending = reactive(new Map<string, Pending>())
let sessionGeneration = 0
export const clearVideoPositions = () => {
	pending.clear()
	sessionGeneration++
}

export function useVideoPositions(options: {
	actor: () => string | undefined
	lesson: () => string | undefined
	enabled: () => boolean
	bindings?: () => Record<string, string>
	request?: (
		method: string,
		params: Record<string, unknown>
	) => Promise<VideoPosition[]>
}) {
	const request = options.request ?? call
	let generation = sessionGeneration
	const key = () => JSON.stringify([options.actor(), options.lesson()])
	const current = computed(() => pending.get(key()))
	const actorMatches = (entry: Pending) => {
		const cookie = document.cookie
			.split('; ')
			.find((value) => value.startsWith('user_id='))
		const cookieActor = cookie ? decodeURIComponent(cookie.slice(8)) : undefined
		return (
			generation === sessionGeneration &&
			options.actor() === entry.actor &&
			options.enabled() &&
			(!cookieActor || cookieActor === entry.actor)
		)
	}
	const attached = (entry: Pending) =>
		pending.get(JSON.stringify([entry.actor, entry.lesson])) === entry
	const visible = (entry: Pending) =>
		attached(entry) && actorMatches(entry) && options.lesson() === entry.lesson
	watch(
		options.actor,
		(actor, old) => {
			if (actor !== old) {
				pending.clear()
				generation = sessionGeneration
			}
		},
		{ flush: 'sync' }
	)

	const acknowledge = (entry: Pending, rows: VideoPosition[]) => {
		if (!Array.isArray(rows)) throw Error('Invalid position response')
		for (const row of rows) {
			if (
				!safePendingVideoSource(row.source) ||
				!Number.isFinite(row.watch_time) ||
				row.watch_time < 0
			)
				throw Error('Invalid position response')
			entry.saved.set(
				row.source,
				Math.max(entry.saved.get(row.source) ?? 0, row.watch_time)
			)
		}
		for (const [source, seconds] of entry.positions)
			if ((entry.saved.get(source) ?? -1) >= seconds)
				entry.positions.delete(source)
	}
	const reviewEntry = async (entry: Pending) => {
		if (!visible(entry) || entry.reading || entry.saving) return
		entry.reading = true
		entry.reviewed = false
		try {
			const rows = await request('lms.lms.api.get_video_positions', {
				lesson: entry.lesson,
			})
			if (!visible(entry)) return
			acknowledge(entry, rows)
			entry.reviewed = true
		} catch {
			// Keep the highest pending point; a failed read never schedules a POST.
		} finally {
			if (attached(entry)) entry.reading = false
		}
	}
	const flush = async (entry: Pending) => {
		if (
			!visible(entry) ||
			entry.saving ||
			entry.blocked ||
			!entry.positions.size
		)
			return
		entry.saving = true
		const videos = [...entry.positions]
			.slice(0, 32)
			.map(([source, watch_time]) => ({ source, watch_time }))
		let failed = false
		try {
			const rows = await request('lms.lms.api.track_video_watch_duration', {
				lesson: entry.lesson,
				videos,
			})
			if (!attached(entry) || !actorMatches(entry)) return
			acknowledge(entry, rows)
			if (
				videos.some(
					(row) => (entry.saved.get(row.source) ?? -1) < row.watch_time
				)
			)
				throw Error('Video position was not confirmed')
		} catch {
			if (!attached(entry)) return
			failed = true
			entry.blocked = true
			entry.reviewed = false
		} finally {
			if (attached(entry)) entry.saving = false
		}
		if (failed) await reviewEntry(entry)
		else if (visible(entry) && entry.positions.size) await flush(entry)
	}
	const capture = (videos: VideoPosition[]) => {
		const actor = options.actor(),
			lesson = options.lesson()
		if (
			generation !== sessionGeneration ||
			!actor ||
			actor === 'Guest' ||
			!lesson ||
			!options.enabled()
		)
			return
		if (!current.value)
			pending.set(key(), {
				actor,
				lesson,
				positions: new Map(),
				saved: new Map(),
				saving: false,
				blocked: false,
				reading: false,
				reviewed: false,
				unsupported: false,
			})
		const entry = current.value!
		for (const video of videos) {
			const source = videoSourceIdentity(
				video.source,
				window.location.origin,
				options.bindings?.()
			)
			if (!safePendingVideoSource(source)) {
				entry.unsupported = true
				continue
			}
			if (!Number.isFinite(video.watch_time) || video.watch_time < 0) continue
			if ((entry.saved.get(source) ?? -1) < video.watch_time)
				entry.positions.set(
					source,
					Math.max(entry.positions.get(source) ?? 0, video.watch_time)
				)
		}
		void flush(entry)
	}
	const review = () =>
		current.value ? reviewEntry(current.value) : Promise.resolve()
	const retry = async () => {
		const entry = current.value
		if (!entry?.reviewed || entry.reading || entry.saving) return
		entry.blocked = false
		await flush(entry)
	}
	return {
		capture,
		review,
		retry,
		unsaved: computed(() =>
			Boolean(current.value?.blocked && current.value.positions.size)
		),
		unsupported: computed(() => Boolean(current.value?.unsupported)),
		reading: computed(() => Boolean(current.value?.reading)),
		saving: computed(() => Boolean(current.value?.saving)),
		canRetry: computed(() =>
			Boolean(
				current.value?.reviewed &&
					!current.value.saving &&
					!current.value.reading
			)
		),
	}
}
