import { afterEach, expect, it } from 'vitest'
import { formatNumber, formatNumberIntoCurrency } from '@/utils/locale'
import { translate } from '@/translationMessages'
afterEach(() => { delete (window as any).lang })
it('formats fractional scores and percentages in pt-BR without rounding the integer counter API differently', () => {
 ;(window as any).lang = 'pt-BR'
 const percentage=66.67, score=0.5
 expect(formatNumber(percentage,2)).toBe('66,67')
 expect(formatNumber(score,2)).toBe('0,5')
 expect(formatNumber(undefined,2)).toBe('')
 expect(formatNumber(null,2)).toBe('')
 expect(formatNumber(1234)).toBe('1.234')
 expect(percentage).toBe(66.67)
 expect(score).toBe(0.5)
 expect(translate('{0} of {1} marks').format(formatNumber(score,2),formatNumber(1,2))).toBe('Pontuação: 0,5/1')
})
it('preserves BRL cents, zero, and the native currency minor-unit rules', () => {
 ;(window as any).lang = 'pt-BR'
 const amount=1234.56
 expect(formatNumberIntoCurrency(amount,'BRL').replace(/\u00a0/g,' ')).toBe('R$ 1.234,56')
 expect(formatNumberIntoCurrency(0,'BRL').replace(/\u00a0/g,' ')).toBe('R$ 0,00')
 expect(formatNumberIntoCurrency(1234,'JPY')).not.toMatch(/[,.]00$/)
 expect(formatNumberIntoCurrency(null,'BRL')).toBe('')
 expect(amount).toBe(1234.56)
})
