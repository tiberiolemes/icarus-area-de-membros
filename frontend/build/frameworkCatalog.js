import fs from 'node:fs'
import path from 'node:path'

// @framework/ui keeps its symlink for dependency deduplication. Its local
// catalog import must instead resolve from the reviewed framework source.
export function frameworkCatalog() {
	return {
		name: 'tiberio-framework-catalog',
		resolveId(source, importer) {
			if (
				source === '../../../../lms/local/i18n/merged-pt-BR.json' &&
				importer?.endsWith('/@framework/ui/src/utils/translate.ts')
			) {
				return path.resolve(path.dirname(fs.realpathSync(importer)), source)
			}
		},
	}
}
