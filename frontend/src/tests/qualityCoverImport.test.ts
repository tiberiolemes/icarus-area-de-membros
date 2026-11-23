import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import EditCoverImage from '@/components/Modals/EditCoverImage.vue'
import translationPlugin from '@/translation'

const mocks = vi.hoisted(() => ({
	resource: { data: [] as any[], loading: false, reload: vi.fn() },
	upload: vi.fn(),
}))
vi.mock('frappe-ui', async () => ({
	...(await vi.importActual('frappe-ui')),
	createResource: () => mocks.resource,
}))
vi.mock('@/utils/mediaUpload', () => ({ uploadPurpose: mocks.upload }))

describe('cover import through the validated upload boundary', () => {
	let wrapper: ReturnType<typeof mount>
	beforeEach(() => {
		mocks.resource.data = [
			{ id: 'one', urls: { raw: 'https://images.unsplash.com/photo-one?x=1' } },
		]
		mocks.upload.mockReset()
	})
	afterEach(() => {
		wrapper?.unmount()
		vi.unstubAllGlobals()
	})
	const open = () =>
		mount(EditCoverImage, {
			global: {
				plugins: [translationPlugin],
				stubs: {
					Popover: { template: '<div><slot /></div>' },
					PurposeUploader: { template: '<div />' },
					FileUploader: { template: '<div />' },
				},
			},
		})
	it('uses no browser credentials and selects only the confirmed local derivative', async () => {
		const fetch = vi.fn().mockResolvedValue({
			ok: true,
			blob: async () => new Blob(['image'], { type: 'image/jpeg' }),
		})
		vi.stubGlobal('fetch', fetch)
		mocks.upload.mockResolvedValue({ file_url: '/files/local-cover.webp' })
		wrapper = open()
		await wrapper.get('button:has(img)').trigger('click')
		await flushPromises()
		const [url, options] = fetch.mock.calls[0]
		expect(url.searchParams.get('fm')).toBe('jpg')
		expect(options).toMatchObject({
			credentials: 'omit',
			referrerPolicy: 'no-referrer',
		})
		expect(mocks.upload.mock.calls[0][1]).toEqual({
			purpose: 'cover',
			crop: 'contain',
			is_private: '0',
		})
		expect(wrapper.emitted('select')).toEqual([['/files/local-cover.webp']])
	})
	it('rejects an untrusted image host before downloading or changing the cover', async () => {
		mocks.resource.data[0].urls.raw =
			'https://images.unsplash.com.attacker.test/picture'
		const fetch = vi.fn()
		vi.stubGlobal('fetch', fetch)
		wrapper = open()
		await wrapper.get('button:has(img)').trigger('click')
		await flushPromises()
		expect(fetch).not.toHaveBeenCalled()
		expect(mocks.upload).not.toHaveBeenCalled()
		expect(wrapper.emitted('select')).toBeUndefined()
		expect(wrapper.get('[role="alert"]').text()).not.toBe('')
	})
	it('cancels the pending download and preserves the previous cover', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_url, options) =>
					new Promise((_resolve, reject) => {
						options.signal.addEventListener('abort', () =>
							reject(new DOMException('cancel', 'AbortError'))
						)
					})
			)
		)
		wrapper = open()
		await wrapper.get('button:has(img)').trigger('click')
		await wrapper
			.findAll('button')
			.find((button) => button.text().includes('Cancelar envio'))!
			.trigger('click')
		await flushPromises()
		expect(mocks.upload).not.toHaveBeenCalled()
		expect(wrapper.emitted('select')).toBeUndefined()
		expect(wrapper.get('[role="alert"]').text()).toContain('imagem anterior')
	})
	it('keeps the cover after server validation fails and allows retry', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue({ ok: true, blob: async () => new Blob(['image']) })
		)
		mocks.upload.mockRejectedValue(new Error('private server detail'))
		wrapper = open()
		await wrapper.get('button:has(img)').trigger('click')
		await flushPromises()
		expect(wrapper.emitted('select')).toBeUndefined()
		expect(wrapper.get('[role="alert"]').text()).not.toContain(
			'private server detail'
		)
		expect(
			wrapper.get('button:has(img)').attributes('disabled')
		).toBeUndefined()
	})
})
