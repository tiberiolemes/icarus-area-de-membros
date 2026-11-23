import { afterEach, describe, expect, it, vi } from 'vitest'
import { initSocket } from '@/socket'

const { io } = vi.hoisted(() => ({ io: vi.fn(() => ({ connected: false })) }))
vi.mock('socket.io-client', () => ({ io }))
afterEach(() => {
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
	io.mockClear()
})

describe('native realtime through the served application origin', () => {
	it.each([
		'http://tiberio.localhost:8088',
		'https://academy.example.test:8443',
		'https://academy.example.test',
	])('keeps production scheme and public port for %s', (origin) => {
		vi.stubEnv('DEV', false)
		vi.stubGlobal('window', {
			location: new URL(origin),
			site_name: 'tiberio.localhost',
		})
		initSocket()
		expect(io).toHaveBeenCalledWith(`${origin}/tiberio.localhost`, {
			withCredentials: true,
			reconnectionAttempts: 5,
		})
	})
	it('retains the separate configured native port for the Vite development server', () => {
		vi.stubEnv('DEV', true)
		vi.stubGlobal('window', {
			location: new URL('http://tiberio.localhost:5173'),
		})
		initSocket()
		expect(io).toHaveBeenCalledWith(
			'http://tiberio.localhost:9000/tiberio.localhost',
			expect.any(Object)
		)
	})
})
