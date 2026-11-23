import { describe, expect, it } from 'vitest'
import { videoSourceIdentity } from '@/utils/videoSource'

describe('native video position identity', () => {
	const origin = 'http://quality08.localhost:8090'
	const path = '/private/files/aula.mp4'
	const bridge =
		'/api/method/lms.lms.doctype.course_lesson.course_lesson.serve_resource'
	it('stores the canonical file URL rather than a long access-gated playback URL', () => {
		expect(
			videoSourceIdentity(
				`${origin}${bridge}?file_url=${encodeURIComponent(path)}`,
				origin
			)
		).toBe(path)
		expect(
			videoSourceIdentity(
				`${bridge}?file_url=${encodeURIComponent(path)}`,
				origin
			)
		).toBe(path)
	})
	it('preserves legacy, external and ambiguous source identities', () => {
		for (const source of [
			path,
			'https://video.example.test/watch?v=abc',
			`${bridge}?file_url=${path}&file_url=/files/other.mp4`,
			`https://other.test${bridge}?file_url=${path}`,
			`${bridge}?file_url=https://other.test/film.mp4`,
		])
			expect(videoSourceIdentity(source, origin)).toBe(source)
	})
	it('matches native providers without keeping temporary query signatures', () => {
		expect(
			videoSourceIdentity('https://youtu.be/Qc08Video01?t=3', origin)
		).toBe('https://www.youtube.com/watch?v=Qc08Video01')
		expect(
			videoSourceIdentity(
				'https://player.vimeo.com/video/123456789?h=secret',
				origin
			)
		).toBe('https://vimeo.com/123456789')
		expect(
			videoSourceIdentity(
				'https://player.mediadelivery.net/embed/123/abc-def?token=secret',
				origin
			)
		).toBe('https://iframe.mediadelivery.net/embed/123/abc-def')
	})
	it('uses only server-declared opaque bindings for other remote videos', () => {
		const raw = 'https://video.example.test/%C3%81ula.mp4?signature=private'
		const identity = 'external:' + 'a'.repeat(64)
		expect(videoSourceIdentity(raw + '#t=3', origin, { [raw]: identity })).toBe(
			identity
		)
		expect(
			videoSourceIdentity(raw.replace('private', 'other'), origin, {
				[raw]: identity,
			})
		).not.toBe(identity)
	})
})
