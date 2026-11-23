import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import JobCard from '@/components/JobCard.vue'
import { translate } from '@/translationMessages'

vi.mock('frappe-ui', () => ({ Badge: { template: '<span><slot /></span>' } }))
vi.mock('@/utils/dayjs', () => ({ serverTime: () => ({ fromNow: () => 'há 1 minuto' }) }))
afterEach(() => { delete (window as any).lang })

it('localizes vacancy metadata while preserving its API values', () => {
	;(window as any).lang = 'pt-BR'
	const job = { company_name: 'Organização sintética', job_title: 'Teste', location: 'Local', country: 'Brazil', type: 'Contract', work_mode: 'Remote' }
	const before = JSON.stringify(job)
	const wrapper = mount(JobCard, { props: { job }, global: { mocks: { __: translate } } })
	expect(wrapper.text()).toContain('Brasil')
	expect(wrapper.text()).toContain('Contrato')
	expect(wrapper.text()).toContain('Remoto')
	expect(wrapper.text()).not.toMatch(/Brazil|Contract|Remote/)
	expect(JSON.stringify(job)).toBe(before)
	wrapper.unmount()
})
