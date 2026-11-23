// Native HTTP, MariaDB, Redis and the selected Node server; no authority doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const nativeRequire = createRequire('/home/frappe/frappe-bench/apps/lms/frontend/package.json');
const { io } = nativeRequire('socket.io-client');
const site = 'test_quality08.localhost';
const state = (args) => JSON.parse(execFileSync('/home/frappe/frappe-bench/env/bin/python', ['/home/frappe/frappe-bench/apps/lms/local/quality/integration08/ws_native_state.py'], { input: JSON.stringify(args), encoding: 'utf8' }));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtures = JSON.parse(fs.readFileSync(site + '/private/qc08-ws-fixtures.json'));
const sessions = [];
const results = [];
async function http(path, sid, values) {
	return fetch('http://127.0.0.1:8000' + path, { method: values ? 'POST' : 'GET', headers: { 'X-Frappe-Site-Name': site, ...(sid ? { Cookie: 'sid=' + sid } : {}), ...(values ? { 'Content-Type': 'application/json' } : {}) }, ...(values ? { body: JSON.stringify(values) } : {}) });
}
async function login(index) {
	const response = await http('/api/method/login', null, { usr: fixtures[index].user, pwd: fixtures[index].password });
	assert.equal(response.status, 200, 'synthetic native login');
	const cookie = response.headers.getSetCookie().find(value => value.startsWith('sid='));
	assert(cookie);
	const sid = cookie.split(';')[0].slice(4);
	const socket = io('http://127.0.0.1:9000/' + site, { transports: ['websocket'], reconnection: false, extraHeaders: { Origin: 'http://127.0.0.1:9000', 'X-Frappe-Site-Name': site, Cookie: 'sid=' + sid } });
	await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); setTimeout(() => reject(new Error('connection timeout')), 5000).unref(); });
	const session = { sid, socket, events: [], receivedAt: {}, pongs: 0 };
	socket.on('qc08_native_probe', data => { session.events.push(data.marker); session.receivedAt[data.marker] = Date.now(); });
	socket.on('pong', () => session.pongs++);
	sessions.push(session);
	return session;
}
async function barrier(label, rejected, control) {
	const marker = label + '-' + Date.now();
	const started = Date.now();
	state({ action: 'publish', marker });
	await pause(650);
	assert(control.events.includes(marker), label + ': valid recipient');
	assert(!rejected.events.includes(marker), label + ': rejected bridge delivery');
	assert.equal(rejected.socket.connected, false, label + ': server disconnect');
	results.push({ case: label, protected_bridge_denied: true, control_received: true, observation_barrier_ms: Date.now() - started, publish_request_to_control_ms: control.receivedAt[marker] - started });
}
async function directBarrier(label, rejected, control) {
	const rejectedPongs = rejected.pongs, validPongs = control.pongs;
	rejected.socket.emit('ping'); control.socket.emit('ping');
	await pause(650);
	assert.equal(rejected.pongs, rejectedPongs, label + ': direct packet denied without a bridge publication');
	assert(control.pongs > validPongs, label + ': valid direct packet');
	assert.equal(rejected.socket.connected, false, label + ': server disconnected invalid authority');
	results.push({ case: label, direct_packet_denied: true, control_received: true });
}
(async () => {
	try {
		const control = await login(2);
		const controlActivity = state({ action: 'activity', sid: control.sid }).activity;
		if (process.env.QC08_CASE === 'admin') {
			const expired = await login(1);
			state({ action: 'idle', sid: expired.sid, age: 1801 });
			console.log(JSON.stringify({ before_delivery: state({ action: 'inspect', sid: expired.sid }) }));
			try { await barrier('reduced-admin-idle', expired, control); }
			catch (error) {
				const response = await http('/api/method/lms.lms.account_security.session_status', expired.sid, { active: false });
				const body = await response.json();
				console.log(JSON.stringify({ after_delivery: { status: response.status, idle_limit: body.message?.idle_seconds, remaining: body.message?.remaining, error_type: body.exc_type } }));
				throw error;
			}
			return;
		}
		const a = await login(0), b = await login(0);
		assert.notEqual(a.sid, b.sid);
		state({ action: 'publish', marker: 'initial-valid' });
		await pause(500);
		assert(a.events.includes('initial-valid') && b.events.includes('initial-valid'));
		const activity = state({ action: 'activity', sid: b.sid }).activity;
		b.socket.emit('ping');
		state({ action: 'publish', marker: 'passive' });
		await pause(500);
		assert.equal(state({ action: 'activity', sid: b.sid }).activity, activity, 'passive delivery does not renew human clock');
		await pause(2500);
		for (let index = 0; index < 3; index++) {
			const marker = 'valid-after-http-keepalive-' + index;
			state({ action: 'publish', marker }); await pause(350);
			assert(a.events.includes(marker) && b.events.includes(marker) && control.events.includes(marker));
		}
		results.push({ case: 'valid-after-keepalive-and-successive-publications', idle_ms: 2500, publications: 3, controls_received: true });
		state({ action: 'revoke', sid: a.sid });
		await barrier('one-sid-revoked', a, b);
		const revokedDirect = await login(0);
		state({ action: 'revoke', sid: revokedDirect.sid });
		await directBarrier('one-sid-revoked-direct', revokedDirect, b);
		const logout = await http('/api/method/logout', b.sid, {});
		assert.equal(logout.status, 200, 'native POST logout');
		await barrier('native-logout', b, control);
		const logoutDirect = await login(0);
		assert.equal((await http('/api/method/logout', logoutDirect.sid, {})).status, 200);
		await directBarrier('native-logout-direct', logoutDirect, control);
		for (const index of [0, 1]) {
			const expired = await login(index);
			state({ action: 'idle', sid: expired.sid, age: fixtures[index].idle_limit + 1 });
			await barrier('idle-' + fixtures[index].idle_limit, expired, control);
			const late = await http('/api/method/lms.lms.account_security.session_status', expired.sid, { active: true });
			assert.equal(late.status, 401, 'continuation after expiry rejected');
			const expiredDirect = await login(index);
			state({ action: 'idle', sid: expiredDirect.sid, age: fixtures[index].idle_limit + 1 });
			await directBarrier('idle-direct-' + fixtures[index].idle_limit, expiredDirect, control);
		}
		const continued = await login(0);
		state({ action: 'idle', sid: continued.sid, age: fixtures[0].idle_limit - 30 });
		const continuation = await http('/api/method/lms.lms.account_security.session_status', continued.sid, { active: true });
		assert.equal(continuation.status, 200);
		const status = await continuation.json();
		assert(status.message.remaining > fixtures[0].idle_limit - 10);
		state({ action: 'publish', marker: 'continued' });
		await pause(500);
		assert(continued.events.includes('continued'));
		results.push({ case: 'continue-before-limit', accepted: true, control_received: true, simulated_activity_clock: true });
		const disabled = await login(0);
		const disabledDirect = await login(0);
		state({ action: 'disable', index: 0 });
		await barrier('native-disabled', disabled, control);
		await directBarrier('native-disabled-direct', disabledDirect, control);
		assert.equal(state({ action: 'activity', sid: control.sid }).activity, controlActivity, 'control publication/packets never renew human activity');
		console.log(JSON.stringify({ native_http_db_redis_node: true, results, passive_activity_unchanged: true, original_site_touched: false }));
	} finally {
		for (const session of sessions) session.socket.disconnect();
	}
})().catch(error => { console.error(error.message); process.exitCode = 1; });
