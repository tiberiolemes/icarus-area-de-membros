import { uiLocale } from '@/utils/locale'

export const formatDecimal = (value: number): string =>
	Number.isFinite(value)
		? value.toLocaleString(uiLocale(), {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
		  })
		: '—'

export const formatPercent = (value: number): string =>
	Number.isFinite(value) ? `${formatDecimal(value)}%` : '—'
