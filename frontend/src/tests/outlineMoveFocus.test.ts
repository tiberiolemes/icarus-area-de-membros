import { afterEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, reactive, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import CourseOutline from '@/components/CourseOutline.vue'
import { FormControl } from 'frappe-ui'
import BottomSheet from '@/components/BottomSheet.vue'
import { testTranslate } from './setup'

const state = vi.hoisted(() => ({
	pending: null as null | (() => void),
	hold: false,
}))
vi.mock('frappe-ui', async (original) => ({
	...(await original<any>()),
	createResource: ({ url }: any) =>
		reactive({
			data: url.endsWith('get_course_outline')
				? [
						{
							name: 'chapter',
							title: 'Chapter',
							idx: 1,
							lessons: [{ name: 'lesson', title: 'Lesson', number: '1-1' }],
						},
				  ]
				: null,
			reload: vi.fn().mockResolvedValue(undefined),
			submit: () =>
				state.hold
					? new Promise<void>((resolve) => {
							state.pending = resolve
					  })
					: Promise.resolve(),
		}),
}))
vi.mock('vuedraggable', () => ({
	default: { props: ['list'], template: '<div/>' },
}))
vi.mock('@/components/ChapterRow.vue', () => ({
	default: { template: '<div/>' },
}))
let wrapper: ReturnType<typeof mount>
afterEach(async () => {
	wrapper?.unmount()
	await flushPromises()
	document.body.innerHTML = ''
	state.hold = false
	state.pending = null
	vi.restoreAllMocks()
})
const settle = async () => {
	await flushPromises()
	await new Promise((resolve) => setTimeout(resolve, 0))
	await flushPromises()
}
async function open(inSheet = false) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
	})
	await router.push('/course')
	const user = reactive({ data: { name: 'actor-a' } })
	const sheetOpen = ref(false)
	const host = inSheet
		? defineComponent({
				setup: () => () =>
					h(
						BottomSheet,
						{
							modelValue: sheetOpen.value,
							'onUpdate:modelValue': (open: boolean) => {
								sheetOpen.value = open
							},
							title: 'Chapters',
						},
						() => h(CourseOutline, { courseName: 'course', allowEdit: true })
					),
		  })
		: CourseOutline
	wrapper = mount(host, {
		attachTo: document.body,
		props: { courseName: 'course', allowEdit: true },
		global: {
			plugins: [router],
			mocks: { __: testTranslate },
			provide: { $user: user },
			config: { globalProperties: { $dialog: vi.fn() } },
		},
	})
	if (inSheet) {
		sheetOpen.value = true
		await settle()
	}
	const opener = new DOMWrapper(
		[
			...document.querySelectorAll<HTMLButtonElement>(
				'[data-tour="course-outline"] button'
			),
		].find((button) => button.textContent === 'Reordenar sem arrastar')!
	)
	vi.spyOn(opener.element, 'getClientRects').mockReturnValue([
		{ width: 100, height: 44 },
	] as any)
	await opener.trigger('click')
	await settle()
	expect(document.querySelector('[role="dialog"]')).not.toBeNull()
	const controls = wrapper.findAllComponents(FormControl)
	controls[2].vm.$emit('update:modelValue', 'chapter')
	await settle()
	return { opener, router, user, sheetOpen }
}

it.each(['cancel', 'escape', 'success'])(
	'preserves the real mobile sheet and restores its move opener after %s',
	async (action) => {
		const { opener, sheetOpen } = await open(true)
		const active = document.querySelector('[role="dialog"][data-state="open"]')!
		const button = [
			...active.querySelectorAll<HTMLButtonElement>('button'),
		].find(
			(b) => b.textContent === (action === 'success' ? 'Mover' : 'Cancelar')
		)!
		button.focus()
		if (action === 'escape')
			button.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
			)
		else button.click()
		await settle()
		expect(sheetOpen.value).toBe(true)
		expect(
			document.querySelector('[role="dialog"][data-state="open"]')
		).toBeNull()
		expect(document.activeElement).toBe(opener.element)
		if (action === 'escape') {
			opener.element.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
			)
			await settle()
			expect(sheetOpen.value).toBe(false)
		}
	}
)
it.each(['cancel', 'escape', 'success'])(
	'restores the actual move opener after %s',
	async (action) => {
		const { opener } = await open()
		const button = [
			...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
		].find(
			(b) => b.textContent === (action === 'success' ? 'Mover' : 'Cancelar')
		)!
		button.focus()
		if (action === 'escape')
			button.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
			)
		else button.click()
		await settle()
		expect(document.querySelector('[role="dialog"]')).toBeNull()
		expect(document.activeElement).toBe(opener.element)
	}
)

it('lets Escape dismiss a real native selector before the move dialog or its sheet', async () => {
	const { sheetOpen, opener } = await open(true)
	const combo = document.querySelector<HTMLButtonElement>(
		'[role="dialog"][data-state="open"] [role="combobox"]'
	)!
	combo.focus()
	combo.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
	)
	await settle()
	expect(document.querySelector('[role="listbox"]')).not.toBeNull()
	const focused = document.activeElement as HTMLElement
	focused.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
	)
	await settle()
	expect(document.querySelector('[role="listbox"]')).toBeNull()
	expect(sheetOpen.value).toBe(true)
	expect(
		document.querySelector('[role="dialog"][data-state="open"]')
	).not.toBeNull()
	const cancel = [
		...document.querySelectorAll<HTMLButtonElement>(
			'[role="dialog"][data-state="open"] button'
		),
	].find((button) => button.textContent === 'Cancelar')!
	cancel.click()
	await settle()
	expect(document.activeElement).toBe(opener.element)
})
it.each(['route', 'actor', 'unmount'])(
	'does not steal focus after a late move result and %s change',
	async (change) => {
		state.hold = true
		const { router, user } = await open()
		const move = [
			...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
		].find((b) => b.textContent === 'Mover')!
		move.click()
		await settle()
		expect(state.pending).not.toBeNull()
		if (change === 'route') await router.push('/different')
		if (change === 'actor') user.data.name = 'actor-b'
		if (change === 'unmount') wrapper.unmount()
		await settle()
		const next = document.createElement('button')
		next.textContent = 'New screen'
		document.body.append(next)
		next.focus()
		state.pending!()
		await settle()
		expect(document.activeElement).toBe(next)
	}
)
