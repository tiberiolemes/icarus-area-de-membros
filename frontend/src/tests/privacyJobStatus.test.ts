import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'

const source = readFileSync('../lms/public/js/privacy_request.js', 'utf8')
const deferred = () => {
	let resolve!: (value: any) => void
	let reject!: (error: Error) => void
	const promise = new Promise<any>((yes, no) => {
		resolve = yes
		reject = no
	})
	return { promise, resolve, reject }
}

function fixture() {
	let events: any
	const dialogs: any[] = []
	const buttons = new Map<string, () => Promise<void>>()
	const frappe = {
		session: { user: 'manager-a' },
		user: { has_role: vi.fn(() => true) },
		ui: {
			form: { on: (_doctype: string, handlers: any) => (events = handlers) },
			Dialog: class {
				constructor(public options: any) {
					dialogs.push(this)
				}
				$body = { prepend: vi.fn() }
				$wrapper = { one: vi.fn(), 0: document.createElement('div') }
				show = vi.fn()
				hide = vi.fn()
				disable_primary_action = vi.fn()
				enable_primary_action = vi.fn()
			},
		},
		require: vi.fn(() => new Promise(() => {})),
		call: vi.fn(),
		msgprint: vi.fn(),
		show_alert: vi.fn(),
		utils: {
			escape_html: (value: string) =>
				value.replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
		},
	}
	const frm: any = {
		doc: { name: 'owned-request', email: 'synthetic@example.test' },
		is_new: () => false,
		add_custom_button: vi.fn((label: string, action: () => Promise<void>) => {
			buttons.set(label, action)
			return { label }
		}),
		remove_custom_button: vi.fn((label: string) => buttons.delete(label)),
		reload_doc: vi.fn().mockResolvedValue(undefined),
	}
	new Function('frappe', '__', source)(frappe, (text: string) => text)
	const job = {
		id: 'lms-privacy-synthetic',
		actor: 'manager-a',
		request: 'owned-request',
	}
	frm._lmsPrivacyJob = job
	events.refresh(frm)
	return { frappe, frm, job, buttons, events, dialogs }
}

afterEach(() => vi.restoreAllMocks())

it('checks only on explicit action and never posts another anonymization after conflict or read failure', async () => {
	const f = fixture()
	expect(f.frappe.call).not.toHaveBeenCalled()
	f.frappe.call.mockResolvedValueOnce({
		message: { status: 'conflict', message: 'Review the current impact.' },
	})
	await f.buttons.get('Check anonymization status')!()
	expect(f.frappe.msgprint).toHaveBeenCalledWith(
		expect.objectContaining({
			message: 'Review the current impact.',
			indicator: 'orange',
		})
	)
	f.frappe.call.mockRejectedValueOnce(new Error('synthetic network failure'))
	await f.buttons.get('Check anonymization status')!()
	expect(f.frappe.show_alert).toHaveBeenCalledOnce()
	expect(f.frappe.call.mock.calls.map(([options]) => options.method)).toEqual([
		'lms.lms.privacy.get_anonymization_status',
		'lms.lms.privacy.get_anonymization_status',
	])
	expect(f.frm.reload_doc).not.toHaveBeenCalled()
	expect(f.frm._lmsPrivacyJob).toBe(f.job)
})

it.each(['actor', 'request', 'job'])(
	'ignores delayed status from an old %s',
	async (changed) => {
		const f = fixture()
		const pending = deferred()
		f.frappe.call.mockReturnValueOnce(pending.promise)
		const operation = f.buttons.get('Check anonymization status')!()
		if (changed === 'actor') f.frappe.session.user = 'manager-b'
		if (changed === 'request') f.frm.doc.name = 'other-request'
		if (changed === 'job') f.frm._lmsPrivacyJob = { ...f.job, id: 'new-job' }
		pending.resolve({ message: { status: 'completed', message: 'Completed' } })
		await operation
		expect(f.frappe.msgprint).not.toHaveBeenCalled()
		expect(f.frm.reload_doc).not.toHaveBeenCalled()
	}
)

