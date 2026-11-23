import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, reactive, ref, markRaw } from 'vue'
import messages from '../../../local/i18n/lms-pt-BR.json'
import integrationMessages from '../../../local/i18n/integration08-pt-BR.json'

const state = vi.hoisted(() => ({ value: null as any }))
vi.mock('@framework/ui/components/Onboarding/onboarding', () => ({
	useOnboarding: () => state.value,
}))
vi.mock('@framework/ui/components/Onboarding/helpCenter', () => ({
	showHelpCenter: ref(false),
}))
vi.mock('@framework/ui/components/Onboarding/help', () => ({
	minimize: ref(false),
	showHelpModal: ref(false),
}))
vi.mock('frappe-ui', () => ({
	Button: {
		props: ['label'],
		template: '<button type="button"><slot />{{ label }}</button>',
	},
	Badge: { template: '<span />' },
	Tooltip: { template: '<span><slot /></span>' },
	Dropdown: { template: '<span><slot /></span>' },
}))
vi.mock('frappe-ui/icons', () =>
	Object.fromEntries(
		['StepsIcon', 'HelpIcon', 'MaximizeIcon', 'MinimizeIcon'].map((name) => [
			name,
			{ template: '<svg />' },
		])
	)
)
vi.mock('@framework/ui/components/Onboarding/HelpCenter.vue', () => ({
	default: { template: '<div>Artigos</div>' },
}))
import Steps from '@framework/ui/components/Onboarding/OnboardingSteps.vue'
import Banner from '@framework/ui/components/Onboarding/GettingStartedBanner.vue'
import HelpModal from '@framework/ui/components/Onboarding/HelpModal.vue'
import {
	minimize,
	showHelpModal,
} from '@framework/ui/components/Onboarding/help'
import { showHelpCenter } from '@framework/ui/components/Onboarding/helpCenter'

const wrappers: any[] = []
beforeEach(() => {
	minimize.value = false
	showHelpModal.value = false
	showHelpCenter.value = false
	const catalog = { ...messages, ...integrationMessages } as Record<
		string,
		string
	>
	vi.stubGlobal('__', (text: string, args: any[] = []) =>
		(catalog[text] || text).replace(/\{(\d+)\}/g, (match, index) =>
			String(args[Number(index)] ?? match)
		)
	)
	const steps = reactive([
		{
			name: 'course',
			title: 'Criar curso',
			completed: false,
			onClick: vi.fn(),
		},
		{
			name: 'lesson',
			title: 'Criar aula',
			completed: false,
			dependsOn: 'course',
			onClick: vi.fn(),
		},
		{
			name: 'done',
			title: 'Configurar perfil',
			completed: true,
			onClick: vi.fn(),
		},
	])
	state.value = {
		steps,
		totalSteps: ref(3),
		stepsCompleted: computed(() => steps.filter((s) => s.completed).length),
		completedPercentage: ref(33),
		isOnboardingStepsCompleted: ref(false),
		skip: vi.fn((name: string) => {
			steps.find((s) => s.name === name)!.completed = true
		}),
		reset: vi.fn((name: string) => {
			steps.find((s) => s.name === name)!.completed = false
		}),
		skipAll: vi.fn(),
		resetAll: vi.fn(),
		syncStatus: vi.fn(),
	}
})
afterEach(() => {
	wrappers.splice(0).forEach((w) => w.unmount())
	document.body.innerHTML = ''
})
const open = (component: any) => {
	const w = mount(component, {
		props:
			component === Steps ? { logo: markRaw({ template: '<svg />' }) } : {},
		attachTo: document.body,
	})
	wrappers.push(w)
	return w
}
const button = (w: any, text: string) =>
	w.findAll('button').find((b: any) => b.text() === text)

