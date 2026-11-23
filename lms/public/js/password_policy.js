// Shared by the native reset page and the Vue password form.
export const defaultPolicy = { minimum: 8, maximum: 128 };

export function passwordRequirements(password, policy = defaultPolicy) {
	return {
		length:
			[...password].length >= policy.minimum &&
			[...password].length <= policy.maximum,
		upper: /[A-Z]/.test(password),
		lower: /[a-z]/.test(password),
		number: /[0-9]/.test(password),
		symbol: /[^A-Za-z0-9\s]/.test(password),
	};
}

export async function checkBreach(
	password,
	{ fetcher = fetch, cryptoProvider = crypto } = {},
) {
	if (!password) return "empty";
	try {
		const bytes = await cryptoProvider.subtle.digest(
			"SHA-1",
			new TextEncoder().encode(password),
		);
		const digest = [...new Uint8Array(bytes)]
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
			.toUpperCase();
		const response = await fetcher(
			`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`,
			{
				credentials: "omit",
				referrerPolicy: "no-referrer",
				redirect: "error",
				headers: { "Add-Padding": "true" },
				signal: AbortSignal.timeout(5000),
			},
		);
		if (!response.ok) return "unavailable";
		const text = await response.text();
		if (text.length > 256 * 1024 || !text.trim()) return "unavailable";
		const rows = text
			.trim()
			.split(/\r?\n/)
			.map((row) => row.split(":"));
		if (
			rows.some(
				([suffix, count, extra]) =>
					!/^[A-F0-9]{35}$/.test(suffix) ||
					!/^\d+$/.test(count) ||
					extra !== undefined,
			)
		)
			return "unavailable";
		return rows.some(
			([suffix, count]) =>
				suffix === digest.slice(5) && Number(count) > 0,
		)
			? "compromised"
			: "clear";
	} catch {
		return "unavailable";
	}
}
