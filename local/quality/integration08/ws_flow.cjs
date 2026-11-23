// Native Flow relay metadata/auth only; no provider or model is called.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { io } = createRequire('/home/frappe/frappe-bench/apps/lms/frontend/package.json')('socket.io-client');
const site = 'test_quality08.localhost';
const fixture = JSON.parse(fs.readFileSync(site + '/private/qc08-flow-fixtures.json'));
const helper = process.env.QC08_FLOW_STATE || '/home/frappe/frappe-bench/apps/lms/local/quality/integration08/flow_native_state.py';
const state = args => JSON.parse(execFileSync('/home/frappe/frappe-bench/env/bin/python', [helper], { input: JSON.stringify(args), encoding: 'utf8' }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sockets = [], results = [];
async function login(index) {
	const actor = fixture.actors[index];
	const response = await fetch('http://127.0.0.1:8000/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Frappe-Site-Name': site }, body: JSON.stringify({ usr: actor.user, pwd: actor.password }) });
	assert.equal(response.status, 200);
	const cookie = response.headers.getSetCookie().find(value => value.startsWith('sid=')).split(';')[0];
	const socket = io('http://127.0.0.1:9000/' + site, { transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { Origin: 'http://127.0.0.1:9000', 'X-Frappe-Site-Name': site, Cookie: cookie } });
	const row = { socket, sid: cookie.slice(4), events: [], resubscribe: [] };
	sockets.push(row);
	socket.on('flow:event', event => row.events.push(event.marker));
	socket.on('flow:resubscribe', event => row.resubscribe.push(event.session));
	await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); setTimeout(() => reject(Error('bounded native Flow connect timeout')), 5000).unref(); });
	return row;
}
const subscribe = row => new Promise((resolve, reject) => {
	row.socket.timeout(5000).emit('flow:subscribe', fixture.session, (error, result) => error ? reject(error) : resolve(result.subscribed));
});
async function publish(marker, expected, denied = []) {
	state({ action: 'publish', marker });
	const deadline = Date.now() + 3000;
	while (expected.some(row => !row.events.includes(marker)) && Date.now() < deadline) await pause(20);
	assert(expected.every(row => row.events.includes(marker)), marker + ': legitimate subscriber delivery');
	assert(denied.every(row => !row.events.includes(marker)), marker + ': unauthorized subscriber received a protected Flow frame');
}
(async () => {
	try {
		const owner = await login(0), viewer = await login(1), outsider = await login(2);
		assert.equal(await subscribe(owner), true);
		assert.equal(await subscribe(viewer), false);
		assert.equal(await subscribe(outsider), false);
		await publish('flow-owner-private', [owner], [viewer, outsider]);
		results.push({ case: 'native-owner-private-outsider-denied', passed: true });
		for (let index = 0; index < 3; index++) {
			owner.socket.emit('flow:unsubscribe', fixture.session);
			await pause(2500);
			assert.equal(await subscribe(owner), true, 'legitimate resubscribe after native HTTP keepalive');
			await publish('flow-idle-' + index, [owner], [viewer, outsider]);
		}
		results.push({ case: 'valid-native-subscribe-after-idle', iterations: 3, idle_ms: 2500, passed: true });
		state({ action: 'share' });
		assert.equal(await subscribe(viewer), true);
		await publish('flow-shared-read', [owner, viewer], [outsider]);
		results.push({ case: 'native-read-share', passed: true });
		state({ action: 'unshare' });
		await publish('flow-immediately-after-unshare', [owner], [viewer, outsider]);
		const deadline = Date.now() + 3000;
		while (!viewer.resubscribe.includes(fixture.session) && Date.now() < deadline) await pause(20);
		assert(viewer.resubscribe.includes(fixture.session));
		assert.equal(await subscribe(viewer), false);
		results.push({ case: 'native-share-revocation-before-protected-publication', passed: true });
		state({ action: 'share' });
		assert.equal(await subscribe(viewer), true);
		state({ action: 'revoke', sid: viewer.sid });
		await publish('flow-after-native-sid-revoke', [owner], [viewer, outsider]);
		assert.equal(viewer.socket.connected, false);
		results.push({ case: 'native-session-revocation', passed: true });
		console.log(JSON.stringify({ native_flow_relay: true, cases: results, ...state({ action: 'inspect' }), external_integration_acceptance: false }));
	} finally { for (const row of sockets) row.socket.disconnect(); }
})().catch(error => { console.error(JSON.stringify({ failed: true, cause: error.message, cases_completed: results })); process.exitCode = 1; });
