import type { AnalyticsWindow } from '@/types'

export const REPORT_TIMEZONE = 'America/Sao_Paulo'
export type PeriodPreset =
	| 'today'
	| 'yesterday'
	| '7d'
	| '14d'
	| '30d'
	| '90d'
	| 'month'
	| 'previous_month'
	| 'year'
	| 'all'
	| 'custom'

export function brazilDay(now = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: REPORT_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now)
	const part = (name: string) => parts.find((p) => p.type === name)!.value
	return `${part('year')}-${part('month')}-${part('day')}`
}

export function validDay(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
	const date = new Date(`${value}T12:00:00Z`)
	return (
		Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
	)
}

function shift(day: string, days: number): string {
	const date = new Date(`${day}T12:00:00Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

export function periodWindow(
	preset: PeriodPreset,
	custom: AnalyticsWindow = { from_date: null, to_date: null },
	now = new Date()
): AnalyticsWindow {
	const today = brazilDay(now)
	if (preset === 'all') return { from_date: null, to_date: null }
	if (preset === 'custom') return { ...custom }
	if (preset === 'yesterday')
		return { from_date: shift(today, -1), to_date: shift(today, -1) }
	if (preset === 'previous_month') {
		const last = shift(`${today.slice(0, 7)}-01`, -1)
		return { from_date: `${last.slice(0, 7)}-01`, to_date: last }
	}
	const from =
		preset === 'month'
			? `${today.slice(0, 7)}-01`
			: preset === 'year'
			? `${today.slice(0, 4)}-01-01`
			: preset === 'today'
			? today
			: shift(today, 1 - Number(preset.slice(0, -1)))
	return { from_date: from, to_date: today }
}

export function periodError(window: AnalyticsWindow, now = new Date()): string {
	if (window.from_date === null && window.to_date === null) return ''
	if (
		!window.from_date ||
		!window.to_date ||
		!validDay(window.from_date) ||
		!validDay(window.to_date)
	)
		return __('Informe as duas datas completas e válidas.')
	if (window.from_date > window.to_date)
		return __('A data inicial deve vir antes da data final.')
	if (window.to_date > brazilDay(now))
		return __('Relatórios realizados não incluem datas futuras.')
	return ''
}

export function periodLabel(window: AnalyticsWindow): string {
	const display = (day: string) => day.split('-').reverse().join('/')
	return window.from_date && window.to_date
		? `${display(window.from_date)} – ${display(window.to_date)}`
		: __('Todo o período')
}

export const periodOptions = () =>
	[
		['today', __('Hoje')],
		['yesterday', __('Ontem')],
		['7d', __('Últimos 7 dias')],
		['14d', __('Últimos 14 dias')],
		['30d', __('Últimos 30 dias')],
		['90d', __('Últimos 90 dias')],
		['month', __('Mês atual')],
		['previous_month', __('Mês passado')],
		['year', __('Ano atual')],
		['all', __('Todo o período')],
		['custom', __('Personalizado')],
	].map(([value, label]) => ({ value, label }))
