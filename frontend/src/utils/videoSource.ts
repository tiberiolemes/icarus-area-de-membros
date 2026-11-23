const lessonResource =
	'/api/method/lms.lms.doctype.course_lesson.course_lesson.serve_resource'

// The access-gated playback URL is transport; native File URLs identify saved positions.
export function videoSourceIdentity(
	source: string,
	origin: string,
	bindings: Record<string, string> = {}
): string {
	const bare = source.match(/^([\w-]{11})(?:[?&].*)?$/)
	if (bare) return `https://www.youtube.com/watch?v=${bare[1]}`
	try {
		const url = new URL(source, origin)
		if (url.username || url.password) return ''
		url.hash = ''
		if (
			Object.hasOwn(bindings, url.href) &&
			/^external:[a-f0-9]{64}$/.test(bindings[url.href])
		)
			return bindings[url.href]
		if (url.origin === origin && url.pathname === lessonResource) {
			const files = url.searchParams.getAll('file_url')
			if (files.length === 1 && /^\/(private\/)?files\//.test(files[0]))
				return files[0]
		}
		if (url.origin === origin && /^\/(private\/)?files\//.test(url.pathname))
			return decodeURI(url.pathname)
		if (url.protocol === 'https:') {
			if (
				[
					'youtube.com',
					'www.youtube.com',
					'www.youtube-nocookie.com',
					'youtu.be',
				].includes(url.hostname)
			) {
				if (
					url.pathname === '/watch' &&
					url.searchParams.getAll('v').length !== 1
				)
					return source
				const id =
					url.pathname === '/watch'
						? url.searchParams.get('v')
						: url.pathname.split('/').filter(Boolean).at(-1)
				if (id && /^[\w-]{11}$/.test(id))
					return `https://www.youtube.com/watch?v=${id}`
			}
			if (
				['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(
					url.hostname
				)
			) {
				const id = url.pathname.split('/').filter(Boolean).at(-1)
				if (id && /^[0-9]+$/.test(id)) return `https://vimeo.com/${id}`
			}
			if (
				['iframe.mediadelivery.net', 'player.mediadelivery.net'].includes(
					url.hostname
				) &&
				/^\/embed\/[0-9]+\/[A-Za-z0-9-]+$/.test(url.pathname)
			)
				return `https://iframe.mediadelivery.net${url.pathname}`
		}
	} catch {}
	return source
}

export function safePendingVideoSource(source: string): boolean {
	return (
		source.length <= 140 &&
		!/[\u0000-\u001f\u007f]/.test(source) &&
		(/^\/(private\/)?files\/[^?#]+$/.test(source) ||
			/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(source) ||
			/^https:\/\/vimeo\.com\/[0-9]+$/.test(source) ||
			/^https:\/\/iframe\.mediadelivery\.net\/embed\/[0-9]+\/[A-Za-z0-9-]+$/.test(
				source
			) ||
			/^external:[a-f0-9]{64}$/.test(source))
	)
}
