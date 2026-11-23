export function localizeUiSource(
	source: string,
	id: string,
	compiler: any,
	messages: Record<string, string>
): { code: string; map: null } | null
