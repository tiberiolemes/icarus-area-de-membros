import { expect, it, vi } from 'vitest'
import { getFormattedDateRange } from '@/utils'

vi.hoisted(() => {
	window.matchMedia ??= (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
})

it('uses day/month/year for absolute date ranges and preserves explicit formats', () => {
	expect(getFormattedDateRange('2026-11-28', '2026-12-05')).toBe('28/11/2026 - 05/12/2026')
	expect(getFormattedDateRange('2026-11-28', '2026-11-28')).toBe('28/11/2026')
	expect(getFormattedDateRange('2026-11-28', '2026-12-05', 'YYYY-MM-DD')).toBe('2026-11-28 - 2026-12-05')
})

it('uses the Brazilian fallback while honoring the native site date setting', async () => {
 const { getDateFormat } = await import('@/utils/format')
 delete (window as any).date_format
 expect(getDateFormat()).toBe('DD/MM/YYYY')
 ;(window as any).date_format = 'yyyy-mm-dd'
 expect(getDateFormat()).toBe('YYYY-MM-DD')
 delete (window as any).date_format
})
