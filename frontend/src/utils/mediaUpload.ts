export type MediaPurpose =
	| 'avatar'
	| 'cover'
	| 'brand'
	| 'material'
	| 'video'
	| 'intro_video'
export interface UploadedMedia {
	file_url: string
	file_type: string
	original_url?: string
}
export function uploadPurpose(
	file: File,
	options: {
		purpose: MediaPurpose
		is_private?: string
		crop?: string
		doctype?: string
		docname?: string
		fieldname?: string
	},
	signal: AbortSignal,
	onProgress: (percent: number) => void
): Promise<UploadedMedia> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest(),
			form = new FormData()
		form.append('file', file)
		for (const [key, value] of Object.entries(options))
			if (value) form.append(key, value)
		const abort = () => xhr.abort()
		const finish = () => signal.removeEventListener('abort', abort)
		xhr.open('POST', '/api/method/lms.lms.media.upload')
		xhr.setRequestHeader('X-Frappe-CSRF-Token', window.csrf_token || '')
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable)
				onProgress(Math.min(99, Math.floor((event.loaded * 100) / event.total)))
		}
		xhr.onerror = () => {
			finish()
			reject(
				new Error(__('A conexão falhou. Verifique a rede e tente novamente.'))
			)
		}
		xhr.onabort = () => {
			finish()
			reject(new DOMException('Aborted', 'AbortError'))
		}
		xhr.onload = () => {
			finish()
			try {
				const data = JSON.parse(xhr.responseText)
				if (xhr.status < 200 || xhr.status >= 300 || !data.message?.file_url)
					throw new Error(
						__(
							'O servidor recusou o arquivo. Confira o tipo, tamanho e sua permissão.'
						)
					)
				onProgress(100)
				resolve(data.message)
			} catch (error) {
				reject(
					error instanceof Error
						? error
						: new Error(__('Resposta de envio inválida.'))
				)
			}
		}
		signal.addEventListener('abort', abort, { once: true })
		if (signal.aborted) {
			finish()
			reject(new DOMException('Aborted', 'AbortError'))
			return
		}
		xhr.send(form)
	})
}
