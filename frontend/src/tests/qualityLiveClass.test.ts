import { describe, expect, it } from 'vitest'
import { liveClassCalendar, liveClassTiming } from '@/utils/liveClass'
describe('live class time zones', () => {
	it('shows the Brazilian day and end across midnight independently of the browser zone', () => {
		const cls = {
			name: 'lesson',
			date: '2026-11-22',
			time: '01:30:00',
			timezone: 'UTC',
			duration: 90,
		}
		const timing = liveClassTiming(cls, new Date('2026-11-22T02:00:00Z'))
		expect(timing).toMatchObject({
			date: '21/11/2026',
			startTime: '22:30',
			endTime: '00:00',
			canJoin: true,
			ended: false,
		})
		expect(liveClassTiming(cls, new Date('2026-11-22T04:00:00Z')).ended).toBe(
			true
		)
	})
	it('exports UTC instants and escapes title lines without exposing a host start URL', () => {
		const calendar = liveClassCalendar({
			name: 'lesson',
			title: 'Aula; IA\nTeste',
			date: '2026-11-21',
			time: '20:00:00',
			timezone: 'America/Sao_Paulo',
			duration: 60,
			join_url: 'https://example.test/join',
		})
		expect(calendar).toContain('DTSTART:20261121T230000Z')
		expect(calendar).toContain('DTEND:20261122T000000Z')
		expect(calendar).toContain('SUMMARY:Aula\\; IA\\nTeste')
		expect(calendar).not.toContain('start_url')
	})
	it('disables an invalid timezone instead of using the browser clock', () => {
		expect(
			liveClassTiming({
				date: '2026-11-21',
				time: '10:00',
				duration: 10,
				timezone: 'invalid/zone',
			}).canJoin
		).toBe(false)
	})
})
