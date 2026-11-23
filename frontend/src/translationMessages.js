import qualityMessages from '../../local/i18n/quality-pt-BR.json'
import communityMessages from '../../local/i18n/community-pt-BR.json'
import portugueseMessages from '../../local/i18n/lms-pt-BR.json'
import contextualMessages from '../../local/i18n/context-overrides-pt-BR.json'
import authMessages from '../../local/quality/auth/pt-BR.json'
import privacyMessages from '../../local/i18n/privacy07-pt-BR.json'
import formMessages from '../../docs/audit/quality/evidence/02-new-messages.json'
import childMessages from '../../docs/audit/quality/evidence/11-child-content-pt-BR.json'
import integratedMessages from '../../local/i18n/integration08-pt-BR.json'

export const isPortuguese = () =>
	/^pt(?:[-_]br)?$/i.test(window.lang || document.documentElement.lang)

function fill(message, args) {
	return message.replace(/{(\d+)}/g, (match, number) =>
		typeof args[number] !== 'undefined' ? args[number] : match
	)
}

// Shared with dependency source adaptations; no resource or UI imports here.
export function translate(message, replace) {
	const lookup = (messages) =>
		Object.hasOwn(messages, message) &&
		typeof messages[message] === 'string'
			? messages[message]
			: undefined
	const translatedMessage =
		(isPortuguese() &&
			(lookup(contextualMessages) ||
				lookup(privacyMessages) ||
				lookup(authMessages) ||
				lookup(childMessages) ||
				lookup(formMessages) ||
				lookup(communityMessages) ||
				lookup(qualityMessages) ||
				lookup(integratedMessages) ||
				lookup(portugueseMessages))) ||
		lookup(window.translatedMessages || {}) ||
		message
	if (Array.isArray(replace)) return fill(translatedMessage, replace)
	if (!/{\d+}/.test(message)) return translatedMessage
	return { format: (...args) => fill(translatedMessage, args) }
}
