import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import CourseThumbnailField from '@/components/Courses/CourseThumbnailField.vue'
import translationPlugin from '@/translation'

vi.mock('@/components/Controls/PurposeUploader.vue', () => ({
	default: {
		template:
			'<div><slot :uploading="false" :openFileSelector="() => {}" /></div>',
	},
}))
vi.mock('frappe-ui', () => ({
	Button: { template: '<button><slot /></button>' },
	Tooltip: { template: '<span><slot /></span>' },
	UploadError: class extends Error {},
	createResource: () => ({ reload: vi.fn() }),
	toast: { error: vi.fn() },
}))
vi.mock('frappe-ui/experimental', () => ({
	InputLabel: { template: '<label />' },
}))

describe('course thumbnail color names', () => {
	it('translates accessible names and preserves the stored native color identifier', async () => {
		const browser = window as Window & {
			translatedMessages?: Record<string, string>
		}
		const previous = browser.translatedMessages
		browser.translatedMessages = { Red: 'Vermelho', Blue: 'Azul' }
		const doc = reactive({ image: '', card_gradient: '' })
		const markDirty = vi.fn()
		const wrapper = mount(CourseThumbnailField, {
			global: {
				plugins: [translationPlugin],
				provide: { courseForm: { resource: { doc }, markDirty } },
			},
		})
		try {
			expect(wrapper.find('[aria-label="Red"]').exists()).toBe(false)
			await wrapper.get('[aria-label="Vermelho"]').trigger('click')
			expect(doc.card_gradient).toBe('Red')
			expect(markDirty).toHaveBeenCalledTimes(1)
			await wrapper.get('[aria-label="Azul"]').trigger('click')
			expect(doc.card_gradient).toBe('Blue')
		} finally {
			wrapper.unmount()
			browser.translatedMessages = previous
		}
	})
})
