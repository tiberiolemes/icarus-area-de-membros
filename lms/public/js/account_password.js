import { checkBreach, passwordRequirements } from "./password_policy.js";

function init() {
	const form = document.querySelector("#reset-password");
	if (!form) return;
	const old = form.querySelector("#old_password");
	const password = form.querySelector("#new_password");
	const confirm = form.querySelector("#confirm_password");
	const submit = form.querySelector("#update");
	const key = new URLSearchParams(location.search).get("key");
	let policy,
		timer,
		generation = 0,
		valid = false,
		busy = false;
	const message = document.createElement("p");
	message.setAttribute("role", "status");
	message.setAttribute("aria-live", "polite");
	const list = document.createElement("ul");
	const strength = document.createElement("p");
	const meter = document.createElement("progress");
	meter.max = 4;
	meter.setAttribute("aria-label", __("Password strength"));
	meter.style.width = "100%";
	password.closest(".form-group").append(list, strength, meter, message);
	form.querySelector(".password-hint").remove();
	form.querySelector(".password-strength-indicator").remove();
	old.closest(".form-group").hidden = Boolean(key);
	const mismatch = form.querySelector(".password-mismatch-message");
	mismatch.id = "password-match-message";
	mismatch.setAttribute("role", "status");
	confirm.setAttribute("aria-describedby", mismatch.id);
	for (const button of form.querySelectorAll(".toggle-password")) {
		button.addEventListener("click", () => {
			const input = document.querySelector(button.getAttribute("toggle"));
			const show = input.type === "password";
			input.type = show ? "text" : "password";
			button.setAttribute("aria-pressed", String(show));
			button.setAttribute(
				"aria-label",
				show ? __("Hide password") : __("Show password"),
			);
		});
	}
	const retry = document.createElement("a");
	retry.href = "/login#forgot";
	retry.textContent = __("Request a new password link");
	form.append(retry);
	function setError(text) {
		const banner = document.querySelector(".login-error-banner");
		banner.classList.remove("hidden");
		banner.querySelector(".es-alert__title").textContent = text;
	}
	function canSubmit() {
		const different = password.value && password.value === old.value;
		const differs = confirm.value && confirm.value !== password.value;
		mismatch.textContent = different
			? __("New password cannot be same as old password")
			: differs
				? __("Passwords do not match")
				: "";
		mismatch.classList.toggle("hidden", !mismatch.textContent);
		mismatch.classList.toggle("text-danger", Boolean(mismatch.textContent));
		confirm.setAttribute("aria-invalid", String(Boolean(differs)));
		submit.disabled =
			!valid ||
			busy ||
			!confirm.value ||
			!!differs ||
			!!different ||
			(!key && !old.value);
	}
	async function check() {
		const current = ++generation;
		clearTimeout(timer);
		valid = false;
		canSubmit();
		if (!policy) return;
		const requirements = passwordRequirements(password.value, policy);
		const labels = {
			length: __("Between {0} and {1} characters").format(
				policy.minimum,
				policy.maximum,
			),
			upper: __("One uppercase letter (A-Z)"),
			lower: __("One lowercase letter (a-z)"),
			number: __("One number (0-9)"),
			symbol: __("One symbol (not whitespace)"),
		};
		list.replaceChildren(
			...Object.entries(labels).map(([id, label]) => {
				const item = document.createElement("li");
				item.textContent = `${requirements[id] ? __("Met") : __("Required")}: ${label}`;
				item.className = requirements[id]
					? "text-ink-green-8"
					: "text-ink-gray-7";
				return item;
			}),
		);
		if (!password.value) {
			message.textContent = "";
			strength.textContent = "";
			meter.value = 0;
			return;
		}
		message.textContent = __("Checking public breaches…");
		timer = setTimeout(async () => {
			const value = password.value;
			const results = await Promise.allSettled([
				checkBreach(value),
				frappe.call({
					method: "frappe.core.doctype.user.user.test_password_strength",
					type: "POST",
					args: { new_password: value },
				}),
			]);
			if (current !== generation) return;
			const breach =
				results[0].status === "fulfilled"
					? results[0].value
					: "unavailable";
			message.textContent =
				breach === "compromised"
					? __(
							"This password appeared in a public breach. Choose another password.",
						)
					: breach === "unavailable"
						? __(
								"Breach checking is unavailable. You can continue with the local policy.",
							)
						: __("Not found in the consulted public breaches.");
			if (results[1].status === "fulfilled") {
				const result = results[1].value.message || {};
				meter.value = result.score || 0;
				strength.textContent =
					__("Password strength") +
					": " +
					(result.score == null
						? __("Not checked yet")
						: result.score < 2
							? __("Weak")
							: result.score < 4
								? __("Medium")
								: __("Strong"));
				valid =
					Object.values(requirements).every(Boolean) &&
					breach !== "compromised" &&
					(!policy.score_enabled ||
						result.feedback?.password_policy_validation_passed);
			} else {
				message.textContent = __(
					"Could not check password strength. Edit the password to retry.",
				);
			}
			canSubmit();
		}, 400);
	}
	password.addEventListener("input", check);
	for (const input of [old, confirm])
		input.addEventListener("input", canSubmit);
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (busy || submit.disabled) return;
		busy = true;
		canSubmit();
		try {
			const result = await frappe.call({
				method: "frappe.core.doctype.user.user.update_password",
				type: "POST",
				args: {
					key: key || "",
					old_password: old.value,
					new_password: password.value,
					logout_all_sessions: 1,
				},
			});
			if (result.message === "/login?password-updated=1") {
				for (const input of form.querySelectorAll("input"))
					input.value = "";
				location.assign(result.message);
			} else
				setError(
					__("Could not update your password. Please try again."),
				);
		} catch (error) {
			setError(
				error?.responseJSON?.message ||
					__(
						"The link may have expired or the password was rejected. Request another link or try a different password.",
					),
			);
		} finally {
			busy = false;
			canSubmit();
		}
	});
	frappe
		.call({
			method: "lms.lms.account_security.password_policy",
			type: "POST",
		})
		.then((result) => {
			policy = result.message;
			check();
		})
		.catch(() =>
			setError(
				__("Could not load the password policy. Close and try again."),
			),
		);
}

if (document.readyState === "loading")
	document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
