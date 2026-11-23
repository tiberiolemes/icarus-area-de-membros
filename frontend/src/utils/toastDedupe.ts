import { toast } from 'frappe-ui'
import type { ToastOptions } from 'frappe-ui'

const TYPES = ['success', 'error', 'warning', 'info'] as const

/**
 * A repeated message replaces the toast already on screen instead of stacking
 * a copy: a double click, a retry or a loop that fails the same way showed the
 * same text several times. vue-sonner updates a toast in place when it is given
 * an id it already shows, so the message (with its type) is the id. A caller's
 * own id still wins.
 */
export function dedupeToasts(): void {
	for (const type of TYPES) {
		const show = toast[type]
		toast[type] = (message, data?: ToastOptions) =>
			show(message, {
				position: 'top-right',
				closeButton: true,
				important: type === 'error',
				classes: {
					toast:
						'group flex items-center gap-2 rounded-5 border border-outline-gray-2 bg-surface-base p-3 shadow-lg w-[min(360px,calc(100vw-32px))]',
					title: 'text-p-base font-medium text-ink-gray-9',
					description: 'text-p-base text-ink-gray-7',
					icon: 'shrink-0 [&_svg]:size-5',
					closeButton:
						'order-1 ms-auto grid min-h-11 min-w-11 place-items-center rounded-4 text-ink-gray-8 hover:bg-surface-gray-2 focus-visible:ring-2 focus-visible:ring-outline-gray-5 [&_svg]:size-4',
					success: '[&_[data-icon]]:text-ink-green-3',
					error: '[&_[data-icon]]:text-ink-red-4',
					warning: '[&_[data-icon]]:text-ink-amber-4',
					info: '[&_[data-icon]]:text-ink-blue-3',
				},
				...(typeof message === 'string' ? { id: `${type}:${message}` } : {}),
				...data,
			})
	}
}
