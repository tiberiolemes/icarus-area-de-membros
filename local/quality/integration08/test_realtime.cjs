// Real Socket.IO wire with an explicit synthetic authority, no product site.
const assert = require('node:assert/strict');
const http = require('node:http');
const { createRequire } = require('node:module');
const native = createRequire('/home/frappe/frappe-bench/apps/frappe/package.json');
const { Server } = native('socket.io');
const { io: client } = createRequire('/home/frappe/frappe-bench/apps/lms/frontend/package.json')('socket.io-client');
const guard = require('./realtime_guard.cjs');
const server = http.createServer();
const io = new Server(server);
guard.install(io);
const authority = new Map();
const clients = [];
let requests = 0;
io.on('connection', socket => {
	socket.user = socket.handshake.auth.user;
	socket.sid = socket.handshake.auth.sid;
	socket.frappe_request = async (path, args, opts) => {
		requests++;
		assert.equal(path, '/api/method/frappe.realtime.get_user_info');
		assert.deepEqual(args, {});
		assert.ok(opts.signal);
		if (authority.get(socket.sid) === 'unavailable') throw new Error('synthetic outage');
		return { ok: true, json: async () => ({ message: {
			user: authority.get(socket.sid) ? socket.user : 'Guest', installed_apps: ['frappe', 'lms'],
		} }) };
	};
	guard.protectSocket(socket);
	socket.join('private');
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect(sid, user='synthetic@example.invalid') {
	authority.set(sid, true);
	const c = client(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], forceNew: true, reconnection: false, auth: { sid, user } });
	clients.push(c);
	await new Promise((resolve, reject) => { c.once('connect', resolve); c.once('connect_error', reject); });
	return c;
}
async function check(kind, invalidState) {
	const a = await connect('invalid-'+kind), b = await connect('valid-'+kind);
	const got = [];
	a.on('proof', () => got.push('invalid')); b.on('proof', () => got.push('valid'));
	authority.set('invalid-'+kind, invalidState);
	if (kind === 'direct') {
		io.sockets.sockets.get(a.id).emit('proof', {});
		io.sockets.sockets.get(b.id).emit('proof', {});
	} else io.to('private').emit('proof', {});
	await sleep(100);
	assert.deepEqual(got, ['valid'], kind);
	a.close(); b.close();
}
(async () => {
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		await check('broadcast', false);
		await check('direct', false);
		await check('outage', 'unavailable');
		const c = await connect('public', 'Guest');
		const got = new Promise(resolve => c.once('public-proof', resolve));
		io.to(c.id).emit('public-proof', 'public');
		assert.equal(await got, 'public');
		console.log(JSON.stringify({ real_socket_io: true, authority: 'double', broadcast_revocation: true,
			direct_revocation: true, outage_denied: true, guest_public: true, requests,
			product_site_test: false, no_activity_refresh: true }));
	} finally {
		clients.forEach(c => c.close());
		await new Promise(resolve => io.close(resolve));
	}
})().catch(error => { console.error(error); process.exitCode = 1; });
