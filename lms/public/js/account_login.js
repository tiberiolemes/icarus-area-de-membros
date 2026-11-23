const tips = [...document.querySelectorAll("[data-auth-tip]")];
if (
	tips.length > 1 &&
	!matchMedia("(prefers-reduced-motion: reduce)").matches
) {
	let active = 0;
	const timer = setInterval(() => {
		if (document.hidden) return;
		tips[active].hidden = true;
		active = (active + 1) % tips.length;
		tips[active].hidden = false;
	}, 8000);
	window.addEventListener("pagehide", () => clearInterval(timer), {
		once: true,
	});
}
