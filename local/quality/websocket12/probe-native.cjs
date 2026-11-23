// Isolated characterization: unchanged Frappe Node modules and real Socket.IO wire;
// Redis and the HTTP session authority are doubles, not a native site/DB test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const http = require('node:http');
const { createRequire } = require('node:module');
const root = '/home/frappe/frappe-bench/apps/frappe';
const nativeRequire = createRequire(path.join(root, 'package.json'));
const { io: client } = createRequire('/home/frappe/frappe-bench/apps/lms/frontend/package.json')('socket.io-client');
const { Server } = nativeRequire('socket.io');
const site = 'auth12.localhost';
const user = 'synthetic-auth12@example.invalid';
const callbacks = new Map();
const authority = new Map();
const clients = [];
const evidence = [];
const hashes = {};
let server, io, lookups = 0;
const redis = {
  isOpen: true,
  async connect() {},
  async get(key) { assert.equal(key, 'socketio_auth_secret'); return 'synthetic-only-secret'; },
  async subscribe(channel, callback) { callbacks.set(channel, callback); },
};
const nodeUtils = { get_conf: () => ({ socketio_port: 0 }), get_redis_subscriber: () => redis };
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if (!path.extname(file)) file += fs.existsSync(file + '.js') ? '.js' : '/index.js';
  if (modules.has(file)) return modules.get(file).exports;
  const source = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  const extracted = path.join('/source/.local/i18n-apps/frappe', relative);
  assert.equal(source, fs.readFileSync(extracted, 'utf8'), `Pinned source differs: ${relative}`);
  hashes[relative] = crypto.createHash('sha256').update(source).digest('hex');
  const mod = { exports: {} }; modules.set(file, mod);
  function localRequire(name) {
    if (/node_utils$/.test(name)) return nodeUtils;
    if (name === 'node:http') return { ...http, createServer: (...args) => (server = http.createServer(...args)) };
    if (name === 'socket.io') return { Server: class extends Server { constructor(...args) { super(...args); io = this; } } };
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name));
    return nativeRequire(name);
  }
  const fetch = async (url, options) => {
    lookups++;
    const state = authority.get(options.headers.Cookie);
    assert.equal(options.headers['X-Frappe-Socket-Secret'], 'synthetic-only-secret');
    assert.equal(options.headers['X-Frappe-Site-Name'], site);
    const valid = state?.valid === true;
    return { json: async () => ({ message: url.includes('has_permission') ? valid : {
      user: valid ? state.user : 'Guest', user_type: 'Website User', installed_apps: ['frappe'],
    } }) };
  };
  // Same realm is required: Socket.IO checks the namespace matcher with instanceof RegExp.
  vm.runInThisContext('(function(exports, require, module, __filename, __dirname, fetch) {' + source + '\n})', { filename: file })(mod.exports, localRequire, mod, file, path.dirname(file), fetch);
  return mod.exports;
}
async function until(predicate, label) {
  const end = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < end, `Timeout: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
async function connect(sid, actor = user) {
  authority.set('sid=' + sid, { valid: true, user: actor });
  const c = client(`http://127.0.0.1:${server.address().port}/${site}`, {
    transports: ['websocket'], reconnection: false, forceNew: true,
    extraHeaders: { Host: site, Origin: 'http://' + site, Cookie: 'sid=' + sid },
  });
  clients.push(c);
  await new Promise((resolve, reject) => { c.once('connect', resolve); c.once('connect_error', reject); });
  return c;
}
function socket(c) { return io.of('/' + site).sockets.get(c.id); }
async function publish(room, a, b, marker, controlRoom = room) {
  const received = [];
  const left = payload => { if (payload.marker === marker) received.push('A'); };
  const right = payload => { if (payload.marker === marker) received.push('B'); };
  a.on('auth12_probe', left); b.on('auth12_probe', right);
  const before = lookups;
  callbacks.get('events')(JSON.stringify({ namespace: site, room, event: 'auth12_probe', message: { marker } }));
  if (controlRoom !== room) callbacks.get('events')(JSON.stringify({ namespace: site, room: controlRoom, event: 'auth12_probe', message: { marker } }));
  await until(() => received.length === 2, 'native room delivery to both open sockets');
  a.off('auth12_probe', left); b.off('auth12_probe', right);
  assert.equal(lookups, before, 'Native event bridge unexpectedly revalidated authority');
  return received.sort();
}
(async () => {
  try {
    load(path.join(root, 'socketio.js'));
    await until(() => server.listening && callbacks.has('events'), 'native startup');
    for (const reason of ['logout-revocation', 'user-disabled', 'student-idle-7200', 'admin-idle-1800']) {
      const a = await connect('synthetic-A-' + reason);
      const controlUser = reason === 'user-disabled' ? 'synthetic-control12@example.invalid' : user;
      const b = await connect('synthetic-B-' + reason, controlUser);
      await publish('user:' + user, a, b, reason + '-baseline', 'user:' + controlUser);
      a.emit('doc_subscribe', 'Auth12 Synthetic', 'already-authorized');
      b.emit('doc_subscribe', 'Auth12 Synthetic', 'already-authorized');
      const room = 'doc:Auth12 Synthetic/already-authorized';
      await until(() => socket(a).rooms.has(room) && socket(b).rooms.has(room), 'native permission-controlled subscription');
      authority.get('sid=synthetic-A-' + reason).valid = false;
      const denied = await socket(a).frappe_request('/api/method/frappe.realtime.get_user_info').then(r => r.json());
      assert.equal(denied.message.user, 'Guest');
      const validControl = await socket(b).frappe_request('/api/method/frappe.realtime.get_user_info').then(r => r.json());
      assert.equal(validControl.message.user, controlUser);
      const permissionBefore = lookups;
      a.emit('doc_subscribe', 'Auth12 Synthetic', 'denied-new');
      await until(() => lookups > permissionBefore, 'native new subscription checks authority');
      assert.equal(socket(a).rooms.has('doc:Auth12 Synthetic/denied-new'), false);
      const beforePing = lookups;
      await new Promise(resolve => { a.once('pong', resolve); a.emit('ping'); });
      assert.equal(lookups, beforePing);
      const privateRoom = await publish('user:' + user, a, b, reason + '-after', 'user:' + controlUser);
      const existingDocRoom = await publish(room, a, b, reason + '-doc-after');
      assert.ok(a.connected && b.connected);
      evidence.push({ scenario: reason, authorityA: 'Guest', validB: true, newDocDeniedA: true, privateRoom, existingDocRoom, deliveryRevalidationCalls: 0, clientAStillConnected: true });
      a.disconnect(); b.disconnect();
    }
    console.log(JSON.stringify({ category: 'isolated-native-node-real-socketio-wire-with-HTTP-Redis-doubles', result: 'gap-reproduced', sourceHashes: hashes, cases: evidence }, null, 2));
  } finally {
    clients.forEach(c => c.disconnect());
    if (io) await new Promise(resolve => io.close(resolve));
    else if (server) server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
