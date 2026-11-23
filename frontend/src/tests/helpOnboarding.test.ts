import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import FirstResultGuide from '@/components/FirstResultGuide.vue'
import ContextHelp from '@/components/ContextHelp.vue'
import { helpArticle } from '@/utils/help'

const route = reactive({ name: 'Community' })
vi.mock('vue-router', () => ({ useRoute: () => route }))
vi.mock('frappe-ui', () => ({
	Button: {
		name: 'Button',
		props: ['route'],
		template: '<button><slot /></button>',
	},
}))
enableAutoUnmount(afterEach)
beforeEach(() => sessionStorage.clear())

function guide(user = 'alice', creator = false) {
	return mount(FirstResultGuide, {
		props: { user, creator },
		global: { mocks: { __: (s: string) => s } },
	})
}

describe('first real result without replacing native onboarding', () => {
	it('gives the learner a real course destination and a public help alternative', () => {
		const wrapper = guide()
		expect(wrapper.text()).toContain(
			'Conclua a atividade e confira seu progresso'
		)
		expect(wrapper.getComponent({ name: 'Button' }).props('route')).toEqual({
			name: 'Courses',
		})
		expect(wrapper.get('a').attributes('href')).toBe('/help#aluno')
	})
	it('distinguishes synthetic material and starts the actual creator route', () => {
		const wrapper = guide('creator', true)
		expect(wrapper.text()).toContain('demonstração é sintético')
		expect(wrapper.getComponent({ name: 'Button' }).props('route')).toEqual({
			name: 'NewCourse',
		})
		expect(wrapper.get('a').attributes('href')).toBe('/help#criador')
	})
	it('dismisses without claiming completion and scopes dismissal to user and role', async () => {
		const wrapper = guide()
		await wrapper.get('button:last-child').trigger('click')
		expect(wrapper.find('section').exists()).toBe(false)
		expect(guide().find('section').exists()).toBe(false)
		await wrapper.setProps({ user: 'bob' })
		expect(wrapper.find('section').exists()).toBe(true)
		await wrapper.setProps({ user: 'alice', creator: true })
		expect(wrapper.find('section').exists()).toBe(true)
	})
	it('works when browser storage is unavailable', async () => {
		const read = vi
			.spyOn(Storage.prototype, 'getItem')
			.mockImplementation(() => {
				throw new Error('blocked')
			})
		const write = vi
			.spyOn(Storage.prototype, 'setItem')
			.mockImplementation(() => {
				throw new Error('blocked')
			})
		try {
			const wrapper = guide()
			await wrapper.get('button:last-child').trigger('click')
			expect(wrapper.find('section').exists()).toBe(false)
		} finally {
			read.mockRestore()
			write.mockRestore()
		}
	})
})

describe('contextual public help', () => {
	it('maps authoring and learning separately and never reflects a route into a URL', () => {
		expect(helpArticle('CourseEditor')).toBe('criador')
		expect(helpArticle('CoursePublishSettings')).toBe('arquivo')
		expect(helpArticle('LessonForm')).toBe('arquivos')
		expect(helpArticle('Lesson')).toBe('aluno')
		expect(helpArticle('<script>alert(1)</script>')).toBe('recuperacao')
	})
	it('opens outside the SPA in another tab so reading help preserves an edit', async () => {
		const wrapper = mount(ContextHelp, {
			global: { mocks: { __: (s: string) => s } },
		})
		const link = wrapper.get('a')
		expect(link.attributes('href')).toBe('/help#comunidade')
		expect(link.attributes('target')).toBe('_blank')
		expect(link.attributes('rel')).toContain('noopener')
		await Object.assign(route, { name: 'ProfileEditForm' })
		await wrapper.vm.$nextTick()
		expect(link.attributes('href')).toBe('/help#perfil')
	})
})
