import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
	base: '/assets/lms/frontend/tours/',
	plugins: [vue()],
	publicDir: false,
	resolve: {
		alias: { '@': path.resolve(import.meta.dirname, 'src') },
		dedupe: ['vue', 'frappe-ui'],
	},
	build: {
		outDir: '../lms/public/frontend/tours',
		emptyOutDir: true,
		cssCodeSplit: false,
		rolldownOptions: {
			input: path.resolve(import.meta.dirname, 'src/tour-desk.js'),
			output: {
				format: 'es',
				entryFileNames: 'icarus-tours.js',
				assetFileNames: (asset) =>
					asset.name?.endsWith('.css')
						? 'icarus-tours.css'
						: 'assets/[name]-[hash][extname]',
			},
		},
	},
})