describe('native onboarding actions', () => {
	it('provides a native primary button and sibling skip without an accidental primary action', async () => {
		const w = open(Steps)
		const primary = button(w, 'Criar curso')
		expect(primary?.element.tagName).toBe('BUTTON')
		expect(primary?.attributes('disabled')).toBeUndefined()
		await primary!.trigger('click')
		expect(state.value.steps[0].onClick).toHaveBeenCalledTimes(1)
		const skip = button(w, 'Pular')
		expect(skip!.classes().join(' ')).not.toContain('hidden')
		expect(
			skip!.element.closest('button')!.parentElement!.closest('button')
		).toBeNull()
		await skip!.trigger('click')
		expect(state.value.skip).toHaveBeenCalledWith('course', undefined)
		expect(state.value.steps[0].onClick).toHaveBeenCalledTimes(1)
		await flushPromises()
		expect(document.activeElement?.textContent).toContain('Redefinir')
	})
	it('keeps completed and dependent steps out of the action order and exposes their state', async () => {
		const w = open(Steps)
		for (const title of ['Criar aula', 'Configurar perfil']) {
			const action = button(w, title)
			expect(action?.attributes('disabled')).toBeDefined()
			await action!.trigger('click')
		}
		expect(state.value.steps[1].onClick).not.toHaveBeenCalled()
		expect(state.value.steps[2].onClick).not.toHaveBeenCalled()
		expect(w.text()).toContain('Você precisa concluir')
		expect(w.text()).toContain('Concluído')
	})
	it('resets a completed step without launching its primary action and keeps focus on its next control', async () => {
		const w = open(Steps)
		await button(w, 'Redefinir')!.trigger('click')
		expect(state.value.reset).toHaveBeenCalledWith('done', undefined)
		expect(state.value.steps[2].onClick).not.toHaveBeenCalled()
		await flushPromises()
		expect(document.activeElement?.textContent).toContain('Configurar perfil')
	})
	it('uses a named native button to dismiss the completed banner', async () => {
		state.value.steps.forEach((s: any) => {
			s.completed = true
		})
		const w = open(Banner)
		const close = w.find('button[aria-label="Fechar"]')
		expect(close.exists()).toBe(true)
		expect(w.find('svg[class*="cursor-pointer"]').exists()).toBe(false)
		await close.trigger('click')
		expect(state.value.isOnboardingStepsCompleted.value).toBe(true)
		expect(state.value.steps.every((s: any) => s.completed)).toBe(true)
	})
	it('opens the help panel from the native banner action', async () => {
		const w = open(Banner)
		await button(w, 'Continuar')!.trigger('click')
		expect(showHelpModal.value).toBe(true)
		expect(minimize.value).toBe(false)
	})
	it('focuses panel actions, hides minimized controls, and returns focus when closed', async () => {
		const opener = document.createElement('button')
		document.body.appendChild(opener)
		opener.focus()
		const w = mount(HelpModal, {
			props: { modelValue: true, logo: markRaw({ template: '<svg />' }) },
			attachTo: document.body,
		})
		wrappers.push(w)
		await flushPromises()
		expect(document.activeElement?.getAttribute('aria-label')).toBe('Minimizar')
		await w.find('button[aria-label="Minimizar"]').trigger('click')
		expect(minimize.value).toBe(true)
		expect(w.find('[data-onboarding-step]').isVisible()).toBe(false)
		const close = w.find('button[aria-label="Fechar"]')
		close.element.focus()
		await close.trigger('click')
		expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
		w.unmount()
		wrappers.pop()
		expect(document.activeElement).toBe(opener)
	})
	it('does not steal focus while the panel is hidden', async () => {
		const opener = document.createElement('button')
		document.body.appendChild(opener)
		opener.focus()
		const w = mount(HelpModal, {
			props: { modelValue: false, logo: markRaw({ template: '<svg />' }) },
			attachTo: document.body,
		})
		wrappers.push(w)
		await flushPromises()
		expect(document.activeElement).toBe(opener)
		await w.setProps({ modelValue: true })
		await flushPromises()
		expect(document.activeElement?.getAttribute('aria-label')).toBe('Minimizar')
		await w.setProps({ modelValue: false })
		await flushPromises()
		expect(document.activeElement).toBe(opener)
	})
})
