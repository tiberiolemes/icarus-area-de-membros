import { afterEach, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { codeMirrorPhrases } from '@/utils/codeMirrorLocale'

afterEach(() => { delete (window as any).lang })

it('uses the native editor phrase mechanism, preserving replacement markers and authored code', () => {
	;(window as any).lang = 'pt-BR'
	const code = 'def solve(value):\n    return value'
	const state = EditorState.create({ doc: code, extensions: [codeMirrorPhrases()] })
	expect(state.phrase('Fold line')).toBe('Recolher linha')
	expect(state.phrase('replaced $ matches', '3')).toBe('3 ocorrências substituídas')
	expect(state.doc.toString()).toBe(code)
})
