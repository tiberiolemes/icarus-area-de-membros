import { EditorState } from '@codemirror/state'
import { translate } from '@/translationMessages'

// Native CodeMirror phrase facet: editor controls change, authored code does not.
const phrases = ['Find', 'Go to line', 'Replace', 'all', 'by word', 'close', 'current match',
	'go', 'match case', 'next', 'on line', 'previous', 'regexp', 'replace', 'replace all',
	'replaced $ matches', 'replaced match on line $', 'Control character', 'Fold line',
	'Folded lines', 'Unfold line', 'Unfolded lines', 'folded code', 'to', 'unfold',
	'Completions', 'Diagnostics', 'No diagnostics']

export const codeMirrorPhrases = () => EditorState.phrases.of(
	Object.fromEntries(phrases.map(phrase => [phrase, translate(phrase)]))
)
