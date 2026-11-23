// Lesson.vue gates its Notes tab, inline notes menu and Community tab on the
// session user's doctype permissions, so a role stripped of them sees nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

const pushMock = vi.hoisted(() => vi.fn())
const replaceMock = vi.hoisted(() => vi.fn())
const socketOnMock = vi.hoisted(() => vi.fn())
const socketOffMock = vi.hoisted(() => vi.fn())
const created = vi.hoisted(() => ({
	list: [] as any[],
	epoch: 0,
	route: null as any,
	user: null as any,
	lessonRequests: [] as any[],
}))
const stub = vi.hoisted(() => (name: string) => ({
	name,
	template: `<div><slot /></div>`,
}))

vi.mock('vue-router', async (importOriginal) => ({
	...(await importOriginal<any>()),
	useRoute: () => created.route,
	useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))
vi.mock('frappe-ui', async (importOriginal) => {
	const native = await importOriginal<any>()
	const { reactive } = await import('vue')
	return {
		...native,
		createResource: (config: any) => {
			const resource = native.createResource({
				...config,
				cache: config.cache ? [config.cache, created.epoch] : undefined,
				resourceFetcher: (request: any) => {
					if (request.url === 'lms.lms.utils.get_lesson')
						return new Promise((resolve, reject) =>
							created.lessonRequests.push({ request, resolve, reject })
						)
					return Promise.resolve(
						request.url === 'lms.lms.utils.get_course_outline' ? [] : {}
					)
				},
			})
			resource._config = config
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
		usePageMeta: vi.fn(),
		toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
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
	enablePlyr: () => Promise.resolve([]),
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
	useSettings: () => ({
		settings: { data: {}, promise: Promise.resolve() },
	}),
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

// Mirrors src/translation.js: a {0} placeholder returns a { format } object,
// so a "__(...).format is not a function" crash is not hidden.
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
import type { DoctypePermissionType, SessionUser } from '@/types'

const findResource = (url: string) =>
	created.list.find((resource) => resource._config.url === url)

type Perms = Record<DoctypePermissionType, 0 | 1>

const ALL: Perms = { read: 1, write: 1, create: 1, delete: 1 }
const NONE: Perms = { read: 0, write: 0, create: 0, delete: 0 }

const studentWith = (
	perms: Record<string, Perms>,
	extra: Record<string, unknown> = {}
): SessionUser => ({
	data: {
		name: 'student@example.com',
		permissions: Object.fromEntries(
			Object.entries(perms).map(([name, flags]) => [name, { ...flags }])
		),
		...extra,
	},
})

const everything = {
	'LMS Lesson Note': ALL,
	'Discussion Topic': ALL,
	'Discussion Reply': ALL,
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
	created.list.length = 0
	created.lessonRequests.length = 0
	created.epoch++
	created.route = reactive({
		params: { chapterNumber: '1', lessonNumber: '1' },
		query: {},
	})
	created.user = reactive(
		studentWith(everything, { sitename: 'qa', username: 'student' })
	)
})

afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
})

const dto = (extra: any = {}) => ({
	name: 'L1',
	title: 'Lesson 1',
	course_title: 'Course 1',
	chapter_title: 'Chapter 1',
	prev: null,
	next: '1.2',
	instructors: [],
	membership: { name: 'M1', progress: 0 },
	content: JSON.stringify({ blocks: [] }),
	...extra,
})
async function open(query: any = {}, extra: any = {}, user = created.user) {
	created.route.query = query
	wrapper = mount(Lesson, {
		attachTo: document.body,
		props: { courseName: 'COURSE-1', chapterNumber: '1', lessonNumber: '1' },
		global: {
			plugins: [
				createRouter({
					history: createMemoryHistory(),
					routes: ['CourseDetail', 'Lesson', 'Courses'].map((name, i) => ({
						name,
						path: '/test-' + i + '/:courseName?/:chapterNumber?/:lessonNumber?',
						component: { template: '<div />' },
					})),
				}),
			],
			mocks: { __: translateStub },
			provide: {
				$user: user,
				$socket: { on: socketOnMock, off: socketOffMock },
			},
		},
	})
	await flushPromises()
	expect(created.lessonRequests).toHaveLength(1)
	created.lessonRequests[0].resolve(dto(extra))
	await flushPromises()
}
const current = () => (wrapper!.vm as any).currentTab
async function chooseNotes() {
	const button = wrapper!
		.findAll('[role=radio]')
		.find((b) => b.text() === 'Notes')!
	expect(button.exists()).toBe(true)
	await button.trigger('click')
	expect(current()).toBe('Notes')
}

it('opens the existing Community tab on cold authorized deep-link and keeps manual choice across resource refresh', async () => {
	await open({ discussion: 'topic099' })
	expect(current()).toBe('Community')
	expect(
		wrapper!.getComponent({ name: 'Discussions' }).attributes('docname')
	).toBe('L1')
	await chooseNotes()
	findResource('lms.lms.utils.get_lesson').setData(dto({ title: 'Refreshed' }))
	await flushPromises()
	expect(current()).toBe('Notes')
	expect(created.lessonRequests).toHaveLength(1)
})

it('applies new AJAX topic intent once, including when the same lesson has no query first', async () => {
	await open()
	expect(current()).toBe('Notes')
	created.route.query.discussion = 'topic099'
	await flushPromises()
	expect(current()).toBe('Community')
	await chooseNotes()
	created.route.query.topics_page = '5'
	await flushPromises()
	expect(current()).toBe('Notes')
	created.route.query.discussion = 'topic098'
	await flushPromises()
	expect(current()).toBe('Community')
})

it('waits for late identity/permissions, then forgets prior actor intent without granting read', async () => {
	const user = reactive({ data: undefined as any })
	await open({ discussion: 'topic099' }, {}, user)
	expect(current()).toBeUndefined()
	user.data = studentWith(everything, { sitename: 'qa' }).data
	await flushPromises()
	expect(current()).toBe('Community')
	user.data = studentWith(
		{ 'LMS Lesson Note': ALL },
		{ name: 'other@example.test', sitename: 'qa' }
	).data
	await flushPromises()
	expect(current()).toBe('Notes')
	expect(wrapper!.findComponent({ name: 'Discussions' }).exists()).toBe(false)
	user.data = studentWith(everything, { sitename: 'qa' }).data
	await flushPromises()
	expect(current()).toBe('Community')
})

it.each([
	{ membership: null },
	{ no_preview: true },
	{ locked: true },
	{ content: JSON.stringify({ blocks: [{ type: 'quiz', data: {} }] }) },
])(
	'does not force Community for inaccessible/preview/quiz payload %j',
	async (payload) => {
		await open({ discussion: 'topic099' }, payload)
		expect(current()).not.toBe('Community')
		expect(wrapper!.findComponent({ name: 'Discussions' }).exists()).toBe(false)
	}
)

it.each(['', undefined, ['topic099']])(
	'keeps Notes for a non-string or empty intent %j',
	async (discussion) => {
		await open({ discussion })
		expect(current()).toBe('Notes')
	}
)

it('does not force the hidden zen tab, applies pending intent after leaving zen, and respects revocation', async () => {
	await open()
	const vm = wrapper!.vm as any
	vm.zenModeEnabled = true
	vm.checkIfDiscussionsAllowed()
	created.route.query.discussion = 'topic099'
	await flushPromises()
	expect(current()).toBe('Notes')
	vm.zenModeEnabled = false
	vm.checkIfDiscussionsAllowed()
	await flushPromises()
	expect(current()).toBe('Community')
	created.user.data.permissions['Discussion Topic'] = NONE
	await flushPromises()
	expect(current()).toBe('Notes')
})

it('waits for the new lesson request after AJAX navigation rather than opening against old data', async () => {
	await open()
	await wrapper!.setProps({ lessonNumber: '2' })
	created.route.params.lessonNumber = '2'
	created.route.query.discussion = 'topic099-new'
	await flushPromises()
	expect(created.lessonRequests).toHaveLength(2)
	expect(current()).not.toBe('Community')
	created.lessonRequests[1].resolve(dto({ name: 'L2' }))
	await flushPromises()
	expect(findResource('lms.lms.utils.get_lesson').params).toEqual({
		course: 'COURSE-1',
		chapter: '1',
		lesson: '2',
	})
	expect((wrapper!.vm as any).tabs.map((tab: any) => tab.value)).toContain(
		'Community'
	)
	expect(current()).toBe('Community')
	expect(
		wrapper!.getComponent({ name: 'Discussions' }).attributes('docname')
	).toBe('L2')
})
