import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'
import messages from '../../../local/i18n/merged-pt-BR.json'

it('keeps the closed native launcher out of layout and renders a failed start in Portuguese', async () => {
	const source = fs.readFileSync('../..' + '/frappe/frappe/public/js/flow_launcher.bundle.js', 'utf8')
		.replace(/^import .*;$/gm, '').split('// not inside frames;')[0]
	const ready = Promise.reject(new Error('Synthetic mount failure; no network'))
	const island = { ready }
	const mountIsland = vi.fn(() => island)
	const listener = vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
	const styles = new Set(document.head.children)
	const rootStyle = document.documentElement.getAttribute('style')
	const context: any = {
		exports: {}, localMessages: messages, document, mountIsland,
		window: { addEventListener: vi.fn(), requestIdleCallback: vi.fn() },
		location: { pathname: '/lms', origin: 'http://tiberio.localhost:8088' },
		localStorage: { getItem: () => null, setItem: vi.fn() },
		innerWidth: 390, innerHeight: 844,
		MutationObserver: class { observe() {} },
		setTimeout: vi.fn(), clearTimeout: vi.fn(), console: { error: vi.fn() },
	}
	let launcher: any
	try {
		vm.runInNewContext(source + '\nexports.Launcher = FlowLauncher', context)
		launcher = new context.exports.Launcher()
		expect(launcher.panel.hidden).toBe(true)
		expect(launcher.chat.hidden).toBe(true)
		expect(launcher.panel.getAttribute('aria-label')).toBe('Assistente de IA')
		launcher.open({ focus: false, slide: false })
		await ready.catch(() => {})
		expect(launcher.panel.hidden).toBe(false)
		expect(launcher.chat.hidden).toBe(false)
		expect(launcher.host.hasAttribute('data-failed')).toBe(true)
		expect(launcher.panel.querySelector('.failed').textContent).toContain('Não foi possível iniciar o assistente.')
		expect(launcher.panel.querySelector('.reload').textContent).toBe('Recarregar página')
		expect(launcher.panel.querySelector('.close').textContent).toBe('Fechar')
		launcher.minimize()
		expect(launcher.panel.hidden).toBe(true)
		expect(launcher.chat.hidden).toBe(true)
		launcher.open({ focus: false, slide: false })
		expect(launcher.island).toBe(island)
		expect(mountIsland).toHaveBeenCalledTimes(1)
	} finally {
		launcher?.host.remove()
		for (const style of document.head.children) if (!styles.has(style)) style.remove()
		if (rootStyle === null) document.documentElement.removeAttribute('style')
		else document.documentElement.setAttribute('style', rootStyle)
		document.documentElement.removeAttribute('data-flow-sliding')
		document.documentElement.removeAttribute('data-flow-docked')
		listener.mockRestore()
	}
})
