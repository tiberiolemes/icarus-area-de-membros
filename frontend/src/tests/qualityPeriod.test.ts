import { describe, expect, it, vi, afterEach } from 'vitest'
import { brazilDay, periodError, periodWindow, validDay } from '@/utils/period'
import {
	toCsv,
	timeFrameWindow,
	fetchAnalyticsPreview,
} from '@/utils/dashboard/export'
import { formatDecimal, formatPercent } from '@/utils/dashboard/number'
import {
	percentChange,
	pointChange,
	lessonShares,
} from '@/utils/dashboard/charts'

describe('Brasília report days', () => {
	const now = new Date('2026-03-01T01:30:00Z')
	it('uses the previous Brazilian day even on a browser in UTC', () => {
		expect(brazilDay(now)).toBe('2026-02-28')
		expect(periodWindow('month', undefined, now)).toEqual({
			from_date: '2026-02-01',
			to_date: '2026-02-28',
		})
	})
	it.each([
		['7d', '2026-02-22'],
		['14d', '2026-02-15'],
		['30d', '2026-01-30'],
		['90d', '2025-12-01'],
		['today', '2026-02-28'],
		['yesterday', '2026-02-27'],
		['year', '2026-01-01'],
	])('counts inclusive preset %s', (preset, expected) => {
		expect(periodWindow(preset as any, undefined, now).from_date).toBe(expected)
	})
	it('shares the same calculation with cohort exports', () => {
		expect(
			timeFrameWindow('7d', { from_date: null, to_date: null }, now)
		).toEqual(periodWindow('7d', undefined, now))
		expect(periodWindow('previous_month', undefined, now)).toEqual({
			from_date: '2026-01-01',
			to_date: '2026-01-31',
		})
	})
	it('rejects invalid, partial, reversed and future dates', () => {
		expect(validDay('2024-02-29')).toBe(true)
		for (const value of ['2026-02-29', '2026-02-31', '2026-2-2', '31/02/2026'])
			expect(validDay(value)).toBe(false)
		for (const window of [
			{ from_date: '2026-02-01', to_date: null },
			{ from_date: '2026-03-01', to_date: '2026-02-28' },
			{ from_date: '2026-02-28', to_date: '2026-03-01' },
		])
			expect(periodError(window, now)).not.toBe('')
		expect(periodError({ from_date: null, to_date: null }, now)).toBe('')
	})
})

describe('Brazilian CSV', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		history.replaceState({}, '', '/')
	})
	it('keeps applied server filters and sort in the complete export request', async () => {
		history.replaceState(
			{},
			'',
			'/?students_stage=finished&students_search=Ana&students_sort=progress&students_direction=asc&students_start=20'
		)
		const fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ message: { students: 30 } }),
		})
		vi.stubGlobal('fetch', fetch)
		await fetchAnalyticsPreview('course', 'course-a', 'csv', {
			from_date: '2026-11-01',
			to_date: '2026-11-21',
		})
		const params = new URL(fetch.mock.calls[0][0], location.origin).searchParams
		expect(Object.fromEntries(params)).toMatchObject({
			course: 'course-a',
			stage: 'finished',
			search: 'Ana',
			sort: 'progress',
			direction: 'asc',
			from_date: '2026-11-01',
			to_date: '2026-11-21',
		})
		expect(params.has('students_start')).toBe(false)
		expect(params.has('start')).toBe(false)
	})
	it('formats percentages in Brazilian notation without rounding the underlying calculation', () => {
		expect(formatPercent(12.5)).toBe('12,50%')
		expect(formatDecimal(100 / 3)).toBe('33,33')
		expect(formatPercent(0)).toBe('0,00%')
		expect(formatPercent(NaN)).toBe('—')
	})
	it('keeps precise rates until presentation and no ratio for an absent or zero baseline', () => {
		expect(percentChange({ current: 4, previous: 3 })).toBeCloseTo(100 / 3, 10)
		expect(percentChange({ current: 1, previous: 0 })).toBeNull()
		expect(percentChange({ current: 1, previous: null })).toBeNull()
		expect(percentChange({ current: 0, previous: 3 })).toBe(-100)
		expect(pointChange({ current: 12.55, previous: 12.12 })).toBeCloseTo(
			0.43,
			10
		)
		const shares = lessonShares(
			[
				{
					lesson_name: 'one',
					completion_count: 1,
					chapter_idx: 1,
					idx: 1,
					title: 'Aula',
				},
			] as any,
			3
		)
		expect(shares[0]?.share).toBeCloseTo(100 / 3, 10)
	})
	it('keeps actual numeric values as Brazilian decimals, including negatives', () => {
		expect(toCsv([[1.5, -2.75, 1000]])).toBe('1,5;-2,75;1000')
	})
	it('quotes semicolons, preserves lines and neutralizes formulas including leading spaces', () => {
		expect(
			toCsv([
				['Nome', 'Progresso'],
				['Tibério; IA', '10,5%'],
				[' =1+1', '@SUM(A1)'],
				['"texto"\nlinha', null],
			])
		).toBe(
			'Nome;Progresso\r\n"Tibério; IA";10,5%\r\n\' =1+1;\'@SUM(A1)\r\n"""texto""\nlinha";'
		)
	})
})
