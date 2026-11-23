// Translate presentation literals and repair reviewed keyboard controls before Vue/Vite
// compiles them. Technical names, values, routes and user data are never changed.
export function localizeUiSource(source, id, compiler, messages) {
	// Vue's virtual script modules already contain the transformed SFC imports.
	// Translating those again would duplicate the helper binding.
	if (id.includes('?')) return null
	let nativeImport = false
	let rewritten = false
	const rewrite = (before, after) => {
		if (!source.includes(before)) throw new Error('Unsupported pinned UI source: ' + id)
		source = source.replace(before, after)
		rewritten = true
	}
	if (id.endsWith('/DatePicker/DateRangePicker.vue')) {
		rewrite("raw.replace(/\\s+to\\s+/i, ',')", "raw.replace(/\\s+(?:to|a)\\s+/i, ',')")
	}
	if (id.endsWith('/experimental/Calendar/calendarUtils.ts')) {
		rewrite("date.toLocaleDateString('en-US', options)", "date.toLocaleDateString('pt-BR', options)")
	}
	if (id.endsWith('/experimental/Calendar/Calendar.vue')) {
		rewrite("timeFormat: '12h'", "timeFormat: '24h'")
	}
	if (id.endsWith('/experimental/Calendar/CalendarAgenda.vue')) {
		rewrite('Nothing on between {{ spanLabel }}.', '{{ __("Nothing on between {0}.").format(spanLabel) }}')
	}
	if (id.endsWith('/experimental/Calendar/CalendarWeekDayEvent.vue') ||
		id.endsWith('/experimental/Calendar/CalendarMonthEvent.vue')) {
		const weekDay = id.endsWith('/CalendarWeekDayEvent.vue')
		const className = weekDay
			? 'event mx-px rounded-4 transition-all duration-75 shrink-0'
			: 'event flex rounded-4 transition-all duration-75 overflow-hidden'
		rewrite(`class="${className}"`, `class="${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-5"\n      role="button"\n      tabindex="0"\n      :aria-label="props.event.title || '[No title]'"\n      @keydown.enter.stop.prevent="onKeydown($event)"\n      @keydown.space.stop.prevent="onKeydown($event)"`)
		rewrite('  eventBgStyle,\n', '  eventBgStyle,\n  markActive,\n')
		if (!weekDay) rewrite('  calendarEvent,\n', '  calendarEvent,\n  calendarActions,\n')
		// Use the installed Agenda's keyboard path; the pointer handler rejects detail=0.
		rewrite('} = useEventBase(props)', `} = useEventBase(props)

function onKeydown(e: KeyboardEvent) {
  markActive()
  if (calendarActions.props.onClick) {
    calendarActions.props.onClick({ e, calendarEvent: calendarEvent.value })
  } else {
    isPopoverOpen.value = !isPopoverOpen.value
  }
}`)
	}
	if (id.endsWith('/experimental/SpriteIcons/IconPicker.vue')) {
		rewrite('No icons found for "{{ searchTerm }}"', '{{ __(\'No icons found for "{0}"\').format(searchTerm) }}')
	}
	if (id.endsWith('/KeyboardShortcut/KeyboardShortcut.vue')) {
		const original = "return 'Shortcut ' + sequences.join(', or ')"
		if (!source.includes(original)) throw new Error('Unsupported KeyboardShortcut source')
		source = source.replace(original, `return __lmsTranslate('Shortcut {0}', [sequences.join(__lmsTranslate(', or', []) + ' ')])`)
		nativeImport = true
	}
	const edits = []
	const known = (text) => Object.hasOwn(messages, text)
	const call = (text) => `__lmsTranslate(${JSON.stringify(text)}, [])`
	const edit = (start, end, text) => edits.push({ start, end, text })
	if (id.endsWith('/Combobox/Combobox.vue')) {
		const trigger = source.indexOf('<ComboboxTrigger\n')
		if (trigger < 0) throw new Error('Unsupported Combobox source')
		edit(trigger + '<ComboboxTrigger\n'.length, trigger + '<ComboboxTrigger\n'.length,
			'                :aria-label="__lmsTranslate(&quot;Show popup&quot;, [])"\n')
		nativeImport = true
	}
	if (id.endsWith('/Toast/ToastProvider.vue')) {
		const toaster = source.indexOf('<Toaster\n')
		const options = source.indexOf('      unstyled: true,')
		if (toaster < 0 || options < 0) throw new Error('Unsupported ToastProvider source')
		edit(toaster + '<Toaster\n'.length, toaster + '<Toaster\n'.length,
			'    :container-aria-label="__lmsTranslate(&quot;Notifications&quot;, [])"\n')
		edit(options, options, '      closeButtonAriaLabel: __lmsTranslate(\'Close notification\', []),\n')
		nativeImport = true
	}
	const fields = new Set([
		'label',
		'title',
		'subtitle',
		'description',
		'placeholder',
		'message',
		'tooltip',
		'text',
		'default',
		'todayLabel',
		'emptyText',
		'emptyMessage',
		'format',
	])
	const scripts = []
	let descriptor
	if (id.endsWith('.vue')) {
		descriptor = compiler.parse(source, { filename: id }).descriptor
		if (descriptor.template) {
			const template = descriptor.template
			const offset = template.loc.start.offset
			const expression = (value, attribute = false) => {
				if (!value?.content) return
				let ast
				try {
					ast = compiler.babelParse(value.content, { plugins: ['typescript'] })
				} catch {
					return
				}
				const walkExpression = (node, parent) => {
					if (!node || typeof node !== 'object') return
					if (node.type === 'CallExpression' && ['__', '__lmsTranslate'].includes(node.callee?.name)) return
					if (node.type === 'TemplateLiteral' && node.expressions.length) {
						const key = node.quasis.map((part, i) => part.value.cooked + (i < node.expressions.length ? `{${i}}` : '')).join('')
						if (known(key)) {
							let translated = `__lmsTranslate(${JSON.stringify(key)}, [${node.expressions.map(part => value.content.slice(part.start, part.end)).join(', ')}])`
							if (attribute) translated = translated.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
							edit(offset + value.loc.start.offset + node.start, offset + value.loc.start.offset + node.end, translated)
							nativeImport = true
							return
						}
					}
					if (
						node.type === 'StringLiteral' &&
						known(node.value) &&
						parent?.type !== 'BinaryExpression'
					) {
						let translated = `__(${JSON.stringify(node.value)})`
						if (attribute)
							translated = translated
								.replaceAll('&', '&amp;')
								.replaceAll('"', '&quot;')
								.replaceAll("'", '&#39;')
						edit(
							offset + value.loc.start.offset + node.start,
							offset + value.loc.start.offset + node.end,
							translated
						)
					}
					for (const [key, child] of Object.entries(node)) {
						if (['loc', 'extra', 'comments'].includes(key)) continue
						if (Array.isArray(child))
							child.forEach((item) => walkExpression(item, node))
						else if (child && typeof child === 'object')
							walkExpression(child, node)
					}
				}
				walkExpression(ast, null)
			}
			const walk = (node) => {
				if (node.type === 5) expression(node.content)
				if (node.type === 2 && known(node.content.trim())) {
					const text = node.content.trim()
					edit(
						offset + node.loc.start.offset,
						offset + node.loc.end.offset,
						node.content.replace(text, `{{ __(${JSON.stringify(text)}) }}`)
					)
				}
				for (const attr of node.props || []) {
					if (
						attr.type === 7 &&
						attr.name === 'bind' &&
						(fields.has(attr.arg?.content) ||
							attr.arg?.content === 'aria-label' ||
							attr.arg?.content === 'alt')
					)
						expression(attr.exp, true)
					if (
						attr.type !== 6 ||
						!attr.value ||
						![
							'label',
							'title',
							'placeholder',
							'aria-label',
							'alt',
							'description',
							'text',
							'today-label',
						].includes(attr.name) ||
						!known(attr.value.content)
					)
						continue
					const boundExpression = `__(${JSON.stringify(attr.value.content)})`
						.replaceAll('&', '&amp;')
						.replaceAll('"', '&quot;')
					edit(
						offset + attr.loc.start.offset,
						offset + attr.loc.end.offset,
						`:${attr.name}="${boundExpression}"`
					)
				}
				for (const child of node.children || []) walk(child)
			}
			walk(compiler.baseParse(template.content))
		}
		for (const script of [descriptor.script, descriptor.scriptSetup].filter(
			Boolean
		))
			scripts.push({ source: script.content, offset: script.loc.start.offset })
	} else scripts.push({ source, offset: 0 })
	let needsImport = nativeImport
	for (const script of scripts) {
		const ast = compiler.babelParse(script.source, {
			sourceType: 'module',
			plugins: ['typescript'],
		})
		const walk = (node, parent) => {
			if (!node || typeof node !== 'object') return
			if (node.type === 'StringLiteral' && known(node.value) && parent) {
				const property =
					parent.type === 'ObjectProperty' &&
					parent.value === node &&
					fields.has(parent.key.name || parent.key.value)
				const assignment =
					parent.type === 'AssignmentExpression' && parent.right === node
				const conditional =
					parent.type === 'ConditionalExpression' &&
					(parent.consequent === node || parent.alternate === node)
				const error =
					parent.type === 'NewExpression' &&
					['Error', 'UploadError'].includes(parent.callee.name)
				if (property || assignment || conditional || error) {
					edit(
						script.offset + node.start,
						script.offset + node.end,
						call(node.value)
					)
					needsImport = true
				}
			}
			// The calendar ships English initials instead of using dayjs's locale.
			if (
				node.type === 'VariableDeclarator' &&
				(node.id.name === 'WEEKDAYS' ||
					(id.endsWith('/experimental/Calendar/calendarUtils.ts') &&
						['monthList', 'daysList', 'daysListFull'].includes(node.id.name))) &&
				node.init?.type === 'ArrayExpression'
			) {
				edit(
					script.offset + node.init.start,
					script.offset + node.init.end,
					`[${(node.id.name === 'WEEKDAYS'
						? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
						: node.init.elements.map(item => item.value))
						.map(call)
						.join(', ')}]`
				)
				needsImport = true
				return
			}
			if (node.type === 'TemplateLiteral' && node.expressions.length) {
				const key = node.quasis
					.map(
						(part, i) =>
							part.value.cooked + (i < node.expressions.length ? `{${i}}` : '')
					)
					.join('')
				if (known(key)) {
					const args = node.expressions
						.map((part) => script.source.slice(part.start, part.end))
						.join(', ')
					edit(
						script.offset + node.start,
						script.offset + node.end,
						`__lmsTranslate(${JSON.stringify(key)}, [${args}])`
					)
					needsImport = true
					return
				}
			}
			for (const [key, value] of Object.entries(node)) {
				if (
					[
						'loc',
						'start',
						'end',
						'extra',
						'comments',
						'leadingComments',
						'trailingComments',
					].includes(key)
				)
					continue
				if (Array.isArray(value)) value.forEach((child) => walk(child, node))
				else if (value && typeof value === 'object') walk(value, node)
			}
		}
		walk(ast, null)
	}
	if (!edits.length && !nativeImport && !rewritten) return null
	if (needsImport) {
		const statement = `\nimport { translate as __lmsTranslate } from '@/translationMessages'\n`
		if (descriptor) {
			const script = descriptor.scriptSetup || descriptor.script
			if (script)
				edit(script.loc.start.offset, script.loc.start.offset, statement)
		} else edit(0, 0, statement)
	}
	for (const change of edits.sort((a, b) => b.start - a.start))
		source =
			source.slice(0, change.start) + change.text + source.slice(change.end)
	return { code: source, map: null }
}
