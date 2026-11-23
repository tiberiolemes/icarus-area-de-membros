import { createApp } from 'vue'
import GuidedTour from './components/GuidedTour.vue'

const mounted = new WeakMap()
function mount(
	element,
	pageKey,
	scope = element.closest('[role="dialog"]') || element.parentElement
) {
	mounted.get(element)?.()
	const app = createApp(GuidedTour, {
		pageKey,
		scope,
		request: async (method, args) =>
			(await window.frappe.call({ method, args })).message,
		notify: (message) =>
			window.frappe.show_alert({ message, indicator: 'orange' }),
	})
	app.config.globalProperties.__ = window.__
	app.mount(element)
	const dispose = () => {
		app.unmount()
		mounted.delete(element)
	}
	mounted.set(element, dispose)
	return dispose
}
window.IcarusTours = { mount }
