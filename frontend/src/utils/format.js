import { useTimeAgo } from '@vueuse/core'
import { serverTime } from '@/utils/dayjs'
import { isPortuguese } from '@/translationMessages'

export function timeAgo(date) {
	const messages = isPortuguese()
		? {
				justNow: 'agora',
				past: (value) => `há ${value}`,
				future: (value) => `em ${value}`,
				second: (n) => `${n} ${n === 1 ? 'segundo' : 'segundos'}`,
				minute: (n) => `${n} ${n === 1 ? 'minuto' : 'minutos'}`,
				hour: (n) => `${n} ${n === 1 ? 'hora' : 'horas'}`,
				day: (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`,
				week: (n) => `${n} ${n === 1 ? 'semana' : 'semanas'}`,
				month: (n) => `${n} ${n === 1 ? 'mês' : 'meses'}`,
				year: (n) => `${n} ${n === 1 ? 'ano' : 'anos'}`,
				invalid: 'Data inválida',
		  }
		: undefined
	return useTimeAgo(serverTime(date).toDate(), { messages }).value
}

// Map the site's System Settings date_format (boot data) to dayjs tokens.
const DATE_TOKENS = { yyyy: 'YYYY', yy: 'YY', mmm: 'MMM', mm: 'MM', dd: 'DD' }
export function getDateFormat() {
	const fmt = window.date_format || 'dd/mm/yyyy'
	return fmt.replace(/yyyy|yy|mmm|mm|dd/g, (t) => DATE_TOKENS[t])
}

export const formatSeconds = (time) => {
	const minutes = Math.floor(time / 60)
	const seconds = Math.floor(time % 60)
	return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
}

// Single source of truth; decoders derive their inverse from this map.
export const HTML_ESCAPE_MAP = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
	'`': '&#x60;',
	'=': '&#x3D;',
}

export const escapeHTML = (text) => {
	if (!text) return ''
	return String(text).replace(/[&<>"'`=]/g, (char) => HTML_ESCAPE_MAP[char])
}

export const formatTimestamp = (seconds) => {
	const date = new Date(seconds * 1000)
	const hours = String(date.getUTCHours()).padStart(2, '0')
	const minutes = String(date.getUTCMinutes()).padStart(2, '0')
	const secs = String(date.getUTCSeconds()).padStart(2, '0')
	return hours > 0 ? `${hours}:${minutes}:${secs}` : `${minutes}:${secs}`
}
