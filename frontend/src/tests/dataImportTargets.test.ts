import { afterEach, describe, expect, it, vi } from 'vitest'
import { translate } from '@/translationMessages'

vi.stubGlobal('__', (text: string) => text)

const { openSettings } = vi.hoisted(() => ({ openSettings: vi.fn() }))
vi.mock('@/utils', () => ({ openSettings }))

import { importTarget, importTitle } from '@/utils/dataImport'

afterEach(() => { delete (window as any).lang; delete (window as any).translatedMessages; vi.stubGlobal('__', (text: string) => text) })

describe('data import targets', () => {
	it('translates known native names without changing the doctype or granting new targets', () => {
		;(window as any).lang = 'pt-BR'
		;(window as any).translatedMessages = { 'LMS Enrollment': 'Matrícula da plataforma' }
		vi.stubGlobal('__', translate)
		expect(importTitle('LMS Enrollment')).toBe('Matrícula da plataforma')
		expect(importTarget('LMS Enrollment')).toBeUndefined()
		expect(importTitle('Identificador autoral')).toBe('Identificador autoral')
		delete (window as any).lang
		vi.stubGlobal('__', (text: string) => text)
	})
	const router = { push: vi.fn() } as any

	it('names LMS doctypes the way the app does, and others as they are', () => {
		expect(importTitle('LMS Course')).toBe('Courses')
		expect(importTitle('LMS Category')).toBe('Categories')
		expect(importTitle('ToDo')).toBe('ToDo')
	})

	it('leads back to the course and batch pages', () => {
		importTarget('LMS Course')!.openRecord!(router, 'intro-course')
		expect(router.push).toHaveBeenCalledWith({
			name: 'CourseDetail',
			params: { courseName: 'intro-course' },
		})
		importTarget('LMS Batch')!.openList(router)
		expect(router.push).toHaveBeenCalledWith({ name: 'Batches' })
	})

	it('opens categories in Settings, where they are managed', () => {
		importTarget('LMS Category')!.openList(router)
		expect(openSettings).toHaveBeenCalledWith('categories')
		expect(importTarget('LMS Category')!.openRecord).toBeUndefined()
		// Phones have no Settings, so the wizard hides this link there.
		expect(importTarget('LMS Category')!.listInSettings).toBe(true)
		expect(importTarget('LMS Course')!.listInSettings).toBeFalsy()
		expect(importTarget('ToDo')).toBeUndefined()
	})
})
