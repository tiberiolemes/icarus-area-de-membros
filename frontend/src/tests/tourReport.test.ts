import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import HelpUsage from '@/pages/HelpUsage.vue'

const api = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({
	call: api.call,
	Button: {
		props: ['disabled'],
		template: '<button :disabled="disabled"><slot /></button>',
	},
	FormControl: { template: '<select aria-label="Página"></select>' },
}))
vi.mock('@/components/LoadError.vue', () => ({
	default: { template: '<p role="alert">Acesso ou leitura indisponível</p>' },
}))
enableAutoUnmount(afterEach)
beforeEach(() => api.call.mockReset())
const payload = {
	site: 'synthetic-site',
	revision: 'quality07',
	summary: { participations: 4, completed: 2, skipped: 1, rated: 0, useful: 0 },
	rows: [
		{
			member: 'qc07@example.test',
			page: 'Courses',
			status: 'Completed',
			started_count: 1,
			completed_count: 1,
			skipped_count: 0,
			helpful: '',
		},
	],
}

function render() {
	const user = reactive({ data: { name: 'admin' } })
	return {
		user,
		wrapper: mount(HelpUsage, {
			global: {
				provide: { $user: user },
				mocks: { __: (text: string) => text },
			},
		}),
	}
}
describe('authorized native tour report presentation', () => {
	it('shows real numerators and denominators, and no percentage for absent feedback', async () => {
		api.call.mockResolvedValue(payload)
		const { wrapper } = render()
		await flushPromises()
		expect(wrapper.text()).toContain('50,00%')
		expect(wrapper.text()).toContain('Sem base')
		expect(wrapper.text()).toContain('2/4')
		expect(wrapper.text()).toContain('Sem resposta')
		expect(wrapper.text()).toContain('synthetic-site')
	})
	it("does not show another identity's late result after impersonation changes", async () => {
		let resolve!: (value: any) => void
		api.call
			.mockImplementationOnce(
				() =>
					new Promise((done) => {
						resolve = done
					})
			)
			.mockRejectedValueOnce(new Error('denied'))
		const { wrapper, user } = render()
		user.data.name = 'ordinary-student'
		await flushPromises()
		resolve(payload)
		await flushPromises()
		expect(wrapper.text()).not.toContain('qc07@example.test')
		expect(wrapper.find('[role="alert"]').exists()).toBe(true)
	})
})
