import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, inject, nextTick } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createResource, setConfig } from 'frappe-ui'
import CourseForm from '@/pages/Courses/CourseForm.vue'
import CourseDangerZone from '@/components/Courses/CourseDangerZone.vue'

const metadata = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/utils', () => ({
	getMetaInfo: vi.fn(),
	updateMetaInfo: metadata.save,
}))
vi.mock('@/utils/exportCourse', () => ({ exportCourseAsZip: vi.fn() }))
vi.mock('@/components/Courses/CourseDetailsSection.vue', () => ({
	default: defineComponent({
		setup() {
			return { form: inject<any>('courseForm') }
		},
		template:
			'<input data-testid="title" v-model="form.resource.doc.title" @input="form.markDirty()" />',
	}),
}))
vi.mock('@/components/Courses/CourseOverviewSection.vue', () => ({
	default: defineComponent({
		setup() {
			return {
				form: inject<any>('courseForm'),
				markMetaDirty: inject<() => void>('markCourseMetaDirty'),
			}
		},
		template:
			'<input data-testid="meta" v-model="form.meta.description" @input="markMetaDirty()" />',
	}),
}))
vi.mock('@/pages/Courses/CoursePublishSettings.vue', () => ({
	default: { template: '<div />' },
}))

enableAutoUnmount(afterEach)
let serial = 0
const open = async () => {
	sessionStorage.clear()
	metadata.save.mockReset().mockResolvedValue(undefined)
	const name = `quality-course-${++serial}`
	let rejectSave!: (error: unknown) => void
	let resolveSave!: (data: unknown) => void
	const fetcher = vi.fn((request: { url: string }) => {
		if (request.url.includes('set_value'))
			return new Promise((resolve, reject) => {
				resolveSave = resolve
				rejectSave = reject
			})
		return Promise.resolve({
			name,
			title: 'Original',
			short_introduction: 'Intro',
			description: '<p>Description</p>',
			instructors: [{ instructor: 'author' }],
			related_courses: [],
			published: 0,
		})
	})
	setConfig('resourceFetcher', fetcher)
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', name: 'Courses', component: { template: '<div />' } },
		],
	})
	await router.push('/')
	const wrapper = mount(CourseForm, {
		props: { course: { data: { name }, reload: vi.fn() } as any },
		global: {
			plugins: [router],
			mocks: { __: (text: string) => text },
			provide: { $user: { data: { name: 'author', is_moderator: true } } },
			config: { globalProperties: { $dialog: vi.fn() } },
		},
	})
	await flushPromises()
	return {
		wrapper,
		fetcher,
		reject: (error: unknown) => rejectSave(error),
		finish: () =>
			resolveSave(
				JSON.parse(JSON.stringify((wrapper.vm as any).courseResource.doc))
			),
	}
}

describe('course edits with the actual native document resource', () => {
	it('refreshes existing outline audiences after confirmed lifecycle changes without treating a read error as a write error', async () => {
		const { wrapper, fetcher } = await open()
		const course = (wrapper.props('course') as any).data.name
		const snapshots = [
			['course_outline', course],
			['course_outline_student', course, 'progress'],
			['course_outline_student', course, 'no-progress'],
		].map((cache) => createResource({ url: 'outline-read', cache }))
		const reloads = snapshots.map((resource) =>
			vi.spyOn(resource, 'reload').mockRejectedValue(new Error('read failed'))
		)
		vi.spyOn((wrapper.vm as any).courseResource, 'reload').mockResolvedValue(
			undefined
		)
		const before = fetcher.mock.calls.length
		wrapper
			.findComponent(CourseDangerZone)
			.vm.$emit('changed', { is_archived: 1, published: 0 })
		await flushPromises()
		for (const reload of reloads) expect(reload).toHaveBeenCalledTimes(1)
		expect((wrapper.vm as any).courseResource.doc.is_archived).toBe(1)
		expect(fetcher.mock.calls.length).toBe(before)
	})
	it('prevents duplicate saves and restores typed content and instructors after native rollback on 401', async () => {
		const { wrapper, fetcher, reject } = await open()
		await wrapper.get('[data-testid="title"]').setValue('Typed title')
		const vm = wrapper.vm as any
		vm.instructors = ['another-teacher']
		vm.submitCourse()
		vm.submitCourse()
		await flushPromises()
		expect(
			fetcher.mock.calls.filter(([request]) =>
				request.url.includes('set_value')
			)
		).toHaveLength(1)
		expect(vm.isSaving).toBe(true)
		reject({ status: 401, exc_type: 'AuthenticationError' })
		await flushPromises()
		await nextTick()
		expect(vm.isSaving).toBe(false)
		expect(
			(wrapper.get('[data-testid="title"]').element as HTMLInputElement).value
		).toBe('Typed title')
		expect(vm.instructors).toEqual(['another-teacher'])
		expect(vm.isDirty).toBe(true)
		expect(Object.values(sessionStorage).join()).toContain('Typed title')
	})
	it('keeps loading through metadata and preserves the edit if that second request fails', async () => {
		const { wrapper, finish, fetcher } = await open()
		let rejectMetadata!: (error: unknown) => void
		metadata.save.mockImplementation(
			() =>
				new Promise((_resolve, reject) => {
					rejectMetadata = reject
				})
		)
		await wrapper
			.get('[data-testid="meta"]')
			.setValue('Description awaiting confirmation')
		const vm = wrapper.vm as any
		vm.submitCourse()
		await flushPromises()
		finish()
		await flushPromises()
		expect(vm.isSaving).toBe(true)
		expect(vm.isDirty).toBe(true)
		vm.submitCourse()
		expect(
			fetcher.mock.calls.filter(([request]) =>
				request.url.includes('set_value')
			)
		).toHaveLength(1)
		rejectMetadata({ status: 500 })
		await flushPromises()
		expect(vm.isSaving).toBe(false)
		expect(vm.isDirty).toBe(true)
		expect(
			(wrapper.get('[data-testid="meta"]').element as HTMLInputElement).value
		).toBe('Description awaiting confirmation')
		expect((wrapper.props('course') as any).reload).not.toHaveBeenCalled()
	})
})
