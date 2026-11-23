import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { translate } from '@/translationMessages'
import JobApplications from '@/pages/JobApplications.vue'
import UnsplashImageBrowser from '@/components/UnsplashImageBrowser.vue'
import { loadLiveCode } from '@/pages/ProgrammingExercises/liveCode'

const state = vi.hoisted(() => ({ rows: [] as any[], meta: null as any, uploading: false }))
vi.mock('@/stores/session', () => ({ sessionStore: () => ({ brand: { favicon: '/local.svg' } }) }))
vi.mock('@/utils/resource', () => ({ submitResource: vi.fn() }))
vi.mock('@/components/Layouts/ListPage.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/RichTextEditor.vue', () => ({ default: { template: '<div />' } }))
vi.mock('frappe-ui/experimental', () => ({ InputLabel: { template: '<label />' } }))
vi.mock('frappe-ui', () => ({
	createListResource: () => ({ data: state.rows, list: {}, reload: vi.fn() }),
	createResource: () => ({ data: [], reload: vi.fn(), submit: vi.fn() }),
	usePageMeta: (fn: any) => { state.meta = fn },
	toast: {}, Avatar: { template: '<span />' }, Dialog: { template: '<div />' },
	Dropdown: { template: '<div />' }, FormControl: { template: '<input />' },
	Button: { template: '<button><slot /></button>' }, TextInput: { template: '<input />' },
	Popover: { template: '<div><slot /></div>' },
	FileUploader: { setup: () => ({ state }), template: '<div><slot :uploading="state.uploading" :progress="37" :openFileSelector="() => {}" /></div>' },
}))

afterEach(() => { delete (window as any).lang; vi.unstubAllGlobals(); state.rows = []; state.uploading = false })
function pt() { (window as any).lang = 'pt-BR'; vi.stubGlobal('__', translate) }

it('gives empty applications a translated title without undefined and preserves an authored job title', () => {
	pt()
	let wrapper = mount(JobApplications, { props: { job: 'synthetic' }, global: { provide: { $dayjs: () => ({ format: () => '21/11/2026' }) }, mocks: { __: translate } } })
	expect(state.meta().title).toBe('Candidaturas')
	wrapper.unmount()
	state.rows = [{ job_title: 'Vaga sintética' }]
	wrapper = mount(JobApplications, { props: { job: 'synthetic' }, global: { provide: { $dayjs: () => ({ format: () => '21/11/2026' }) }, mocks: { __: translate } } })
	expect(state.meta().title).toBe('Candidaturas — Vaga sintética')
	wrapper.unmount()
})

it.each([[false, 'Carregar imagem'], [true, 'Enviando 37%']])('translates uploader state %s', (uploading, expected) => {
	pt(); state.uploading = uploading
	const wrapper = mount(UnsplashImageBrowser, { global: { mocks: { __: translate }, directives: { external: {} } } })
	expect(wrapper.text()).toContain(expected)
	wrapper.unmount()
})

it('translates runner load errors, retaining the URL and allowing retry', async () => {
	pt()
	const src = '/assets/synthetic-runner-failure.js'
	const first = loadLiveCode(src)
	const assertion = expect(first).rejects.toThrow('Não foi possível carregar ' + src)
	document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)!.dispatchEvent(new Event('error'))
	await assertion
	const retry = loadLiveCode(src)
	document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)!.dispatchEvent(new Event('load'))
	await expect(retry).resolves.toBeUndefined()
	document.querySelector(`script[src="${src}"]`)?.remove()
})
