// EditorJS translates its own chrome through these namespaces, outside Vue.
export function editorI18n() {
	const dictionary = (messages) =>
		Object.fromEntries(messages.map((message) => [message, __(message)]))
	const tools = dictionary([
		'Add a link',
		'Link',
		'Text',
		'Heading',
		'Heading 1',
		'Heading 2',
		'Heading 3',
		'Heading 4',
		'Heading 5',
		'Heading 6',
		'Title',
		'Message',
		'Ordered',
		'Unordered',
		'Checklist',
		'With headings',
		'Without headings',
		'Add column to left',
		'Add column to right',
		'Delete column',
		'Add row above',
		'Add row below',
		'Delete row',
		'Stretch',
		'Background',
		'Border',
		'Caption',
		'Enter a caption',
		'Select an Image',
		'Couldn’t upload image. Please try another.',
		'The block can not be displayed correctly.',
	])
	return {
		direction: document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr',
		messages: {
			ui: {
				blockTunes: {
					toggler: dictionary(['Click to tune', 'or drag to move']),
				},
				inlineToolbar: { converter: dictionary(['Convert to']) },
				toolbar: { toolbox: dictionary(['Add', 'Filter', 'Nothing found']) },
				popover: dictionary(['Filter', 'Nothing found', 'Convert to']),
			},
			toolNames: dictionary([
				'Text',
				'Heading',
				'List',
				'Warning',
				'Checklist',
				'Quote',
				'Code',
				'Delimiter',
				'Raw HTML',
				'Table',
				'Link',
				'Marker',
				'Bold',
				'Italic',
				'InlineCode',
				'Image',
				'Embed',
			]),
			tools: Object.fromEntries(
				[
					'paragraph',
					'markdown',
					'header',
					'list',
					'link',
					'image',
					'table',
					'stub',
					'embed',
				].map((name) => [name, tools])
			),
			blockTunes: {
				delete: dictionary(['Delete', 'Click to delete']),
				moveUp: dictionary(['Move up']),
				moveDown: dictionary(['Move down']),
			},
		},
	}
}
