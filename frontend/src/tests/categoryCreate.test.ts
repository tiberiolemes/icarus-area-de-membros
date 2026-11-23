import { expect, it, vi } from 'vitest'
import { createLMSCategory } from '@/utils'
vi.mock('@/utils/plyr', () => ({ enablePlyr: vi.fn() }))
vi.mock('@/router', () => ({ default: {} }))
const api = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', async (original) => ({
	...(await original<any>()),
	call: api.call,
}))
it('returns the native category identity, with no shared cross-actor promise or swallowed collision', async () => {
	api.call
		.mockResolvedValueOnce({ name: 'Native category' })
		.mockRejectedValueOnce({ messages: ['Duplicate category'] })
	expect(await createLMSCategory('Native category')).toBe('Native category')
	await expect(createLMSCategory('Native category')).rejects.toEqual({
		messages: ['Duplicate category'],
	})
	expect(api.call).toHaveBeenCalledTimes(2)
	expect(api.call.mock.calls[0]).toEqual([
		'frappe.client.insert',
		{ doc: { doctype: 'LMS Category', category: 'Native category' } },
	])
})
