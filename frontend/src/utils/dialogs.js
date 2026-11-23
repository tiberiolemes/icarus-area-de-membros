import { Dialog } from 'frappe-ui'
import { h, reactive, ref, watch } from 'vue'
import DiscardChangesDialog from '@/components/Settings/DiscardChangesDialog.vue'
import { usersStore } from '@/stores/user'
import { clearFormDrafts } from '@/composables/useFormDraft'
import { discardPrompt } from '@/composables/useDirtyGuard'

let dialogs = ref([])

export let Dialogs = {
	name: 'Dialogs',
	setup() {
		const { userResource } = usersStore()
		watch(
			() => {
				const actor = userResource.data
				return {
					name: actor?.name,
					author: Boolean(
						actor?.is_instructor ||
						actor?.is_moderator ||
						actor?.is_evaluator,
					),
				}
			},
			(next, previous) => {
				if (
					previous?.name &&
					(next.name !== previous.name ||
						(previous.author && !next.author))
				)
					clearFormDrafts()
				else if (next.name) clearFormDrafts(next.name)
			},
			{ flush: 'sync' },
		)
	},
	render() {
		return [
			h(DiscardChangesDialog),
			...dialogs.value.map((dialog) =>
				// Read each field here, not by spreading `dialog`, so the render
				// stays reactive to it.
				h(Dialog, {
					title: dialog.title,
					message: dialog.message,
					size: dialog.size,
					actions: dialog.actions,
					open: dialog.show,
					'onUpdate:open': (val) => (dialog.show = val),
				}),
			),
		]
	},
}

export function createDialog(options) {
	let dialog = reactive(options)
	dialogs.value.push(dialog)
	dialog.show = true
}

export function isDialogOpen() {
	return (
		discardPrompt.show.value || dialogs.value.some((dialog) => dialog.show)
	)
}
