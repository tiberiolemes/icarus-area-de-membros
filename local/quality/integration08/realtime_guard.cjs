// Revalidate at delivery, including adapter broadcasts and direct Socket packets.
const { createRequire } = require('node:module');
const nativeRequire = createRequire('/home/frappe/frappe-bench/apps/frappe/package.json');
const { Adapter } = nativeRequire('socket.io-adapter');
let running = 0;
const waiting = [];
const MAX_PENDING = 128;
const MAX_CONCURRENT = 8;
const TIMEOUT = 3000;

function bounded(work) {
	return new Promise((resolve) => {
		if (waiting.length >= MAX_PENDING) return resolve(false);
		const queuedAt = Date.now();
		const start = async () => {
			if (Date.now() - queuedAt >= TIMEOUT) return resolve(false);
			running++;
			try { resolve(await work()); } catch { resolve(false); }
			finally {
				running--;
				while (running < MAX_CONCURRENT && waiting.length) waiting.shift()();
			}
		};
		if (running < MAX_CONCURRENT) start(); else waiting.push(start);
	});
}

async function valid(socket) {
	if (!socket.connected || typeof socket.frappe_request !== 'function') return false;
	const user = socket.user;
	const allowed = await bounded(async () => {
		const response = await socket.frappe_request('/api/method/frappe.realtime.get_user_info', {}, {
			signal: AbortSignal.timeout(TIMEOUT),
		});
		if (!response.ok) return false;
		const body = await response.json();
		return body.message?.user === user && Array.isArray(body.message?.installed_apps);
	});
	if (!allowed && socket.connected) socket.disconnect(true);
	return allowed && socket.connected && socket.user === user;
}

class SessionAdapter extends Adapter {
	async authorizedOptions(opts) {
		const sockets = [];
		this.apply(opts, (socket) => sockets.push(socket));
		// Group only within this publication; no cached authority survives a revocation.
		const credentials = new Map();
		for (const socket of sockets) {
			const key = JSON.stringify([socket.user, socket.sid, socket.authorization_header]);
			if (!credentials.has(key)) credentials.set(key, valid(socket));
		}
		const rooms = new Set();
		for (const socket of sockets) {
			const key = JSON.stringify([socket.user, socket.sid, socket.authorization_header]);
			if (await credentials.get(key) && socket.connected) rooms.add(socket.id);
			else if (socket.connected) socket.disconnect(true);
		}
		return { ...opts, rooms };
	}
	broadcast(packet, opts) {
		this.authorizedOptions(opts).then((allowed) => {
			if (allowed.rooms.size) super.broadcast(packet, allowed);
		}).catch(() => {}); // Authority failure never emits protected data.
	}
	broadcastWithAck(packet, opts, count, ack) {
		this.authorizedOptions(opts).then((allowed) => {
			if (allowed.rooms.size) super.broadcastWithAck(packet, allowed, count, ack);
			else count(0);
		}).catch(() => count(0));
	}
}

function install(io) { io.adapter(SessionAdapter); }
function protectSocket(socket) {
	const packet = socket.packet.bind(socket);
	socket.packet = (data, opts) => {
		if (![2, 5].includes(data.type)) return packet(data, opts);
		valid(socket).then((allowed) => { if (allowed) packet(data, opts); });
	};
}
module.exports = { install, protectSocket, valid };
