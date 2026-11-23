(() => {
	let loading,
		ready = false;
	function load() {
		if (ready) return Promise.resolve();
		if (!loading) {
			const style = document.createElement("link");
			style.rel = "stylesheet";
			style.href = "/assets/lms/frontend/tours/icarus-tours.css";
			const script = document.createElement("script");
			script.type = "module";
			script.src = "/assets/lms/frontend/tours/icarus-tours.js";
			loading = Promise.all([
				new Promise((resolve, reject) => {
					style.onload = resolve;
					style.onerror = reject;
				}),
				new Promise((resolve, reject) => {
					script.onload = resolve;
					script.onerror = reject;
				}),
			])
				.then(() => {
					ready = true;
				})
				.catch((error) => {
					loading = undefined;
					script.remove();
					style.remove();
					throw error;
				});
			document.head.append(style);
			document.head.append(script);
		}
		return loading;
	}
	window.mountIcarusPrivacyTour = async (element, page, scope) => {
		try {
			await load();
			if (
				element.isConnected &&
				(!scope || scope.getClientRects().length)
			)
				return window.IcarusTours.mount(element, page, scope);
		} catch {
			frappe.show_alert({
				message: __(
					"O guia não carregou. A ajuda pública continua disponível."
				),
				indicator: "orange",
			});
		}
	};
	window.mountIcarusPrivacyForm = (frm) => {
		if (!frappe.user.has_role("System Manager")) return;
		const page =
			frm.doctype === "LMS Privacy Settings"
				? "DeskPrivacySettings"
				: "DeskPrivacyRequest";
		let host = frm.wrapper[0].querySelector("[data-icarus-tour-host]");
		if (host) return;
		host = document.createElement("div");
		host.dataset.icarusTourHost = page;
		frm.fields_dict[
			frm.doctype === "LMS Privacy Settings" ? "controller_name" : "email"
		].$wrapper.before(host);
		window
			.mountIcarusPrivacyTour(host, page, frm.wrapper[0])
			.then((dispose) => {
				if (!dispose) {
					host.remove();
					return;
				}
				frappe.router.once("change", () => {
					dispose?.();
					host.remove();
				});
			});
	};
	frappe.ui.form.on("LMS Privacy Settings", {
		refresh: (frm) => window.mountIcarusPrivacyForm(frm),
	});
})();
