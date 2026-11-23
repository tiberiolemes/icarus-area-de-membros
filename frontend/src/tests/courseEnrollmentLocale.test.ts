import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CourseCard from '@/components/CourseCard.vue'
import { translate } from '@/translationMessages'

vi.mock('@/stores/session', () => ({ sessionStore: () => ({ user: null }) }))
vi.mock('@/utils', () => ({ formatAmount: String, formatRating: String }))
vi.mock('frappe-ui', () => ({ Tooltip: { template: '<span><slot /></span>' } }))

afterEach(() => { delete (window as any).lang; vi.unstubAllGlobals() })

describe('accessible enrollment counts in Portuguese', () => {
	it.each([[1, '1 matriculado'], [2, '2 matriculados']])('uses the right form for %s', (count, expected) => {
		;(window as any).lang = 'pt-BR'
		vi.stubGlobal('__', translate)
		const wrapper = mount(CourseCard, { props: { course: { title: 'Curso sintético', lessons: 1, enrollments: count, instructors: [] } },
			global: { mocks: { __: translate }, stubs: { CardLink: { template: '<a><slot /></a>' }, CourseInstructors: true, UserAvatar: true, ProgressBar: true } } })
		expect(wrapper.findAll('.sr-only').map(node => node.text())).toContain(expected)
		wrapper.unmount()
	})
})
