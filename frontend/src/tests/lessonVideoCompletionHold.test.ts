/**
 * Mounts the real Lesson.vue (harness from lessonLocking.test.ts) to check the
 * hold it places on markLessonProgress, which quizzes and assignments call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'

const pushMock = vi.hoisted(() => vi.fn())
const callMock = vi.hoisted(() =>
	vi.fn((..._args: unknown[]): Promise<unknown> => Promise.resolve())
)
const replaceMock = vi.hoisted(() => vi.fn())
const socketOnMock = vi.hoisted(() => vi.fn())
const socketOffMock = vi.hoisted(() => vi.fn())
const created = vi.hoisted(() => ({ list: [] as any[] }))
const players = vi.hoisted(() => ({ list: [] as any[] }))
const settings = vi.hoisted(() => ({
	data: {} as Record<string, unknown>,
	promise: Promise.resolve(),
}))
const stub = vi.hoisted(() => (name: string) => ({
	name,
	template: `<div><slot /></div>`,
}))

vi.mock('vue-router', () => ({
	useRoute: () => ({
		params: { chapterNumber: '1', lessonNumber: '1' },
		query: {},
	}),
	useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))

vi.mock('frappe-ui', async () => {
	const { reactive } = await import('vue')
	const passthrough = (name: string) => ({
		name,
		template: `<div><slot name="prefix" /><slot name="icon" /><slot /><slot name="suffix" /></div>`,
	})
	return {
		createResource: (config: any) => {
			const resource: any = reactive({
				data: null,
				loading: false,
				_config: config,
				submit: vi.fn((_params: any, handlers: any) => {
					// frappe-ui runs the resource-level onSuccess as well as the
					// per-call one; the outline reload lives on the former.
					config?.onSuccess?.(resource.data)
					handlers?.onSuccess?.(resource.data)
					return Promise.resolve()
				}),
				reload: vi.fn(),
				fetch: vi.fn(),
			})
			created.list.push(resource)
			return resource
		},
		createListResource: () =>
			reactive({
				data: [],
				loading: false,
				update: vi.fn(),
				reload: vi.fn(),
				fetch: vi.fn(),
			}),
		call: callMock,
		usePageMeta: vi.fn(),
		toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
		Badge: passthrough('Badge'),
		Button: {
			name: 'Button',
			template: `<button><slot name="prefix" /><slot name="icon" /><slot /><slot name="suffix" /></button>`,
		},
		TabButtons: passthrough('TabButtons'),
		Tooltip: { name: 'Tooltip', template: `<span><slot /></span>` },
	}
})

vi.mock('@editorjs/editorjs', () => ({
	default: class {
		isReady = Promise.resolve()
		destroy = vi.fn()
	},
}))

vi.mock('@/utils', () => ({
	getEditorTools: () => ({}),
	enablePlyr: () => Promise.resolve(players.list),
	highlightText: vi.fn(),
	sanitizeEditorJs: (x: any) => x,
}))

vi.mock('@/stores/session', () => ({
	sessionStore: () => ({ brand: {} }),
}))
vi.mock('@/stores/sidebar', () => ({
	useSidebar: () => ({ isSidebarCollapsed: false }),
}))
vi.mock('@/stores/settings', () => ({
	useSettings: () => ({ settings }),
}))

vi.mock('@/components/LessonContent.vue', () => ({
	default: stub('LessonContent'),
}))
vi.mock('@/components/CourseInstructors.vue', () => ({
	default: stub('CourseInstructors'),
}))
vi.mock('@/components/ProgressBar.vue', () => ({
	default: stub('ProgressBar'),
}))
vi.mock('@/components/Discussions.vue', () => ({
	default: stub('Discussions'),
}))
vi.mock('@/components/CertificationLinks.vue', () => ({
	default: stub('CertificationLinks'),
}))
vi.mock('@/components/CourseOutline.vue', () => ({
	default: stub('CourseOutline'),
}))
vi.mock('@/components/StudentLessonSidebar.vue', () => ({
	default: stub('StudentLessonSidebar'),
}))
vi.mock('@/components/BottomSheet.vue', () => ({
	default: stub('BottomSheet'),
}))
vi.mock('@/components/Layouts/PageHeader.vue', () => ({
	default: stub('PageHeader'),
}))
vi.mock('@/components/HeaderButton.vue', () => ({
	default: stub('HeaderButton'),
}))
vi.mock('@/components/UserAvatar.vue', () => ({
	default: stub('UserAvatar'),
}))
vi.mock('@/components/Notes/Notes.vue', () => ({ default: stub('Notes') }))
vi.mock('@/components/Notes/InlineLessonMenu.vue', () => ({
	default: stub('InlineLessonMenu'),
}))

// Mirrors src/translation.js: a message with {0}-style placeholders returns a
// formatter object, not a string. A stub that always returns the string hides a
// real "__(...).format is not a function" crash.
const translateStub = (s: string) =>
	/{\d+}/.test(s)
		? {
				format: (...args: unknown[]) =>
					s.replace(/{(\d+)}/g, (match, index) =>
						args[Number(index)] === undefined
							? match
							: String(args[Number(index)])
					),
		  }
		: s

vi.stubGlobal('__', translateStub)

import Lesson from '@/pages/Lesson.vue'
import { markLessonProgress } from '@/utils/markLessonProgress'
import { clearVideoPositions } from '@/composables/useVideoPositions'

const SAVE_PROGRESS =
	'lms.lms.doctype.course_lesson.course_lesson.save_progress'

const findResource = (url: string) =>
	created.list.find((resource) => resource._config.url === url)

async function mountLesson(
	props: { chapterNumber: string; lessonNumber: string } = {
		chapterNumber: '1',
		lessonNumber: '1',
	},
	user: { name: string } | null = { name: 'student@example.com' }
) {
	const wrapper = mount(Lesson, {
		props: { courseName: 'COURSE-1', ...props },
		global: {
			mocks: { __: translateStub },
			provide: {
				$user: reactive({ data: user }),
				$socket: { on: socketOnMock, off: socketOffMock },
			},
		},
	})
	await flushPromises()
	return wrapper
}

class FakePlayer {
	source = 'https://www.youtube.com/watch?v=abc'
	currentTime = 0
	duration = 100
	embed = { seekTo: vi.fn() }
	play = vi.fn()
	pause = vi.fn()
	private handlers: Record<string, ((event: object) => void)[]> = {}
	on(event: string, handler: (event: object) => void): void {
		;(this.handlers[event] ??= []).push(handler)
	}
	emit(event: string): void {
		this.handlers[event]?.forEach((handler) => handler({}))
	}
}

const enrolledLesson = {
	name: 'L1',
	title: 'Lesson 1',
	course_title: 'Course 1',
	chapter_title: 'Chapter 1',
	prev: null,
	next: null,
	instructors: [],
	membership: { name: 'ENR-1', progress: 0 },
	progress: 0,
}

const markCalls = () =>
	callMock.mock.calls.filter(
		([method]) => method === 'lms.lms.api.mark_lesson_progress'
	)

const openLesson = async (enforceVideo: number): Promise<FakePlayer> => {
	settings.data = { enforce_video_completion: enforceVideo }
	const player = new FakePlayer()
	players.list = [player]
	wrapper = await mountLesson()
	findResource('lms.lms.utils.get_lesson').data = { ...enrolledLesson }
	await flushPromises()
	return player
}

let wrapper: VueWrapper

beforeEach(() => {
	created.list.length = 0
	callMock.mockReset().mockResolvedValue(undefined)
	clearVideoPositions()
	window.history.pushState({}, '', '/lms/courses/COURSE-1/learn/1-1')
})

afterEach(() => wrapper?.unmount())

// Regression from #2426: a quiz or assignment submit completed an
// enforced-video lesson before the video ended. Added on fix/course-progress-enforcement (no PR yet).
describe('a quiz or assignment submit on an enforced-video lesson', () => {
	it('waits for academic completion before saving positions on repeated ended signals', async () => {
		const player = await openLesson(1)
		player.source = 'https://www.youtube.com/watch?v=Qc08Video01'
		player.currentTime = player.duration
		let handlers: any
		let resolve!: () => void
		const progress = findResource(SAVE_PROGRESS)
		progress.promise = new Promise<void>((done) => {
			resolve = done
		})
		progress.submit.mockImplementation(
			(_params: unknown, callbacks: unknown) => {
				handlers = callbacks
				return progress.promise
			}
		)
		callMock.mockImplementation(async (method, params: any) =>
			method === 'lms.lms.api.track_video_watch_duration' ? params.videos : []
		)
		player.emit('ended')
		player.emit('ended')
		await flushPromises()
		expect(progress.submit).toHaveBeenCalledTimes(1)
		expect(callMock).not.toHaveBeenCalled()
		handlers.onSuccess(50)
		resolve()
		await flushPromises()
		expect(
			callMock.mock.calls.filter(
				([method]) => method === 'lms.lms.api.track_video_watch_duration'
			)
		).toHaveLength(1)
		expect((wrapper.vm as any).completedLesson).toBe('L1')
	})

	it.each(['lesson', 'actor', 'unmount'])(
		'ignores a completion response after %s changes',
		async (change) => {
			const player = await openLesson(1)
			player.source = 'https://www.youtube.com/watch?v=Qc08Video01'
			player.currentTime = player.duration
			let handlers: any
			let resolve!: () => void
			const pending = new Promise<void>((done) => {
				resolve = done
			})
			const progress = findResource(SAVE_PROGRESS)
			progress.submit.mockImplementation(
				(_params: unknown, callbacks: unknown) => {
					handlers = callbacks
					return pending
				}
			)
			player.emit('ended')
			expect(progress.submit).toHaveBeenCalledTimes(1)
			if (change === 'lesson') {
				await wrapper.setProps({ lessonNumber: '2' })
				findResource('lms.lms.utils.get_lesson').data = {
					...enrolledLesson,
					name: 'L2',
				}
				await flushPromises()
			} else if (change === 'actor') {
				;(wrapper.vm as any).user.data = { name: 'another-student@example.com' }
			} else {
				wrapper.unmount()
			}
			const outline = findResource('lms.lms.utils.get_course_outline')
			outline.reload.mockClear()
			const savesBeforeResponse = callMock.mock.calls.filter(
				([method]) => method === 'lms.lms.api.track_video_watch_duration'
			).length
			handlers.onSuccess(90)
			resolve()
			await flushPromises()
			expect((wrapper.vm as any).lessonProgress).not.toBe(90)
			expect((wrapper.vm as any).completedLesson).not.toBe('L1')
			expect(outline.reload).not.toHaveBeenCalled()
			expect(
				callMock.mock.calls.filter(
					([method]) => method === 'lms.lms.api.track_video_watch_duration'
				)
			).toHaveLength(savesBeforeResponse)
		}
	)

	it('does not complete the lesson before the video ends', async () => {
		await openLesson(1)
		markLessonProgress()
		expect(markCalls()).toHaveLength(0)
	})

	it('completes the lesson once the video has ended', async () => {
		const player = await openLesson(1)
		player.emit('ended')
		expect(findResource(SAVE_PROGRESS).submit).toHaveBeenCalled()
		markLessonProgress()
		expect(markCalls()).toHaveLength(1)
	})

	it('retries a pending position without submitting academic progress again after completion', async () => {
		let saves = 0
		callMock.mockImplementation(async (method, params: any) => {
			if (method === 'lms.lms.api.track_video_watch_duration') {
				if (++saves === 1) throw new Error('Synthetic position conflict')
				return params.videos
			}
			return []
		})
		const player = await openLesson(1)
		player.source = 'https://www.youtube.com/watch?v=Qc08Video01'
		player.currentTime = player.duration
		player.emit('ended')
		await flushPromises()
		const submit = findResource(SAVE_PROGRESS).submit
		expect(submit).toHaveBeenCalledTimes(1)
		const retry = wrapper
			.findAll('button')
			.find((button) => button.text() === 'Save pending position')!
		expect(retry).toBeDefined()
		await retry.trigger('click')
		await flushPromises()
		expect(saves).toBe(2)
		expect(submit).toHaveBeenCalledTimes(1)
		player.emit('ended')
		await flushPromises()
		expect(submit).toHaveBeenCalledTimes(1)
	})

	it('completes the lesson straight away when video is not enforced', async () => {
		await openLesson(0)
		markLessonProgress()
		expect(markCalls()).toHaveLength(1)
	})

	it('stops waiting once the page is left', async () => {
		await openLesson(1)
		wrapper.unmount()
		markLessonProgress()
		expect(markCalls()).toHaveLength(1)
	})
})

// Regression on this branch only, no upstream PR: a revisit had to re-watch the video.
// Added on fix/course-progress-enforcement (no PR yet).
describe('an enforced video resumed at its end', () => {
	const resumeAt = async (watchTime: number, duration = 100) => {
		const player = await openLesson(1)
		player.duration = duration
		findResource('lms.lms.utils.get_lesson').data = {
			...enrolledLesson,
			name: 'L1-revisit',
			videos: [{ source: player.source, watch_time: watchTime }],
		}
		await flushPromises()
		player.emit('ready')
		return findResource(SAVE_PROGRESS).submit
	}

	it('completes the lesson without a re-watch', async () => {
		expect(await resumeAt(100)).toHaveBeenCalled()
	})

	it('does not complete a lesson resumed part-way through', async () => {
		expect(await resumeAt(40)).not.toHaveBeenCalled()
	})

	// Bunny reports its duration only with timeupdate, so it is 0 at ready.
	it('completes once a player with no duration at ready reports one', async () => {
		const submit = await resumeAt(100, 0)
		expect(submit).not.toHaveBeenCalled()
		const player = players.list[0]
		player.duration = 100
		player.emit('timeupdate')
		player.emit('timeupdate')
		expect(submit).toHaveBeenCalledTimes(1)
	})
})

// Regression on this branch only, no upstream PR: an uploaded video resumed at its
// end re-held completion, so a later quiz or assignment submit did nothing.
// Added on fix/course-progress-enforcement (no PR yet).
describe('an uploaded video already loaded when resumed', () => {
	const SRC = 'https://example.com/files/intro.mp4'

	const resumeUploadedAt = async (watchTime: number) => {
		const video = document.createElement('video')
		video.src = SRC
		Object.defineProperty(video, 'readyState', { value: 1 })
		Object.defineProperty(video, 'duration', { value: 100 })
		document.body.appendChild(video)
		settings.data = { enforce_video_completion: 1 }
		players.list = []
		wrapper = await mountLesson()
		findResource('lms.lms.utils.get_lesson').data = {
			...enrolledLesson,
			videos: [{ source: SRC, watch_time: watchTime }],
		}
		await flushPromises()
	}

	afterEach(() => (document.body.innerHTML = ''))

	it('lets a later submit complete the lesson once watched to the end', async () => {
		await resumeUploadedAt(100)
		markLessonProgress()
		expect(markCalls()).toHaveLength(1)
	})

	it('still holds completion when resumed part-way through', async () => {
		await resumeUploadedAt(40)
		markLessonProgress()
		expect(markCalls()).toHaveLength(0)
	})
})

describe('an uploaded video whose metadata arrives after the saved position', () => {
	const SRC = 'https://example.com/files/cold.mp4'
	const openColdVideo = async (watchTime: number) => {
		const video = document.createElement('video')
		video.src = SRC
		const media = { ready: 0, duration: Number.NaN, position: 0 }
		const seek = vi.fn((value: number) => {
			media.position = value
		})
		Object.defineProperties(video, {
			readyState: { get: () => media.ready },
			duration: { get: () => media.duration },
			currentTime: { get: () => media.position, set: seek },
		})
		document.body.appendChild(video)
		settings.data = { enforce_video_completion: 1 }
		players.list = []
		wrapper = await mountLesson()
		findResource('lms.lms.utils.get_lesson').data = {
			...enrolledLesson,
			videos: [{ source: SRC, watch_time: watchTime }],
		}
		await flushPromises()
		const metadata = async (duration = 8) => {
			media.ready = 1
			media.duration = duration
			video.dispatchEvent(new Event('loadedmetadata'))
			await flushPromises()
		}
		return { video, media, seek, metadata }
	}

	afterEach(() => {
		document.body.innerHTML = ''
	})

	it('restores a partial position using the duration available at metadata time', async () => {
		const { media, seek, metadata } = await openColdVideo(3.9)
		expect(seek).not.toHaveBeenCalled()
		await metadata()
		expect(media.position).toBe(3.9)
		expect(findResource(SAVE_PROGRESS).submit).not.toHaveBeenCalled()
	})

	it('keeps the native completed-video replay and completes only its own lesson', async () => {
		const { media, metadata } = await openColdVideo(8)
		await metadata()
		expect(media.position).toBe(0)
		expect(findResource(SAVE_PROGRESS).submit).toHaveBeenCalledTimes(1)
	})
	it.each([Number.NaN, 0])(
		'does not seek or complete with invalid metadata duration %s',
		async (duration) => {
			const { seek, metadata } = await openColdVideo(8)
			await metadata(duration)
			expect(seek).not.toHaveBeenCalled()
			expect(findResource(SAVE_PROGRESS).submit).not.toHaveBeenCalled()
		}
	)

	it.each(['actor', 'lesson', 'source', 'unmount'])(
		'ignores late metadata after %s changes',
		async (change) => {
			const { video, seek, metadata } = await openColdVideo(8)
			if (change === 'actor') {
				;(wrapper.vm as any).user.data = { name: 'another-student@example.com' }
			} else if (change === 'lesson') {
				await wrapper.setProps({ lessonNumber: '2' })
				findResource('lms.lms.utils.get_lesson').data = {
					...enrolledLesson,
					name: 'L2',
				}
				await flushPromises()
			} else if (change === 'source') {
				video.src = 'https://example.com/files/another.mp4'
			} else {
				wrapper.unmount()
			}
			await metadata()
			expect(seek).not.toHaveBeenCalled()
			expect(findResource(SAVE_PROGRESS).submit).not.toHaveBeenCalled()
		}
	)
})

describe('a delayed external player', () => {
	it.each(['actor', 'lesson', 'source', 'unmount'])(
		'ignores ready after %s changes',
		async (change) => {
			const player = await openLesson(1)
			findResource('lms.lms.utils.get_lesson').data = {
				...enrolledLesson,
				videos: [{ source: player.source, watch_time: 100 }],
			}
			await flushPromises()
			if (change === 'actor')
				(wrapper.vm as any).user.data = { name: 'another@example.com' }
			else if (change === 'lesson')
				await wrapper.setProps({ lessonNumber: '2' })
			else if (change === 'source')
				player.source = 'https://www.youtube.com/watch?v=other'
			else wrapper.unmount()
			player.emit('ready')
			await flushPromises()
			expect(player.embed.seekTo).not.toHaveBeenCalled()
			expect(findResource(SAVE_PROGRESS).submit).not.toHaveBeenCalled()
		}
	)
	it('ignores a late duration after a lesson changes', async () => {
		const player = await openLesson(1)
		player.duration = 0
		findResource('lms.lms.utils.get_lesson').data = {
			...enrolledLesson,
			videos: [{ source: player.source, watch_time: 100 }],
		}
		await flushPromises()
		player.emit('ready')
		await wrapper.setProps({ lessonNumber: '2' })
		player.duration = 100
		player.emit('timeupdate')
		expect(findResource(SAVE_PROGRESS).submit).not.toHaveBeenCalled()
	})
})

describe('a Bunny Stream lesson', () => {
	const BUNNY = 'https://player.mediadelivery.net/embed/123/abc-def'

	const openBunnyLesson = async (): Promise<HTMLIFrameElement> => {
		const iframe = document.createElement('iframe')
		iframe.src = BUNNY
		document.body.appendChild(iframe)
		settings.data = { enforce_video_completion: 1 }
		players.list = []
		wrapper = await mountLesson()
		findResource('lms.lms.utils.get_lesson').data = { ...enrolledLesson }
		await flushPromises()
		return iframe
	}

	afterEach(() => (document.body.innerHTML = ''))

	it('is tracked as the lesson video', async () => {
		await openBunnyLesson()
		markLessonProgress()
		expect(markCalls()).toHaveLength(0)
	})

	it('completes the lesson when the player reports ended', async () => {
		const iframe = await openBunnyLesson()
		window.dispatchEvent(
			new MessageEvent('message', {
				data: JSON.stringify({ context: 'player.js', event: 'ended' }),
				origin: 'https://player.mediadelivery.net',
				source: iframe.contentWindow,
			})
		)
		expect(findResource(SAVE_PROGRESS).submit).toHaveBeenCalled()
	})
})
