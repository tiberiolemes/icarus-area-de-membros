import countryCodes from '../../../local/i18n/country-codes.json'

// Localize native country metadata; preserve canonical IDs and authored names.
const regions = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
export const countryLabel = (name) =>
	Object.hasOwn(countryCodes, name) ? regions.of(countryCodes[name]) : name
