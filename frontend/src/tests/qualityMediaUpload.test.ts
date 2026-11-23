import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadPurpose } from '@/utils/mediaUpload'

class Request {
	static latest: Request
	upload: any = {}
	status = 200
	responseText = ''
	onload: any
	onerror: any
	onabort: any
	open = vi.fn()
	setRequestHeader = vi.fn()
	send = vi.fn()
	abort = vi.fn(() => this.onabort?.())
	constructor() {
		Request.latest = this
	}
}
beforeEach(() => vi.stubGlobal('XMLHttpRequest', Request))
afterEach(() => vi.unstubAllGlobals())
describe('purpose upload transport', () => {
	it('sends CSRF, purpose and private media, and completes only after the server confirms', async () => {
		window.csrf_token = 'synthetic-csrf'
		const progress = vi.fn(),
			abort = new AbortController()
		const promise = uploadPurpose(
			new File(['video'], 'lesson.mp4'),
			{ purpose: 'video', is_private: '1' },
			abort.signal,
			progress
		)
		const request = Request.latest
		expect(request.setRequestHeader).toHaveBeenCalledWith(
			'X-Frappe-CSRF-Token',
			'synthetic-csrf'
		)
		expect((request.send.mock.calls[0][0] as FormData).get('purpose')).toBe(
			'video'
		)
		request.upload.onprogress({
			lengthComputable: true,
			loaded: 100,
			total: 100,
		})
		expect(progress).toHaveBeenLastCalledWith(99)
		request.responseText = JSON.stringify({
			message: { file_url: '/private/files/lesson.mp4', file_type: 'MP4' },
		})
		request.onload()
		await expect(promise).resolves.toMatchObject({
			file_url: '/private/files/lesson.mp4',
		})
		expect(progress).toHaveBeenLastCalledWith(100)
	})
	it('aborts the request and rejects safely without replacing the current file', async () => {
		const abort = new AbortController(),
			promise = uploadPurpose(
				new File(['x'], 'x.pdf'),
				{ purpose: 'material' },
				abort.signal,
				vi.fn()
			)
		const check = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
		abort.abort()
		await check
		expect(Request.latest.abort).toHaveBeenCalledTimes(1)
	})
	it('rejects HTTP failures and malformed or missing file replies', async () => {
		for (const [status, body] of [
			[403, '{"exception":"private internal message"}'],
			[200, '{}'],
			[200, '<html>error</html>'],
		] as const) {
			const promise = uploadPurpose(
				new File(['x'], 'x.pdf'),
				{ purpose: 'material' },
				new AbortController().signal,
				vi.fn()
			)
			Request.latest.status = status
			Request.latest.responseText = body
			Request.latest.onload()
			await expect(promise).rejects.toBeInstanceOf(Error)
		}
	})
})
