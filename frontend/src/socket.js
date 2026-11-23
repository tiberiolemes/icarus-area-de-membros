import { io } from 'socket.io-client'
import { socketio_port } from '../../../../sites/common_site_config.json'

export function initSocket() {
	let host = window.location.hostname
	let siteName = window.site_name || host
	let origin = import.meta.env.DEV
		? `http://${host}:${socketio_port}`
		: window.location.origin
	let url = `${origin}/${siteName}`

	let socket = io(url, {
		withCredentials: true,
		reconnectionAttempts: 5,
	})
	return socket
}
