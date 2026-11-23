// Source-only audit. Run with the already installed framework compiler/parser;
// accepts {path: source} on stdin and returns evidence without writing files.
const { parse: parseSfc } = require(process.env.SFC_COMPILER ||
	'@vue/compiler-sfc')
const { parse: parseJs } = require(process.env.JS_PARSER || '@babel/parser')
;(async () => {
	let input = ''
	for await (const chunk of process.stdin) input += chunk
	const files = JSON.parse(input)
	const result = {
		text: [],
		attributes: [],
		descriptors: [],
		calls: [],
		templates: [],
		errors: [],
	}
	const fields = new Set([
		'label',
		'title',
		'subtitle',
		'description',
		'placeholder',
		'message',
		'tooltip',
		'help',
		'emptyMessage',
		'buttonText',
		'caution',
	])
	for (const [path, source] of Object.entries(files)) {
		const record = (group, text, line, extra = {}) => {
			if (text && /[A-Za-z]/.test(text))
				result[group].push({ path, line, text, ...extra })
		}
		const scripts = []
		if (path.endsWith('.vue')) {
			const { descriptor, errors } = parseSfc(source, { filename: path })
			for (const error of errors)
				result.errors.push({ path, message: String(error) })
			if (descriptor.template) {
				const { baseParse } = require(process.env.DOM_COMPILER ||
					'@vue/compiler-dom')
				try {
					const ast = baseParse(descriptor.template.content, {
						onError: () => {},
					})
					const offset = descriptor.template.loc.start.line - 1
					const visit = (node) => {
						if (node.type === 2)
							record('text', node.content.trim(), offset + node.loc.start.line)
						if (node.props)
							for (const attr of node.props) {
								if (
									attr.type === 6 &&
									attr.value &&
									[
										'label',
										'title',
										'subtitle',
										'placeholder',
										'aria-label',
										'alt',
										'description',
										'text',
									].includes(attr.name)
								) {
									record(
										'attributes',
										attr.value.content,
										offset + attr.loc.start.line,
										{ attribute: attr.name }
									)
								}
							}
						for (const child of node.children || []) visit(child)
						for (const branch of node.branches || []) visit(branch)
					}
					visit(ast)
				} catch (error) {
					result.errors.push({ path, message: String(error) })
				}
			}
			for (const script of [descriptor.script, descriptor.scriptSetup].filter(
				Boolean
			))
				scripts.push({
					content: script.content,
					offset: script.loc.start.line - 1,
				})
		} else scripts.push({ content: source, offset: 0 })
		for (const { content, offset } of scripts) {
			try {
				const ast = parseJs(content, {
					sourceType: 'module',
					plugins: ['typescript'],
				})
				const walk = (node) => {
					if (!node || typeof node !== 'object') return
					if (node.type === 'CallExpression' && node.callee.name === '__') {
						const values = (value) => {
							if (!value) return
							if (value.type === 'StringLiteral')
								record('calls', value.value, offset + value.loc.start.line)
							else if (
								value.type === 'TemplateLiteral' &&
								!value.expressions.length
							)
								record(
									'calls',
									value.quasis[0].value.cooked,
									offset + value.loc.start.line
								)
							else if (value.type === 'LogicalExpression') {
								values(value.left)
								values(value.right)
							} else if (value.type === 'ConditionalExpression') {
								values(value.consequent)
								values(value.alternate)
							}
						}
						values(node.arguments[0])
					}
					if (
						node.type === 'CallExpression' &&
						['deleteRow', 'toggleRowField'].includes(node.callee.name)
					) {
						for (const arg of node.arguments.slice(1))
							if (arg.type === 'StringLiteral')
								record('descriptors', arg.value, offset + arg.loc.start.line, {
									field: node.callee.name,
								})
					}
					if (node.type === 'TemplateLiteral') {
						const text = node.quasis
							.map(
								(part, i) =>
									part.value.cooked +
									(i < node.expressions.length ? `{${i}}` : '')
							)
							.join('')
						if (text.length < 500)
							record('templates', text, offset + node.loc.start.line)
					}
					if (
						node.type === 'ObjectProperty' &&
						fields.has(node.key.name || node.key.value) &&
						node.value.type === 'StringLiteral'
					) {
						record(
							'descriptors',
							node.value.value,
							offset + node.value.loc.start.line,
							{ field: node.key.name || node.key.value }
						)
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
						if (Array.isArray(value)) value.forEach(walk)
						else if (value && typeof value === 'object') walk(value)
					}
				}
				walk(ast)
			} catch (error) {
				result.errors.push({ path, message: String(error) })
			}
		}
	}
	process.stdout.write(JSON.stringify(result))
})().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
