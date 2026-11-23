import { describe, expect, it } from 'vitest'
import { countryLabel } from '@/utils/countryNames'
import { nativeCategoryLabel } from '@/utils/locale'

describe('native country labels', () => {
	it('localizes only the shipped category labels and preserves authored names', () => {
		expect(nativeCategoryLabel('Business')).toBe('Negócios')
		expect(nativeCategoryLabel('Personal Development')).toBe('Desenvolvimento pessoal')
		expect(nativeCategoryLabel('Categoria autoral de teste')).toBe('Categoria autoral de teste')
	})
	it('uses Brazilian Portuguese region names without changing canonical data', () => {
		expect(countryLabel('Brazil')).toBe('Brasil')
		expect(countryLabel('Germany')).toBe('Alemanha')
		expect(countryLabel('United States')).toBe('Estados Unidos')
	})
	it('preserves authored or unknown names and ignores prototype properties', () => {
		expect(countryLabel('País de teste autoral')).toBe('País de teste autoral')
		expect(countryLabel('__proto__')).toBe('__proto__')
		expect(countryLabel('toString')).toBe('toString')
	})
})
