import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { frameworkCatalog } from '../../build/frameworkCatalog.js'

describe('linked framework catalog resolution', () => {
	it('resolves the catalog through the real framework source, preserving other imports', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-catalog-'))
		try {
			const ui = path.join(root, 'apps/frappe/ui')
			fs.mkdirSync(path.join(ui, 'src/utils'), { recursive: true })
			fs.writeFileSync(path.join(ui, 'src/utils/translate.ts'), '')
			const modules = path.join(root, 'apps/lms/frontend/node_modules/@framework')
			fs.mkdirSync(modules, { recursive: true })
			fs.symlinkSync(ui, path.join(modules, 'ui'))
			const importer = path.join(modules, 'ui/src/utils/translate.ts')
			const plugin = frameworkCatalog()
			expect(plugin.resolveId('../../../../lms/local/i18n/merged-pt-BR.json', importer))
				.toBe(path.join(root, 'apps/lms/local/i18n/merged-pt-BR.json'))
			expect(plugin.resolveId('vue', importer)).toBeUndefined()
		} finally {
			fs.rmSync(root, { recursive: true, force: true })
		}
	})
})
