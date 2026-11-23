// Delimited local wire measurement; no public-capacity or provider claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { createRequire } = require('node:module');
const { io } = createRequire('/home/frappe/frappe-bench/apps/lms/frontend/package.json')('socket.io-client');
const site = 'test_quality08.localhost';
const fixtures = JSON.parse(fs.readFileSync(site + '/private/qc08-ws-fixtures.json'));
const sockets = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = args => new Promise((resolve, reject) => {
	const child = execFile('/home/frappe/frappe-bench/env/bin/python', ['/home/frappe/frappe-bench/apps/lms/local/quality/integration08/ws_native_state.py'], { encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout)));
	child.stdin.end(JSON.stringify(args));
});
const authorityCount = () => fs.readFileSync(fs.existsSync('../logs/qc08-http-managed.log') ? '../logs/qc08-http-managed.log' : '../logs/qc08-http-access.log', 'utf8').split('\n').filter(line => line.includes('uri=/api/method/frappe.realtime.get_user_info ') || line.includes(' /api/method/frappe.realtime.get_user_info ')).length;
(async () => {
	try {
		const response = await fetch('http://127.0.0.1:8000/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Frappe-Site-Name': site }, body: JSON.stringify({ usr: fixtures[2].user, pwd: fixtures[2].password }) });
		assert.equal(response.status, 200);
		const cookie = response.headers.getSetCookie().find(value => value.startsWith('sid=')).split(';')[0];
		const sid = cookie.slice(4), activity = (await state({ action: 'activity', sid })).activity;
		const before = authorityCount();
		await Promise.all(Array.from({ length: 24 }, async () => {
			const socket = io('http://127.0.0.1:9000/' + site, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { Origin: 'http://127.0.0.1:9000', 'X-Frappe-Site-Name': site, Cookie: cookie } });
			const row = { socket, latency: [], markers: new Set(), pongs: 0 };
			sockets.push(row);
			socket.on('qc08_native_probe', data => { row.markers.add(data.marker); if (data.published_at_ms) row.latency.push(Date.now() - data.published_at_ms); });
			socket.on('pong', () => row.pongs++);
			await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); setTimeout(() => reject(Error('bounded local connect timeout')), 5000).unref(); });
		}));
		await wait(2500);
		for (let index = 0; index < 3; index++) {
			const marker = 'bounded24-' + index;
			for (const row of sockets) row.socket.emit('ping');
			await state({ action: 'publish', marker });
			const deadline = Date.now() + 3500;
			while (sockets.some(row => !row.markers.has(marker) || row.pongs < index + 1) && Date.now() < deadline) await wait(20);
			assert(sockets.every(row => row.socket.connected && row.markers.has(marker) && row.pongs >= index + 1));
		}
		assert.equal((await state({ action: 'activity', sid })).activity, activity);
		const latency = sockets.flatMap(row => row.latency).sort((a,b) => a-b);
		console.log(JSON.stringify({ native_wire: true, local_sockets: 24, native_sessions: 1, idle_ms_before_publications: 2500, publications: 3, expected_deliveries: 72, deliveries: latency.length, authority_http_requests_including_handshakes: authorityCount() - before, publisher_timestamp_to_handler_ms: { min: latency[0], median: latency[Math.floor(latency.length/2)], p95: latency[Math.floor(latency.length*0.95)], max: latency.at(-1) }, activity_unchanged: true, guard: { maximum_concurrent: 8, maximum_waiting: 128, timeout_ms: 3000 }, capacity_claim: false }));
	} finally { for (const row of sockets) row.socket.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
