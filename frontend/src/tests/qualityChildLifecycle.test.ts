import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { testTranslate } from './setup'

const state = vi.hoisted(() => ({
	outline: null as any,
	calls: [] as any[],
	failed: false,
	dialog: null as any,
	reads: [] as any[],
	cache: new Map<string, any>(),
}))
vi.mock('frappe-ui', () => ({
	Button: { template: '<button @click="$emit(\'click\')"><slot/></button>' },
	toast: { success: vi.fn(), error: vi.fn() },
	getCachedResource: (key: any[]) => state.cache.get(JSON.stringify(key)),
	createResource: (options: any) => {
		if (options.url.endsWith('get_course_outline')) {
			state.reads.push(options)
			const key = JSON.stringify(options.cache)
			if (!state.cache.has(key)) state.cache.set(key, state.outline)
			return state.cache.get(key)
		}
		return reactive({
			loading: false,
			submit: async (params: any, handlers: any = {}) => {
				state.calls.push({ url: options.url, params })
				if (state.failed) {
					const error = { messages: ['Falha controlada'] }
					handlers.onError?.(error)
					throw error
				}
				const result = {
					doctype: params.lesson ? 'Course Lesson' : 'Course Chapter',
					name: params.lesson || params.chapter,
					course: 'course',
					is_archived: options.url.includes('.archive_') ? 1 : 0,
					archived_on: options.url.includes('.archive_')
						? '2026-11-21 15:00:00'
						: null,
				}
				handlers.onSuccess?.(result)
				return result
			},
		})
	},
}))
vi.mock('vuedraggable', () => ({
	default: {
		props: ['list'],
		template:
			'<div><slot v-for="row in list" name="item" :element="row"/></div>',
	},
}))
vi.mock('@/components/ChapterRow.vue', () => ({
	default: {
		name: 'ChapterRow',
		props: ['chapter'],
		emits: [
			'delete-lesson',
			'delete-chapter',
			'restore-lesson',
			'restore-chapter',
		],
		template: '<div>{{ chapter.title }}</div>',
	},
}))
import CourseOutline from '@/components/CourseOutline.vue'

