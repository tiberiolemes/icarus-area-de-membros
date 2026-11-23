export function isPortuguese(): boolean
export function translate(message: string, replace: unknown[]): string
export function translate(
	message: string
): string & { format(...args: unknown[]): string }
