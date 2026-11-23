import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import GuidedTour from '@/components/GuidedTour.vue'
import { catalogue, focusTarget } from '@/tours/definitions'
import { testTranslate } from './setup'

enableAutoUnmount(afterEach)
let targets: HTMLElement
beforeEach(() => {
	vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function () {
		return this.closest('[hidden]')
			? ([] as any)
			: ([{ width: 100, height: 44 }] as any)
	})
	targets = document.createElement('div')
	targets.innerHTML =
		'<div data-tour="list-filters"><input aria-label="Buscar" /></div><div data-tour="list-results"><a href="/lms/courses/test">Curso sintético</a></div>'
	document.body.append(targets)
})
afterEach(() => {
	targets.remove()
	vi.restoreAllMocks()
})

function backend() {
	const stored: Record<string, any> = {}
	const request = vi.fn(async (method: string, args: any) => {
		const state = (stored[args.page] ||= {
			status: 'Not Started',
			step: 0,
			total: 2,
			helpful: '',
		})
		if (method.endsWith('get_state')) return { ...state }
		if (args.action === 'start' || args.action === 'restart')
			state.status = 'In Progress'
		if (args.action === 'progress') state.step = args.step
		if (args.action === 'complete') state.status = 'Completed'
		if (args.action === 'skip') state.status = 'Skipped'
		if (args.action === 'pause') state.status = 'Paused'
		if (args.action === 'rate') state.helpful = args.helpful ? 'Yes' : 'No'
		return { ...state }
	})
	return { request, stored }
}
function render(api: ReturnType<typeof backend>) {
	return mount(GuidedTour, {
		attachTo: document.body,
		props: { pageKey: 'Courses', request: api.request },
		global: { mocks: { __: testTranslate } },
	})
}
async function click(wrapper: any, label: string) {
	const button = wrapper
		.findAll('button')
		.find((node: any) => node.text() === label)
	expect(
		button,
		`${label}: ${wrapper
			.findAll('button')
			.map((node: any) => node.text())
			.join(' | ')} / ${wrapper.text()}`
	).toBeTruthy()
	await button.trigger('click')
	await flushPromises()
}

