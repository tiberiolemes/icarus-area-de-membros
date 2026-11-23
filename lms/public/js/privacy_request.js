function attachAnonymizationStatus(frm, job) {
	const current = () =>
		frm.doc.name === job.request &&
		frappe.session.user === job.actor &&
		frm._lmsPrivacyJob === job;
	const button = frm.add_custom_button(
		__("Check anonymization status"),
		async () => {
			if (!current()) return;
			try {
				const { message: state } = await frappe.call({
					method: "lms.lms.privacy.get_anonymization_status",
					args: { request: job.request, job_id: job.id },
					btn: button,
				});
				if (!current()) return;
				frappe.msgprint({
					title: __("Anonymization status"),
					message: frappe.utils.escape_html(state.message),
					indicator:
						state.status === "completed" ? "green" : "orange",
				});
				if (state.status === "completed") await frm.reload_doc();
			} catch {
				if (current())
					frappe.show_alert({
						message: __(
							"Could not check anonymization status. Check again before confirming another action."
						),
						indicator: "orange",
					});
			}
		}
	);
}

frappe.ui.form.on("Personal Data Deletion Request", {
	refresh(frm) {
		frappe
			.require("/assets/lms/js/privacy_tours.js")
			.then(() => window.mountIcarusPrivacyForm(frm));
		frm.remove_custom_button(__("Delete Data"));
		if (
			frm._lmsPrivacyJob &&
			(frm._lmsPrivacyJob.actor !== frappe.session.user ||
				frm._lmsPrivacyJob.request !== frm.doc.name)
		)
			delete frm._lmsPrivacyJob;
		if (!frappe.user.has_role("System Manager") || frm.is_new()) return;
		if (frm._lmsPrivacyJob)
			attachAnonymizationStatus(frm, frm._lmsPrivacyJob);
		const previewButton = frm.add_custom_button(
			__("Review privacy impact"),
			async () => {
				const request = frm.doc.name;
				const actor = frappe.session.user;
				const departing = frm.doc.email;
				const current = () =>
					frm.doc.name === request && frappe.session.user === actor;
				const { message: impact } = await frappe.call({
					method: "lms.lms.privacy.get_deletion_preview",
					args: { request },
					btn: previewButton,
				});
				if (!current()) return;
				const escape = frappe.utils.escape_html;
				const dependencies = impact.dependencies
					.map(
						(row) =>
							`<li>${escape(__(row.doctype))}: ${escape(
								row.name
							)} — ${escape(
								row.blocking
									? __(
											"Transfer or reconnect this responsibility before continuing."
									  )
									: __(
											"Review this file under the retention policy; learning media is preserved."
									  )
							)}</li>`
					)
					.join("");
				const retained = Object.entries(impact.retained_records)
					.map(
						([doctype, rows]) =>
							`<li>${escape(__(doctype))}: ${rows.length}</li>`
					)
					.join("");
				const profile = Object.entries(impact.profile_records || {})
					.map(
						([doctype, rows]) =>
							`<li>${escape(__(doctype))}: ${rows.length}</li>`
					)
					.join("");
				const dialog = new frappe.ui.Dialog({
					title: __("Review privacy impact"),
					fields: [
						{
							fieldtype: "HTML",
							options: `<p>${escape(
								__(
									"Learning records are preserved. Review file retention and transfer responsibilities before continuing."
								)
							)}</p><ul>${dependencies}</ul><p>${escape(
								__(
									"Personal profile, contact details and self-declared professional CV are anonymized. Profile image references are cleared; files and learning records are preserved for the separate retention review."
								)
							)}</p><ul>${profile}</ul><p>${escape(
								__(
									"Required skill and industry links use the technical reference [REDACTED]; it does not represent a real qualification or industry."
								)
							)}</p><p>${escape(
								__("Retained learning records in this preview:")
							)}</p><ul>${retained}</ul><p>${escape(
								impact.ready
									? __(
											"Type the request identifier to confirm anonymization."
									  )
									: __(
											"The request needs verified identity, approved policy and no unresolved dependencies."
									  )
							)}</p>`,
						},
						{
							fieldname: "confirmation",
							fieldtype: "Data",
							label: __("Request identifier"),
							description: frm.doc.name,
							reqd: 1,
						},
						{
							fieldname: "reviewed_retention",
							fieldtype: "Check",
							label: __(
								"I reviewed free text, retained learning records and backups under the approved retention policy."
							),
							reqd: 1,
						},
						{
							fieldname: "retention_note",
							fieldtype: "Small Text",
							label: __("Retention review record"),
							description: __(
								"Summarize the reviewed scope and remaining retention. Do not include credentials or other people's data."
							),
							reqd: 1,
						},
					],
					primary_action_label: __("Confirm anonymization"),
					secondary_action_label: impact.authoring_targets.length
						? __("Transfer authoring responsibility")
						: undefined,
					secondary_action() {
						const targets = impact.authoring_targets;
						const transfer = new frappe.ui.Dialog({
							title: __("Transfer authoring responsibility"),
							fields: [
								{
									fieldname: "target",
									fieldtype: "Select",
									label: __("Document"),
									options: targets.map((target, index) => ({
										label: `${target.doctype}: ${target.name}`,
										value: String(index),
									})),
									reqd: 1,
								},
								{
									fieldname: "successor",
									fieldtype: "Link",
									label: __("Successor"),
									options: "User",
									reqd: 1,
								},
								{
									fieldname: "confirmation",
									fieldtype: "Data",
									label: __(
										"Type the document identifier to confirm"
									),
									reqd: 1,
								},
							],
							primary_action_label: __("Transfer responsibility"),
							async primary_action(values) {
								if (!current()) return;
								const target = targets[Number(values.target)];
								if (!target) return;
								transfer.disable_primary_action();
								try {
									await frappe.call({
										method: "lms.lms.privacy.transfer_authoring",
										args: {
											...target,
											departing,
											successor: values.successor,
											confirmation: values.confirmation,
										},
									});
									if (!current()) return;
									transfer.hide();
									dialog.hide();
									frappe.show_alert({
										message: __(
											"Responsibility transferred. Review the updated privacy impact before continuing."
										),
										indicator: "green",
									});
								} finally {
									transfer.enable_primary_action();
								}
							},
						});
						transfer.show();
					},
					async primary_action(values) {
						if (!current()) return;
						dialog.disable_primary_action();
						try {
							const { message: queued } = await frappe.call({
								method: "lms.lms.privacy.confirm_data_deletion",
								args: {
									request,
									confirmation: values.confirmation,
									digest: impact.digest,
									reviewed_retention:
										values.reviewed_retention,
									retention_note: values.retention_note,
								},
							});
							if (!current()) return;
							frm._lmsPrivacyJob = {
								id: queued.job_id,
								request,
								actor,
							};
							frm.remove_custom_button(
								__("Check anonymization status")
							);
							attachAnonymizationStatus(frm, frm._lmsPrivacyJob);
							dialog.hide();
							frappe.show_alert({
								message: __(
									"Anonymization queued. Check the request status after the job finishes."
								),
								indicator: "blue",
							});
						} finally {
							dialog.enable_primary_action();
						}
					},
				});
				dialog.show();
				const tourHost = document.createElement("div");
				dialog.$body.prepend(tourHost);
				frappe
					.require("/assets/lms/js/privacy_tours.js")
					.then(() =>
						window.mountIcarusPrivacyTour(
							tourHost,
							"DeskPrivacyImpact",
							dialog.$wrapper[0]
						)
					)
					.then((dispose) => {
						dialog.$wrapper.one("hidden.bs.modal", () =>
							dispose?.()
						);
					});
				if (!impact.ready) dialog.disable_primary_action();
			}
		);
	},
});