beforeEach(() => {
	state.calls = []
	state.failed = false
	state.dialog = null
	state.reads = []
	state.cache.clear()
	state.outline = reactive({
		data: [
			{
				name: 'chapter',
				title: 'Capítulo',
				idx: 1,
				is_archived: 0,
				lessons: [
					{ name: 'lesson', title: 'Aula', number: '1-1', is_archived: 0 },
				],
			},
		],
		reload: vi.fn().mockResolvedValue(undefined),
	})
})
const open = async (props: Record<string, any> = {}) => {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ name: 'CourseDetail', path: '/', component: { template: '<div/>' } },
		],
	})
	await router.push('/')
	return mount(CourseOutline, {
		props: { courseName: 'course', allowEdit: true, ...props },
		global: {
			plugins: [router],
			mocks: { __: testTranslate },
			config: {
				globalProperties: {
					$dialog: (options: any) => {
						state.dialog = options
					},
				},
			},
		},
	})
}
describe('child content archive contract', () => {
	it('cancels without a request, then archives without deleting references or clearing editor selection', async () => {
		const wrapper = await open(),
			row = wrapper.findComponent({ name: 'ChapterRow' })
		row.vm.$emit('delete-lesson', { lesson: 'lesson', chapter: 'chapter' })
		await flushPromises()
		state.dialog.actions[0].onClick({ close: vi.fn() })
		expect(state.calls).toHaveLength(0)
		await state.dialog.actions[1].onClick({ close: vi.fn() })
		await flushPromises()
		expect(state.calls[0]).toEqual({
			url: 'lms.lms.api.archive_lesson',
			params: { lesson: 'lesson', chapter: 'chapter' },
		})
		expect(state.outline.data[0].lessons).toHaveLength(1)
		expect(state.outline.data[0].lessons[0]).toMatchObject({
			name: 'lesson',
			number: '1-1',
			is_archived: 1,
		})
		expect(wrapper.emitted('lesson-deleted')).toBeUndefined()
		expect(wrapper.emitted('content-state-changed')).toHaveLength(1)
		wrapper.unmount()
	})
	it('restores only the chapter and preserves separately archived lessons', async () => {
		state.outline.data[0].is_archived = 1
		state.outline.data[0].lessons[0].is_archived = 1
		const wrapper = await open()
		wrapper
			.findComponent({ name: 'ChapterRow' })
			.vm.$emit('restore-chapter', 'chapter')
		await flushPromises()
		expect(state.calls[0].url).toBe('lms.lms.api.restore_chapter')
		expect(state.outline.data[0].is_archived).toBe(0)
		expect(state.outline.data[0].lessons[0].is_archived).toBe(1)
		wrapper.unmount()
	})
	it('keeps the exact outline after a refused archive', async () => {
		const wrapper = await open()
		state.failed = true
		wrapper
			.findComponent({ name: 'ChapterRow' })
			.vm.$emit('delete-chapter', 'chapter')
		await flushPromises()
		await state.dialog.actions[1].onClick({ close: vi.fn() })
		await flushPromises()
		expect(state.outline.data[0].is_archived).toBe(0)
		expect(wrapper.emitted('content-state-changed')).toBeUndefined()
		expect(state.outline.reload).not.toHaveBeenCalled()
		wrapper.unmount()
	})
	it.each([
		[
			{ allowEdit: true, getProgress: true },
			['course_outline', 'course'],
			false,
		],
		[
			{ allowEdit: false, getProgress: true },
			['course_outline_student', 'course', 'progress'],
			true,
		],
		[
			{ allowEdit: false, getProgress: false },
			['course_outline_student', 'course', 'no-progress'],
			false,
		],
	])(
		'separates audience and actual progress params: %j',
		async (props, key, progress) => {
			const wrapper = await open(props)
			expect(state.reads[0].cache).toEqual(key)
			expect(state.reads[0].params).toEqual({ course: 'course', progress })
			wrapper.unmount()
		}
	)
	it('rebinds course and progress together and leaves previous cache params immutable', async () => {
		const wrapper = await open({ allowEdit: false, getProgress: false })
		const original = state.reads[0]
		await wrapper.setProps({ courseName: 'second', getProgress: true })
		expect(state.reads.at(-1).cache).toEqual([
			'course_outline_student',
			'second',
			'progress',
		])
		expect(state.reads.at(-1).params).toEqual({
			course: 'second',
			progress: true,
		})
		expect(original.params).toEqual({ course: 'course', progress: false })
		await wrapper.setProps({ getProgress: false })
		expect(state.reads.at(-1).cache).toEqual([
			'course_outline_student',
			'second',
			'no-progress',
		])
		await wrapper.setProps({ allowEdit: true, getProgress: true })
		expect(state.reads.at(-1).cache).toEqual(['course_outline', 'second'])
		expect(state.reads.at(-1).params.progress).toBe(false)
		wrapper.unmount()
	})
	it('refreshes existing snapshots once after success even when a read fails', async () => {
		const { toast } = await import('frappe-ui')
		vi.mocked(toast.error).mockClear()
		const progress = {
			reload: vi.fn().mockRejectedValue(new Error('read failed')),
		}
		const preview = { reload: vi.fn().mockResolvedValue(undefined) }
		state.cache.set(
			JSON.stringify(['course_outline_student', 'course', 'progress']),
			progress
		)
		state.cache.set(
			JSON.stringify(['course_outline_student', 'course', 'no-progress']),
			preview
		)
		const wrapper = await open()
		wrapper
			.findComponent({ name: 'ChapterRow' })
			.vm.$emit('restore-lesson', 'lesson')
		await flushPromises()
		expect(state.calls).toHaveLength(1)
		expect(state.outline.reload).toHaveBeenCalledTimes(1)
		expect(progress.reload).toHaveBeenCalledTimes(1)
		expect(preview.reload).toHaveBeenCalledTimes(1)
		expect(wrapper.emitted('content-state-changed')).toHaveLength(1)
		expect(toast.error).not.toHaveBeenCalled()
		wrapper.unmount()
	})
})