describe('one operational tour component', () => {
	it('focuses the real visible target, completes separately from rating and preserves input', async () => {
		const api = backend(),
			wrapper = render(api)
		const input = targets.querySelector('input')!
		input.value = 'entrada preservada'
		await click(wrapper, 'Passo a passo desta tela')
		expect(document.activeElement).toBe(input)
		await click(wrapper, 'Próximo passo')
		await click(wrapper, 'Concluir tour')
		expect(api.stored.Courses.status).toBe('Completed')
		expect(api.stored.Courses.helpful).toBe('')
		await click(wrapper, 'Não')
		expect(api.stored.Courses.helpful).toBe('No')
		expect(input.value).toBe('entrada preservada')
		expect(
			api.request.mock.calls.every(
				([, args]) => !('user' in args) && !('tenant' in args)
			)
		).toBe(true)
	})
	it('Escape pauses and returns focus without recording completion or skip', async () => {
		const api = backend(),
			wrapper = render(api)
		const trigger = wrapper.get('button').element as HTMLButtonElement
		trigger.focus()
		await click(wrapper, 'Passo a passo desta tela')
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
		)
		await flushPromises()
		expect(api.stored.Courses.status).toBe('Paused')
		expect(document.activeElement).toBe(trigger)
		expect(
			api.request.mock.calls.some(([, args]) =>
				['complete', 'skip', 'rate'].includes(args.action)
			)
		).toBe(false)
	})
	it('returns to its native trigger when a pointer launch did not focus it', async () => {
		const api = backend(),
			wrapper = render(api)
		const trigger = wrapper.get('button').element as HTMLButtonElement
		expect(document.activeElement).not.toBe(trigger)
		await click(wrapper, 'Passo a passo desta tela')
		await click(wrapper, 'Fechar')
		expect(api.stored.Courses.status).toBe('Paused')
		expect(document.activeElement).toBe(trigger)
		expect(trigger.disabled).toBe(false)
	})
	it('restores its enabled trigger while a stale start response is pending', async () => {
		const api = backend()
		let resolveStart!: (value: any) => void
		api.request.mockImplementationOnce(
			() => new Promise((resolve) => (resolveStart = resolve))
		)
		const wrapper = render(api)
		const trigger = wrapper.get('button').element as HTMLButtonElement
		await click(wrapper, 'Passo a passo desta tela')
		await click(wrapper, 'Fechar')
		expect(trigger.disabled).toBe(false)
		expect(document.activeElement).toBe(trigger)
		resolveStart({ status: 'Not Started', step: 0, helpful: '' })
		await flushPromises()
		expect(wrapper.find('section').exists()).toBe(false)
		expect(document.activeElement).toBe(trigger)
		expect(
			api.request.mock.calls.some(([, args]) => args.action === 'complete')
		).toBe(false)
	})
	it('does not move focus after its actor or screen was unmounted during pause', async () => {
		const api = backend(),
			wrapper = render(api)
		await click(wrapper, 'Passo a passo desta tela')
		let resolvePause!: (value: any) => void
		api.request.mockImplementationOnce(
			() => new Promise((resolve) => (resolvePause = resolve))
		)
		await click(wrapper, 'Fechar')
		wrapper.unmount()
		const nextActorControl = document.createElement('button')
		document.body.append(nextActorControl)
		nextActorControl.focus()
		resolvePause({ status: 'Paused', step: 0, helpful: '' })
		await flushPromises()
		expect(document.activeElement).toBe(nextActorControl)
		nextActorControl.remove()
	})
	it('an absent or removed target cannot advance or fabricate completion', async () => {
		const api = backend(),
			wrapper = render(api)
		targets.querySelector('[data-tour="list-filters"]')!.remove()
		await click(wrapper, 'Passo a passo desta tela')
		expect(wrapper.text(), wrapper.html()).toContain('não está disponível')
		const next = wrapper
			.findAll('button')
			.find((node) => node.text() === 'Próximo passo')!
		expect(next.attributes('disabled')).toBeDefined()
		expect(api.stored.Courses.step).toBe(0)
		await click(wrapper, 'Pular tour')
		expect(api.stored.Courses.status).toBe('Skipped')
	})
	it('back reviews a reached step locally and the keyboard advances only from a real target', async () => {
		const api = backend(),
			wrapper = render(api)
		await click(wrapper, 'Passo a passo desta tela')
		await click(wrapper, 'Próximo passo')
		await click(wrapper, 'Voltar')
		expect(document.activeElement).toBe(targets.querySelector('input'))
		document.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'ArrowRight',
				altKey: true,
				bubbles: true,
			})
		)
		await flushPromises()
		expect(
			api.request.mock.calls.filter(([, args]) => args.action === 'progress')
		).toHaveLength(1)
		await click(wrapper, 'Concluir tour')
		expect(api.stored.Courses.status).toBe('Completed')
	})
	it('pauses the previous page on navigation and never transfers its progress to another page', async () => {
		const api = backend(),
			wrapper = render(api)
		await click(wrapper, 'Passo a passo desta tela')
		await wrapper.setProps({ pageKey: 'Batches' })
		await flushPromises()
		expect(api.stored.Courses.status).toBe('Paused')
		expect(api.stored.Batches).toBeUndefined()
		expect(wrapper.find('section').exists()).toBe(false)
	})
	it('cleans up temporary focus attributes and uses no animated scroll', () => {
		const element = targets.querySelector(
			'[data-tour="list-results"]'
		) as HTMLElement
		const scroll = vi.fn()
		element.scrollIntoView = scroll
		const restore = focusTarget(element)
		expect(element.getAttribute('tabindex')).toBe('-1')
		expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' })
		restore()
		expect(element.hasAttribute('tabindex')).toBe(false)
		expect(element.hasAttribute('data-icarus-tour-target')).toBe(false)
	})
	it('keeps a failed pause dismissible and reports the unsaved tracking', async () => {
		const api = backend(),
			wrapper = render(api)
		await click(wrapper, 'Passo a passo desta tela')
		api.request.mockRejectedValueOnce(new Error('offline'))
		await click(wrapper, 'Fechar')
		expect(wrapper.find('section').exists()).toBe(false)
		expect(wrapper.get('[role="alert"]').text()).toContain('Não foi possível')
		expect(api.stored.Courses.status).not.toBe('Completed')
	})
	it('uses a versioned definition for each supported operation', () => {
		expect(catalogue.pages['Community:queue'].article).toBe('moderacao')
		expect(catalogue.pages.DeskPrivacyImpact.audience).toBe('manager')
		expect(catalogue.pages.CourseImport.tour).toBe('course_import')
		expect(catalogue.tours.course_import[0].target).toBe(
			'[data-testid="course-import-fields"]'
		)
		expect(catalogue.exclusions.QuizPage).toContain('cronometrada')
	})
})
