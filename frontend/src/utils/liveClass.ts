import dayjs from '@/utils/dayjs'
import { REPORT_TIMEZONE } from '@/utils/period'
import { safeUrl } from '@/utils/safeUrl'

export interface LiveClassTiming {
	name?: string
	title?: string
	date: string
	time: string
	duration: number
	timezone?: string
	join_url?: string
}
export function liveClassTiming(cls: LiveClassTiming, now = new Date()) {
	try {
		const start = dayjs.tz(
			`${cls.date} ${cls.time}`,
			cls.timezone || window.timezone?.system || REPORT_TIMEZONE
		)
		const end = start.add(Number(cls.duration), 'minute')
		if (!start.isValid() || !end.isValid()) throw new Error('Invalid time')
		const local = start.tz(REPORT_TIMEZONE)
		return {
			start,
			end,
			date: local.format('DD/MM/YYYY'),
			startTime: local.format('HH:mm'),
			endTime: end.tz(REPORT_TIMEZONE).format('HH:mm'),
			ended: now.getTime() > end.valueOf(),
			canJoin:
				dayjs(now).tz(REPORT_TIMEZONE).format('YYYY-MM-DD') ===
					local.format('YYYY-MM-DD') && now.getTime() <= end.valueOf(),
		}
	} catch {
		return {
			start: null,
			end: null,
			date: '',
			startTime: '',
			endTime: '',
			ended: false,
			canJoin: false,
		}
	}
}
const escapeCalendar = (text: string) =>
	text
		.replace(/\\/g, '\\\\')
		.replace(/\r\n|\r|\n/g, '\\n')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
export function liveClassCalendar(cls: LiveClassTiming): string {
	const timing = liveClassTiming(cls)
	if (!timing.start || !timing.end) return ''
	const stamp = (value: typeof timing.start) =>
		value!.utc().format('YYYYMMDDTHHmmss[Z]')
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//LMS//Live Class//PT-BR',
		'BEGIN:VEVENT',
		`UID:${encodeURIComponent(
			cls.name || `${cls.date}-${cls.time}`
		)}@lms.local`,
		`DTSTAMP:${stamp(dayjs())}`,
		`DTSTART:${stamp(timing.start)}`,
		`DTEND:${stamp(timing.end)}`,
		`SUMMARY:${escapeCalendar(cls.title || __('Aula ao vivo'))}`,
		`URL:${escapeCalendar(safeUrl(cls.join_url || '') || '')}`,
		'END:VEVENT',
		'END:VCALENDAR',
		'',
	].join('\r\n')
}
