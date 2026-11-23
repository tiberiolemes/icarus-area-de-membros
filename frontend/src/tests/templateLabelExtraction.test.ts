import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
it('extracts nested button object labels as expressions and skips already localized values', () => {
 const script = path.resolve(import.meta.dirname, '../../../local/i18n/audit_template_labels.cjs')
 const source = `<template><Button :button="{ icon: 'dots', label: 'App Options' }" :options="[{ label: 'Expand', value: 'id' }, { label: __pt('Delete'), value: 'delete' }]" /></template>`
 const rows = JSON.parse(execFileSync(process.execPath, [script], { input: JSON.stringify({ 'fixture.vue': source }), encoding: 'utf8' }))
 expect(rows.map((r: any) => r.source)).toEqual(['App Options', 'Expand'])
 for (const row of rows) expect(source.slice(row.start, row.end)).toBe(`'${row.source}'`)
})
