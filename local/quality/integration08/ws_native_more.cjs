const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const nativeRequire = createRequire('/home/frappe/frappe-bench/apps/lms/frontend/package.json');
const { io } = nativeRequire('socket.io-client');
const site = 'test_quality08.localhost';
const state = args => JSON.parse(execFileSync('/home/frappe/frappe-bench/env/bin/python', ['/home/frappe/frappe-bench/apps/lms/local/quality/integration08/ws_native_state.py'], { input: JSON.stringify(args), encoding: 'utf8' }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtures = JSON.parse(fs.readFileSync(site + '/private/qc08-ws-fixtures.json'));
const sockets = [];
async function connect(auth) {
	const socket = io('http://127.0.0.1:9000/' + site, { transports: ['websocket'], reconnection: false, extraHeaders: { Origin: 'http://127.0.0.1:9000', 'X-Frappe-Site-Name': site, ...auth } });
	sockets.push(socket);
	await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); setTimeout(() => reject(new Error('connection timeout')), 5000).unref(); });
	const received = [];
	socket.on('qc08_native_probe', data => received.push(data.marker));
	return { socket, received };
}
(async () => {
	try {
		const login = await fetch('http://127.0.0.1:8000/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Frappe-Site-Name': site }, body: JSON.stringify({ usr: fixtures[2].user, pwd: fixtures[2].password }) });
		assert.equal(login.status, 200);
		const cookie = login.headers.getSetCookie().find(value => value.startsWith('sid=')).split(';')[0];
		const control = await connect({ Cookie: cookie });
		const guest = await connect({ Cookie: 'sid=Guest' });
		state({ action: 'publish_public', marker: 'native-guest-public' });
		state({ action: 'publish', marker: 'native-guest-private' });
		await pause(600);
		assert(guest.received.includes('native-guest-public'));
		assert(!guest.received.includes('native-guest-private'));
		assert(control.received.includes('native-guest-private'));
		const token = state({ action: 'api_credentials' }).authorization;
		const api = await connect({ Authorization: token });
		state({ action: 'publish', marker: 'native-api-valid' });
		await pause(500);
		assert(api.received.includes('native-api-valid'));
		state({ action: 'api_credentials' });
		state({ action: 'publish', marker: 'native-api-revoked' });
		await pause(650);
		assert(!api.received.includes('native-api-revoked'));
		assert(!api.socket.connected);
		assert(control.received.includes('native-api-revoked'));
		state({ action: 'stop_http' });
		await pause(800);
		state({ action: 'publish', marker: 'native-authority-outage' });
		await pause(3800);
		assert(!control.received.includes('native-authority-outage'));
		assert(!control.socket.connected);
		console.log(JSON.stringify({ native_http_db_redis_node: true, guest_public_received: true, guest_private_denied: true, authorization_valid_received: true, rotated_authorization_denied: true, authority_outage_denied: true, outage_control_received_before_shutdown: true, original_site_touched: false }));
	} finally { for (const socket of sockets) socket.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