it('refreshes completed state using escaped human text without reading job traceback', async () => {
	const f = fixture()
	f.frappe.call.mockResolvedValueOnce({
		message: {
			status: 'completed',
			message: '<safe completed>',
			exc_info: 'never rendered',
		},
	})
	await f.buttons.get('Check anonymization status')!()
	expect(f.frm.reload_doc).toHaveBeenCalledOnce()
	expect(f.frappe.msgprint).toHaveBeenCalledWith({
		title: 'Anonymization status',
		message: '&lt;safe completed&gt;',
		indicator: 'green',
	})
})

it('discards the in-memory handle on actor/document change and respects the native manager gate', () => {
	const f = fixture()
	f.frappe.session.user = 'manager-b'
	f.frappe.user.has_role.mockReturnValue(false)
	f.frm.add_custom_button.mockClear()
	f.events.refresh(f.frm)
	expect(f.frm._lmsPrivacyJob).toBeUndefined()
	expect(f.frm.add_custom_button).not.toHaveBeenCalled()
})

it('queues only through explicit impact confirmation and exposes the returned job for manual checks', async () => {
	const f = fixture()
	f.frappe.call.mockResolvedValueOnce({
		message: {
			ready: true,
			digest: 'current-digest',
			dependencies: [],
			retained_records: {},
			authoring_targets: [],
		},
	})
	await f.buttons.get('Review privacy impact')!()
	const dialog = f.dialogs[0]
	f.frappe.call.mockResolvedValueOnce({
		message: { queued: true, job_id: 'lms-privacy-new-synthetic' },
	})
	await dialog.options.primary_action({
		confirmation: 'owned-request',
		reviewed_retention: true,
		retention_note: 'Synthetic retention review.',
	})
	expect(f.frm._lmsPrivacyJob).toEqual({
		id: 'lms-privacy-new-synthetic',
		request: 'owned-request',
		actor: 'manager-a',
	})
	expect(f.frappe.call).toHaveBeenCalledTimes(2)
	expect(f.frappe.call.mock.calls[1][0]).toEqual(
		expect.objectContaining({
			method: 'lms.lms.privacy.confirm_data_deletion',
			args: expect.objectContaining({
				request: 'owned-request',
				digest: 'current-digest',
			}),
		})
	)
	expect(f.buttons.has('Check anonymization status')).toBe(true)
	expect(dialog.hide).toHaveBeenCalledOnce()
	expect(dialog.enable_primary_action).toHaveBeenCalledOnce()
})

it('does not open a delayed impact dialog after leaving the request', async () => {
	const f = fixture()
	const pending = deferred()
	f.frappe.call.mockReturnValueOnce(pending.promise)
	const operation = f.buttons.get('Review privacy impact')!()
	f.frm.doc.name = 'different-request'
	pending.resolve({ message: { ready: true } })
	await operation
	expect(f.dialogs).toHaveLength(0)
})

it('shows professional profile counts separately from retained learning records and escapes server labels', async () => {
	const f = fixture()
	f.frappe.call.mockResolvedValueOnce({
		message: {
			ready: false,
			digest: 'current',
			dependencies: [],
			authoring_targets: [],
			profile_records: {
				'Work Experience': [{}, {}],
				Skills: [{}],
				'<unsafe-profile-label>': [{}],
			},
			retained_records: { 'LMS Certificate': [{}] },
		},
	})
	await f.buttons.get('Review privacy impact')!()
	const html = f.dialogs[0].options.fields[0].options
	expect(html).toContain('Work Experience: 2')
	expect(html).toContain('Skills: 1')
	expect(html).toContain('LMS Certificate: 1')
	expect(html).toContain('&lt;unsafe-profile-label&gt;: 1')
	expect(html).not.toContain('<unsafe-profile-label>')
	expect(html).toContain('technical reference [REDACTED]')
	expect(html).toContain('files and learning records are preserved')
	expect(f.frappe.call).toHaveBeenCalledOnce()
})
