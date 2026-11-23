import catalogue from '../../../lms/public/tours/quality07.json'

export { catalogue }
export function tourFor(page) {
	const entry = catalogue.pages[page]
	return entry ? { ...entry, steps: catalogue.tours[entry.tour] } : null
}

export function availableTarget(selector, root = document) {
	const modal = [
		...document.querySelectorAll(
			'[role="dialog"][aria-modal="true"], .modal.show'
		),
	]
		.filter((node) => node.getClientRects().length)
		.at(-1)
	const candidates = [...root.querySelectorAll(selector)].flatMap((node) =>
		node.matches('[data-tour="list-filters"]')
			? [
					...node.querySelectorAll(
						'input, button, select, [role="combobox"]'
					),
			  ]
			: [node]
	)
	const found =
		candidates.find(
			(node) =>
				!node.closest(
					'.icarus-tour, [inert], [aria-hidden="true"], [aria-busy="true"]'
				) &&
				!node.matches(':disabled') &&
				node.getClientRects().length &&
				!node.classList.contains('sr-only') &&
				(!modal || modal.contains(node))
		) || null
	if (
		found?.matches(
			'[data-tour="form-fields"], [data-tour="form-actions"], [data-tour="authoring-form"]'
		)
	) {
		return (
			[
				...found.querySelectorAll(
					'input, textarea, select, button, [role="combobox"], [contenteditable="true"]'
				),
			].find(
				(node) =>
					!node.closest('.icarus-tour, [inert]') &&
					!node.matches(':disabled') &&
					node.getClientRects().length
			) || null
		)
	}
	if (found?.matches('[data-fieldname]'))
		return (
			[
				...found.querySelectorAll(
					'input, textarea, select, [contenteditable="true"]'
				),
			].find(
				(node) =>
					!node.matches(':disabled') && node.getClientRects().length
			) || found
		)
	return found
}

export function focusTarget(element) {
	const previousTabIndex = element.getAttribute('tabindex')
	const previousMarker = element.getAttribute('data-icarus-tour-target')
	if (
		!element.matches(
			'input, button, textarea, select, a[href], [tabindex], [contenteditable="true"], iframe, video'
		)
	)
		element.setAttribute('tabindex', '-1')
	element.setAttribute('data-icarus-tour-target', '')
	element.scrollIntoView?.({ block: 'center', behavior: 'auto' })
	element.focus({ preventScroll: true })
	return () => {
		if (previousTabIndex === null) element.removeAttribute('tabindex')
		else element.setAttribute('tabindex', previousTabIndex)
		if (previousMarker === null)
			element.removeAttribute('data-icarus-tour-target')
		else element.setAttribute('data-icarus-tour-target', previousMarker)
	}
}
