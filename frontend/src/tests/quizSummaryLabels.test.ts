import { describe, expect, it } from 'vitest'
import { attemptsAllowedLabel, attemptsLeftLabel } from '@/utils/quizSummary'

describe('whole attempt labels', () => {
	it('provides complete singular and plural messages rather than a fixed plural adjective', () => {
		expect(attemptsLeftLabel(1)).toBe('1 attempt left')
		expect(attemptsLeftLabel(0)).toBe('0 attempts left')
		expect(attemptsLeftLabel(2)).toBe('2 attempts left')
		expect(attemptsAllowedLabel(1)).toBe('1 attempt allowed')
		expect(attemptsAllowedLabel(3)).toBe('3 attempts allowed')
	})
	it('keeps the Portuguese adjective in agreement with the attempt count', () => {
		const previous = globalThis.__
		globalThis.__ = ((message: string) => {
			if (message === '1 attempt left') return '1 tentativa restante'
			if (message === '{0} attempts left')
				return { format: (count: number) => `${count} tentativas restantes` }
			return previous(message)
		}) as typeof globalThis.__
		try {
			expect(attemptsLeftLabel(1)).toBe('1 tentativa restante')
			expect(attemptsLeftLabel(2)).toBe('2 tentativas restantes')
		} finally {
			globalThis.__ = previous
		}
	})
})
