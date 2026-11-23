import { onScopeDispose, reactive, ref, shallowRef } from 'vue'
import { createResource } from 'frappe-ui'

// A slow reply for an abandoned filter must never repaint a newer report.
export function useReportResource(
	url: string,
	transform = (value: any) => value
) {
	const source = createResource({ url })
	const data = shallowRef<any>(null),
		error = shallowRef<unknown>(null),
		loading = ref(false)
	let sequence = 0,
		lastParams: Record<string, unknown> = {}
	async function submit(params: Record<string, unknown>) {
		const current = ++sequence
		lastParams = params
		loading.value = true
		error.value = null
		try {
			const value = await source.submit(params)
			if (current === sequence) data.value = transform(value)
			return value
		} catch (reason) {
			if (current === sequence) error.value = reason
			return null
		} finally {
			if (current === sequence) loading.value = false
		}
	}
	onScopeDispose(() => {
		sequence++
		source.abort?.()
	})
	return reactive({
		data,
		error,
		loading,
		submit,
		reload: () => submit(lastParams),
	})
}
