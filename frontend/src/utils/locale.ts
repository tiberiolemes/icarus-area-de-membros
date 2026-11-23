import nativeCategories from '../../../local/i18n/native-categories-pt-BR.json'

// Display labels for upstream's initial metadata; never rename linked records.
export const nativeCategoryLabel = (name: string): string =>
	Object.hasOwn(nativeCategories, name) ? nativeCategories[name as keyof typeof nativeCategories] : name

export function uiLocale(): string {
	try {
		return Intl.getCanonicalLocales(
			(
				(window as Window & { lang?: string }).lang ||
				document.documentElement.lang ||
				'pt-BR'
			).replace('_', '-')
		)[0]
	} catch {
		return 'pt-BR'
	}
}

// Display only: stored numeric values and billing/grade calculations stay numeric.
export function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
 if (value == null) return '' // Match Vue's empty display while numeric data is loading.
 return value.toLocaleString(uiLocale(), { maximumFractionDigits })
}
export function formatNumberIntoCurrency(value: number | null | undefined, currency: string): string {
 return value || value === 0 ? value.toLocaleString(uiLocale(), { style: 'currency', currency }) : ''
}
