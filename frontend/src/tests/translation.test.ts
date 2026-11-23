import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ createResource: vi.fn() }))

describe('__', () => {
	afterEach(() => {
		delete (window as any).lang
		document.documentElement.lang = ''
	})

	it('uses pt-BR immediately, preserving positional and named placeholders', async () => {
		const { translate } = await import('@/translationMessages')
		;(window as any).lang = 'pt_BR'
		;(window as any).translatedMessages = { Courses: 'Courses' }
		expect(translate('Courses')).toBe('Cursos')
		expect(translate('{0} replies', [0])).toBe('0 respostas')
		expect(translate('{0} replies').format(2)).toBe('2 respostas')
		expect(translate('Player for {title}')).toBe('Reprodutor de {title}')
		expect(translate('Unknown {0}', [])).toBe('Unknown {0}')
		expect(translate('constructor')).toBe('constructor')
	})
	it('fills values passed the Desk way, as Frappe UI components do', async () => {
		const { default: translationPlugin } = await import('@/translation.js')
		;(window as any).translatedMessages = { 'Row {0}': 'Zeile {0}' }
		translationPlugin({ config: { globalProperties: {} } })
		const __ = (window as any).__

		expect(__('All ({0})', [3])).toBe('All (3)')
		expect(__('Row {0}', [7])).toBe('Zeile 7')
		// The LMS way keeps working.
		expect(__('Row {0}').format(7)).toBe('Zeile 7')
		expect(__('Import')).toBe('Import')
	})

	it('gives the Frappe Cloud panel text, not an object, for a message with a value', async () => {
		const { default: translationPlugin } = await import('@/translation.js')
		translationPlugin({ config: { globalProperties: {} } })
		const { translate } = await import('@/composables/cloudSettings')

		const message = translate('Your trial ends in {0} days', [5])
		expect(typeof message).toBe('string')
		expect(message).toBe('Your trial ends in 5 days')
	})
})
