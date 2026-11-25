import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const scripts = dirname(fileURLToPath(import.meta.url));
const dbId = 'a'.repeat(64);
const version1 = '202611230001', version2 = '202611230002';
const migration = (version) => `${version}_fixture.sql`;
const stub = String.raw`
const fs = require('node:fs'), path = require('node:path');
const [tool, ...args] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.ICA_TEST_STATE, 'utf8'));
const save = () => fs.writeFileSync(process.env.ICA_TEST_STATE, JSON.stringify(state));
const assert = require('node:assert/strict');
const get = (prefix) => state.containers.find(({ Id }) => Id === prefix);
const print = (value) => console.log(JSON.stringify(value));
const database = 'a'.repeat(64), netId = 'b'.repeat(64);
const label = 'com.supabase.cli.project', option = 'com.docker.network.bridge.host_binding_ipv4';
const owned = process.env.ICARUS_INSTALL_DOCKER_HOST;
assert.equal(process.env.DOCKER_HOST, owned);
assert.equal(process.env.DOCKER_CONTEXT, undefined);
assert.equal(process.env.DOCKER_TLS_VERIFY, undefined);
assert.equal(process.env.SUPABASE_PROJECT_ID, undefined);
assert.equal(process.env.SUPABASE_TELEMETRY_DISABLED, '1');
assert.equal(process.env.DO_NOT_TRACK, '1');
fs.appendFileSync(process.env.ICA_TEST_LOG, JSON.stringify([tool, ...args])+'\n');
if (tool === 'docker') {
  const [group, action, ...rest] = args;
  if (group === 'info') console.log(state.daemon + ' ' + (state.engine || '29.10.0') + ' linux');
  else if (action === 'ls') {
    if (group === 'container') console.log(state.containers.map(({ Id }) => Id).join('\n'));
    if (group === 'volume') console.log(state.volumes.map(({ name }) => name).join('\n'));
    if (group === 'network') console.log(Object.values(state.networks).map(({ Id }) => Id || 'c'.repeat(64)).join('\n'));
  } else if (group === 'network' && action === 'create') {
    const name = rest.at(-1);
    assert(rest.includes('com.docker.network.bridge.gateway_mode_ipv4=nat'));
    state.networks[name] = { Name: name, Id: netId, Driver: 'bridge', EnableIPv6: false,
      Options: { [option]: '127.0.0.1' }, Labels: { 'icarus.installer': name } };
    if (state.foreignAfterNetwork) state.containers.push(state.foreignAfterNetwork);
    save(); console.log(netId);
  } else if (group === 'network' && action === 'inspect') {
    if (!state.networks[rest[0]]) process.exit(1);
    print([state.networks[rest[0]]]);
  } else if (group === 'container' && action === 'inspect') {
    if (rest.some((id) => !get(id))) process.exit(1);
    print(rest.map(get));
  } else if (group === 'exec') {
    const id = action === '-i' ? rest.shift() : action;
    const container = get(id);
    if (!container) process.exit(1);
    assert.equal(container.State.Running, true);
    if (rest.includes('-Atqc')) console.log(rest.at(-1).includes('to_regnamespace') ? 't' : container.history.join('\n'));
    else if (rest.includes('-f')) {
      assert(rest.includes('ON_ERROR_STOP=1'));
      assert.equal(rest[rest.indexOf('-h') + 1], '/var/run/postgresql');
      const batch = fs.readFileSync(0, 'utf8');
      assert.match(batch, /^BEGIN;\nLOCK TABLE supabase_migrations\.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\nDO /);
      assert.match(batch, /\$icarus_migration\$;\nINSERT INTO supabase_migrations\.schema_migrations \(version, name, statements\)\nVALUES \('[0-9]{12}', 'fixture', ARRAY\[.*\]\);\nCOMMIT;\n$/);
      assert.equal((batch.match(/\bCOMMIT;/g) || []).length, 1);
      const [body, stored] = [...batch.matchAll(/decode\('([a-f0-9]+)', 'hex'\)/g)].map(([, value]) => Buffer.from(value, 'hex').toString());
      assert.equal(stored, body);
      const next = batch.match(/\nVALUES \('([0-9]{12})'/)[1];
      const prefix = batch.match(/IS DISTINCT FROM ARRAY\[(.*)\]::text\[\]/)[1].match(/[0-9]{12}/g);
      assert.deepEqual(container.history, prefix);
      if (state.replaceOnMigrate) {
        container.Name += '-preserved';
        state.containers.push({ Name: container.Name.replace(/-preserved$/, ''), Id: 'e'.repeat(64), history: ['foreign'] });
      }
      // The stub stages DDL and version, and makes only the final commit durable.
      const transaction = { schema: [...container.schema, body], history: [...container.history, next] };
      if (state.failRegistration === next) {
        console.error('fixture failure at history INSERT after DDL'); process.exit(1);
      }
      Object.assign(container, transaction);
      save();
    } else if (rest.includes('pg_dump')) console.log('dump fixture');
    else if (rest[0] === 'tar' || rest[0] === 'sh') console.log('storage fixture');
    else if (rest.includes('-c')) {
      assert.match(rest.at(-1), /^update app_private\.local_demo_guard set enabled=(true|false) where singleton;$/);
      container.demoGuard = rest.at(-1).includes('=true');
      save();
    } else {
      const source = fs.readFileSync(0, 'utf8');
      if (source.includes("set role='admin'")) container.promoted = true;
      else assert.match(source, /rollback;\s*$/);
      save(); console.log('1');
    }
  } else if (['start', 'stop', 'restart'].includes(group)) {
    for (const id of [action, ...rest]) {
      assert(get(id));
      get(id).State.Running = group !== 'stop';
    }
    save();
  } else assert.fail(args.join(' '));
} else if (tool === 'supabase') {
  if (args[0] === '--version') console.log('2.109.1');
  else if (args[0] === 'status') print({ API_URL: 'http://127.0.0.1:58521', ANON_KEY: 'test-pub', SERVICE_ROLE_KEY: 'test-local' });
  else {
    const workdir = args[args.indexOf('--workdir') + 1];
    const config = fs.readFileSync(path.join(workdir, 'supabase/config.toml'), 'utf8');
    const project = config.match(/^project_id = "([^"]+)"$/m)[1];
    const versions = fs.readdirSync(path.join(workdir, 'supabase/migrations')).map(file => file.split('_')[0]).sort();
    assert(['db', 'start'].includes(args[0]));
    const network = args[args.indexOf('--network-id') + 1];
    assert(state.networks[network]);
    if (state.failStart) {
      // v2.109.1 prunes stopped containers, volumes and networks selected by project label.
      state.containers = state.containers.filter((c) => c.Config?.Labels?.[label] !== project);
      state.volumes = state.volumes.filter((v) => v.project !== project);
      for (const [name, item] of Object.entries(state.networks)) if (item.Labels?.[label] === project) delete state.networks[name];
      save(); process.exit(1);
    }
    const services = args[0] === 'db' ? ['db'] : ['db', 'kong', 'inbucket', 'auth', 'rest', 'storage', 'edge_runtime'];
    for (const [i, service] of services.entries()) {
      const map = { db: ['5432/tcp', args[0] === 'db' ? '58622' : '58522'], kong: ['8000/tcp', '58521'], inbucket: ['8025/tcp', '58524'] }[service];
      const bind = (ip) => map ? { [map[0]]: [{ HostIp: ip, HostPort: map[1] }] } : {};
      state.containers.push({ Name: '/supabase_' + service + '_' + project, Id: (10 + i).toString(16).padStart(64, 'a'),
        State: { Running: true }, Config: { Labels: { [label]: project } },
        Mounts: service === 'storage' ? [{ Name: 'supabase_storage_' + project, Destination: '/mnt' }] : [],
        HostConfig: { NetworkMode: network, PublishAllPorts: false, PortBindings: bind('') },
        NetworkSettings: { Networks: { [network]: { NetworkID: netId } }, Ports: bind('127.0.0.1') }, history: versions, schema: [] });
    }
    save();
  }
} else {
  assert.equal(args.length, 1);
  assert.equal(process.env.ICARUS_DB_CONTAINER, database);
  console.log('4 assertions passed');
}
`;

// Only the real installer process sees the simulated port availability and health responses.
const preload = `
import { Server } from 'node:net';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier !== '@supabase/supabase-js') return next(specifier, context);
    const sdk = \`export function createClient(api, service) {
      if (api !== 'http://127.0.0.1:58521' || service !== 'test-local') throw Error('Wrong local credentials');
      return { auth: { admin: {
        createUser: async () => ({ data: { user: { id: 'a1234567-1234-1234-1234-123456789abc' } } }),
        inviteUserByEmail: async () => ({}),
      } }, rpc: async () => ({ data: { lesson_path: 'demo/media', material_path: 'demo/readme' } }),
        storage: { from: () => ({ list: async () => ({ data: [{name:'media'},{name:'readme'}] }) }) } };
    }\`;
    return { url: 'data:text/javascript,' + encodeURIComponent(sdk), shortCircuit:true };
  },
});
const listen = Server.prototype.listen;
Server.prototype.listen = function (options, ...rest) {
  if (typeof options !== 'object' || !options.port) return listen.call(this, options, ...rest);
  if (String(options.port) === process.env.ICA_TEST_BUSY_PORT) {
    queueMicrotask(() => this.emit('error', new Error('EADDRINUSE')));
    return this;
  }
  return listen.call(this, { ...options, port: 0 }, ...rest);
};
globalThis.fetch = async () => new Response('{"asaas":false,"bunny":false}', {status:200});
`;

async function fixture(t) {
  const temporary = mkdtempSync(resolve(realpathSync(tmpdir()), 'ic-i-'));
  const root = resolve(temporary, 'source with spaces');
  const socket = resolve(temporary, 'icarus-install.sock');
  const server = createServer();
  t.after(() => { server.close(); rmSync(temporary, { recursive: true, force: true }); });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(socket, accept); });
  const daemon = 'fixture-engine';
  const state = resolve(temporary, 'state.json');
  const log = resolve(temporary, 'commands.jsonl');
  const workdir = resolve(root, '.local/clean-install');
  const srcMigrations = resolve(root, 'supabase/migrations');
  const qaMigrations = resolve(workdir, 'supabase/migrations');
  const bin = resolve(temporary, 'bin');
  const preloadPath = resolve(temporary, 'preload.mjs');
  for (const dir of [bin, srcMigrations, resolve(root, 'supabase/functions'), resolve(root, 'supabase/tests')]) mkdirSync(dir, { recursive: true });
  writeFileSync(preloadPath, preload);
  writeFileSync(resolve(temporary, 'stub.cjs'), stub);
  for (const name of ['docker', 'supabase', 'python3']) {
    writeFileSync(resolve(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${resolve(temporary, 'stub.cjs')}" ${name} "$@"\n`, { mode: 0o700 });
  }
  writeFileSync(resolve(root, 'supabase/config.toml'), 'project_id = "icarus-courses-local"\n[api]\nenabled = true\nport = 58521\n[api.tls]\nenabled = false\n[db]\nport = 58522\n[db.pooler]\nenabled = false\n[local_smtp]\nenabled = true\nport = 58524\n');
  writeFileSync(resolve(root, 'supabase/seed.sql'), 'select 1;');
  writeFileSync(resolve(root, 'supabase/tests/check.sql'), 'begin;\nselect 1;\nrollback;');
  const addMigration = (version, body = 'select 1;') => writeFileSync(resolve(srcMigrations, migration(version)), `begin;\n${body}\ncommit;\n`);
  addMigration(version1);
  const save = (data) => writeFileSync(state, JSON.stringify(data));
  const load = () => JSON.parse(readFileSync(state, 'utf8'));
  save({ daemon, containers: [], volumes: [], networks: {} });
  const run = async (script, action, extra = {}) => {
    writeFileSync(log, '');
    let result;
    try {
      result = await promisify(execFile)(process.execPath, ['--import', preloadPath, resolve(scripts, script + '.mjs'), ...[action].flat()], {
        env: { PATH: `${bin}:${process.env.PATH}`, ICARUS_LOCAL_WORKDIR: root, ICA_TEST_STATE: state, ICA_TEST_LOG: log,
          ICARUS_INSTALL_DOCKER_HOST: 'unix://' + socket, ICARUS_INSTALL_DOCKER_ID: daemon, DOCKER_CONTEXT: 'unrelated',
          DOCKER_HOST: 'tcp://example.invalid:2375', DOCKER_TLS_VERIFY: '1', SUPABASE_PROJECT_ID: 'not-this-project',
          SUPABASE_URL: 'http://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'foreign', SUPABASE_TELEMETRY_DISABLED: 'false', ...extra },
        timeout: 20_000,
      });
      result.code = 0;
    } catch (error) { result = error; }
    return { ...result, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) };
  };
  return { root, socket, workdir, qaMigrations, addMigration, load, save, run };
}

function noWriteCalls(calls) {
  assert(calls.every(([tool, operation, subcommand, ...args]) =>
    (tool === 'docker' && (operation === 'info' || ['ls', 'inspect'].includes(subcommand) ||
      (operation === 'exec' && args.includes('-Atqc') && subcommand === dbId))) ||
    (tool === 'supabase' && operation === '--version')), JSON.stringify(calls));
}

test('a missing declaration and a different daemon ID block native commands', async (t) => {
  const f = await fixture(t);
  const absent = await f.run('clean-install', 'install', { ICARUS_INSTALL_DOCKER_HOST: '' });
  assert.match(absent.stderr, /socket Unix dedicado/);
  assert.deepEqual(absent.calls, []);
  const wrong = await f.run('clean-install', 'install', { ICARUS_INSTALL_DOCKER_ID: 'other-engine' });
  assert.match(wrong.stderr, /ID do daemon/);
  assert.deepEqual(wrong.calls.map((call) => call.slice(0, 2)), [['docker', 'info']]);
  assert.equal(existsSync(f.workdir), false);
});

test('the dedicated daemon must run stable Engine 29 and an orphan lock is actionable without Docker access', async (t) => {
  const f = await fixture(t);
  for (const engine of ['28.0.0', '28.3.3', '29.9.3', '29.10.0-rc.1']) {
    f.save({ ...f.load(), engine });
    const result = await f.run('clean-install', 'install');
    assert.match(result.stderr, /Engine Linux estável da série 29/);
    assert.deepEqual(result.calls.map((call) => call.slice(0, 2)), [['docker', 'info']]);
    assert.equal(existsSync(f.workdir), false);
  }
  const lock = f.socket + '.lock';
  const owner = resolve(lock, 'owner.json');
  mkdirSync(lock);
  writeFileSync(owner, '{"pid":12345}');
  const blocked = await f.run('clean-install', 'install');
  assert.match(blocked.stderr, /PID 12345.+Recuperar um lock interrompido/);
  assert.equal(readFileSync(owner, 'utf8'), '{"pid":12345}');
  assert.deepEqual(blocked.calls, []);
});

test('the new stack validates Mailpit configuration and host availability before mutations', async (t) => {
  const f = await fixture(t);
  const path = resolve(f.root, 'supabase/config.toml');
  const config = readFileSync(path, 'utf8');
  for (const invalid of [config.replace('58524', '58525'), config + '"smtp_port" = 58525\n']) {
    writeFileSync(path, invalid);
    const result = await f.run('local', 'start');
    assert.match(result.stderr, /Mailpit exige/);
    noWriteCalls(result.calls);
    assert.deepEqual(f.load().containers, []);
    assert.equal(existsSync(resolve(f.root, '.local')), false);
  }
  writeFileSync(path, config);
  const busy = await f.run('local', 'start', { ICA_TEST_BUSY_PORT: '58524' });
  assert.match(busy.stderr, /porta TCP 58524/);
  noWriteCalls(busy.calls);
  assert.equal(existsSync(resolve(f.root, '.local')), false);
});

for (const collection of ['containers', 'volumes', 'networks']) {
  test(`a preexisting ${collection} resource blocks both native starts even with an unrelated name`, async (t) => {
    const f = await fixture(t);
    const state = f.load();
    if (collection === 'containers') state.containers.push({ Id: 'c'.repeat(64), Name: '/other', Config: { Labels: { 'com.supabase.cli.project': 'icarus-courses-install-qa' } } });
    if (collection === 'volumes') state.volumes.push({ name: 'other', project: 'icarus-courses-install-qa', bytes: 'preserve' });
    if (collection === 'networks') state.networks.other = { Labels: { 'com.supabase.cli.project': 'icarus-courses-install-qa' } };
    state.failStart = true;
    f.save(state);
    for (const [script, action] of [['clean-install', 'install'], ['local', 'start']]) {
      const result = await f.run(script, action);
      assert.match(result.stderr, /daemon dedicado sem containers/);
      noWriteCalls(result.calls);
      assert.deepEqual(f.load(), state);
      assert.equal(existsSync(resolve(f.root, '.local')), false);
    }
  });
}

test('port 58622 is rejected before native start, and a failed native start can only run on an empty daemon', async (t) => {
  const f = await fixture(t);
  f.save({ ...f.load(), failStart: true });
  const blocked = await f.run('clean-install', 'install', { ICA_TEST_BUSY_PORT: '58622' });
  assert.match(blocked.stderr, /porta TCP 58622/);
  noWriteCalls(blocked.calls);
  assert.equal(existsSync(f.workdir), false);
  const attempted = await f.run('clean-install', 'install');
  assert.equal(attempted.code, 1);
  assert(attempted.calls.some(([bin, cmd, sub]) => bin === 'supabase' && cmd === 'db' && sub === 'start'));
  assert.deepEqual(f.load().containers, []);
  assert.deepEqual(f.load().volumes, []);
  const retry = await f.run('clean-install', 'install');
  assert.match(retry.stderr, /inclusive instalações parciais/);
  assert.deepEqual(retry.calls, []);
});

test('partial install directory and legacy rollback are inert', async (t) => {
  const f = await fixture(t);
  mkdirSync(f.qaMigrations, { recursive: true });
  const stale = resolve(f.qaMigrations, 'ignored-before.sql');
  writeFileSync(stale, 'unchanged');
  const state = f.load();
  state.containers.push({ Name: '/supabase_db_icarus-courses-local', Id: 'd'.repeat(64) });
  f.save(state);
  for (const [script, action] of [['clean-install', 'install'], ['local-bindings', 'rollback'], ['local-bindings', 'apply'], ['local-bindings', 'finalize']]) {
    const result = await f.run(script, action);
    assert.equal(result.code, 1);
    assert.deepEqual(result.calls, []);
    assert.equal(readFileSync(stale, 'utf8'), 'unchanged');
    assert.deepEqual(f.load(), state);
  }
});

test('a matching label arriving before the second inventory check is preserved', async (t) => {
  const f = await fixture(t);
  const foreign = { Id: 'c'.repeat(64), Name: '/other', Config: { Labels: { 'com.supabase.cli.project': 'icarus-courses-install-qa' } } };
  f.save({ ...f.load(), failStart: true, foreignAfterNetwork: foreign });
  const result = await f.run('clean-install', 'install');
  assert.match(result.stderr, /daemon dedicado sem containers/);
  assert(!result.calls.some(([tool, operation]) => tool === 'supabase' && operation === 'db'));
  assert.deepEqual(f.load().containers, [foreign]);
});

for (const defect of ['homonym', 'wrong network', 'stopped', 'wildcard', 'publish all', 'history', 'residual file']) {
  test(`upgrade rejects ${defect} before Docker or filesystem changes`, async (t) => {
    const f = await fixture(t);
    const installed = await f.run('clean-install', 'install');
    assert.equal(installed.code, 0, installed.stderr);
    f.addMigration(version2);
    const state = f.load();
    const [db] = state.containers;
    if (defect === 'homonym') db.Id = 'e'.repeat(64);
    if (defect === 'wrong network') db.NetworkSettings.Networks['icarus-install-qa-loopback'].NetworkID = 'f'.repeat(64);
    if (defect === 'stopped') db.State.Running = false;
    if (defect === 'wildcard') db.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0';
    if (defect === 'publish all') db.HostConfig.PublishAllPorts = true;
    if (defect === 'history') db.history = [version2];
    if (defect === 'residual file') writeFileSync(resolve(f.qaMigrations, '202611230003_residual.sql'), 'select 3;');
    const receipt = resolve(f.root, '.local/clean-install-evidence.json');
    const before = readFileSync(receipt, 'utf8');
    f.save(state);
    const result = await f.run('clean-install', 'upgrade');
    assert.equal(result.code, 1, result.stderr);
    noWriteCalls(result.calls);
    assert.deepEqual(f.load(), state);
    assert.equal(readFileSync(receipt, 'utf8'), before);
    assert.equal(existsSync(resolve(f.qaMigrations, migration(version2))), false);
  });
}

test('install, upgrade and verify preserve native history and use only the registered Postgres ID', async (t) => {
  const f = await fixture(t);
  const installed = await f.run('clean-install', 'install');
  assert.equal(installed.code, 0, installed.stderr);
  f.addMigration(version2);
  const upgraded = await f.run('clean-install', 'upgrade');
  assert.equal(upgraded.code, 0, upgraded.stderr);
  assert(upgraded.calls.some((args) => args.slice(0, 5).join(' ') === `docker exec -i ${dbId} psql` && args.includes('-f')));
  assert(!upgraded.calls.some(([tool]) => tool === 'supabase'));
  assert.equal(f.load().containers[0].history.length, 2);
  const verified = await f.run('clean-install', 'verify');
  assert.equal(verified.code, 0, verified.stderr);
  assert(!verified.calls.some(([tool]) => tool === 'supabase'));
});

test('an upgrade cannot direct migrations to a homonym arriving after the preflight', async (t) => {
  const f = await fixture(t);
  await f.run('clean-install', 'install');
  f.addMigration(version2);
  f.save({ ...f.load(), replaceOnMigrate: true });
  const result = await f.run('clean-install', 'upgrade');
  assert.match(result.stderr, /Postgres registrado mudou de nome/);
  assert.deepEqual(f.load().containers[1].history, ['foreign']);
  assert.deepEqual(f.load().containers[0].history, [version1, version2]);
  assert(result.calls.some((args) => args.slice(0, 5).join(' ') === `docker exec -i ${dbId} psql` && args.includes('-f')));
});

test('failure inserting the native history version rolls back DDL and history together before retry', async (t) => {
  const f = await fixture(t);
  const installed = await f.run('clean-install', 'install');
  assert.equal(installed.code, 0, installed.stderr);
  const ddl = "create table public.fixture_upgrade(id integer);\ndo $$ begin perform 1; end $$;";
  f.addMigration(version2, ddl);
  f.save({ ...f.load(), failRegistration: version2 });
  const before = f.load();
  const receipt = resolve(f.root, '.local/clean-install-evidence.json');
  const original = readFileSync(receipt, 'utf8');
  const failed = await f.run('clean-install', 'upgrade');
  assert.equal(failed.code, 1);
  assert.match(readFileSync(resolve(f.root, '.local/command-failure.json'), 'utf8'), /failure at history INSERT after DDL/);
  assert.deepEqual(f.load(), before);
  assert.equal(readFileSync(receipt, 'utf8'), original);
  assert.equal(readFileSync(resolve(f.qaMigrations, migration(version2)), 'utf8'), `begin;\n${ddl}\ncommit;\n`);
  f.save({ ...before, failRegistration: null });
  const retried = await f.run('clean-install', 'upgrade');
  assert.equal(retried.code, 0, retried.stderr);
  assert.deepEqual(f.load().containers[0].schema, [ddl]);
  assert.deepEqual(f.load().containers[0].history, [version1, version2]);
});

test('the full stack starts natively once, resumes by ID and stops without cleanup or repair', async (t) => {
  const f = await fixture(t);
  let wasStarted = false;
  for (const action of ['start', 'stop', 'stop', 'start', 'functions-restart']) {
    if (action === 'functions-restart') {
      const stopped = f.load();
      stopped.containers.find((container) => container.Name.includes('_edge_runtime_')).State.Running = false;
      f.save(stopped);
    }
    const result = await f.run('local', action);
    assert.equal(result.code, 0, result.stderr);
    const nativeStart = result.calls.filter(([tool, command]) => tool === 'supabase' && command === 'start');
    assert.equal(nativeStart.length, action === 'start' && !wasStarted ? 1 : 0);
    wasStarted = true;
    for (const [tool, command, ...targets] of result.calls) {
      assert(!['rm', 'prune', 'rename', 'apply', 'finalize'].includes(command));
      if (tool === 'docker' && ['start', 'stop', 'restart'].includes(command)) assert(targets.every((id) => /^[a-f0-9]{64}$/.test(id)));
    }
    if (action === 'functions-restart') {
      const edge = f.load().containers.find((container) => container.Name.includes('_edge_runtime_'));
      assert(edge.State.Running);
      assert(result.calls.some(([tool, command, id]) => tool === 'docker' && command === 'start' && id === edge.Id));
    }
  }
  const state = f.load();
  state.containers.find((container) => container.Name.includes('_edge_runtime_')).Id = 'e'.repeat(64);
  f.save(state);
  for (const action of ['start', 'stop', 'functions-restart']) {
    const rejected = await f.run('local', action);
    assert.equal(rejected.code, 1);
    noWriteCalls(rejected.calls);
    assert.deepEqual(f.load(), state);
  }
});

test('backup, demo and first-admin use the registered IDs and reject a changed daemon or homonym', async (t) => {
  const f = await fixture(t);
  const started = await f.run('local', 'start');
  assert.equal(started.code, 0, started.stderr);
  const state = f.load();
  const storage = state.containers.find(({ Name }) => Name.includes('_storage_')).Id;
  const operations = [['backup', 'dump'], ['bootstrap', '--demo'], ['first-admin', ['invite', 'qa@example.invalid']], ['first-admin', 'promote']];
  writeFileSync(resolve(f.root, '.local/demo-8s.mp4'), 'synthetic fixture');
  for (const [script, args] of operations) {
    const invalid = await f.run(script, args, { ICARUS_INSTALL_DOCKER_ID: 'foreign-daemon' });
    assert.match(invalid.stderr, /ID do daemon Docker difere/);
    assert.deepEqual(invalid.calls.map((call) => call.slice(0, 2)), [['docker', 'info']]);
    const result = await f.run(script, args);
    assert.equal(result.code, 0, result.stderr);
    const execs = result.calls.filter(([tool, action]) => tool === 'docker' && action === 'exec');
    assert.equal(execs.length > 0, !Array.isArray(args));
    assert(execs.every(([, , first, second]) => [dbId, storage].includes(first === '-i' ? second : first)));
    if (script === 'backup') assert(execs.some((call) => call.includes(storage)));
  }
  assert.equal(f.load().containers[0].demoGuard, false);
  assert.equal(f.load().containers[0].promoted, true);
  const replaced = f.load();
  replaced.containers[0].Id = 'e'.repeat(64);
  f.save(replaced);
  for (const [script, args] of operations) {
    const invalid = await f.run(script, args);
    assert.equal(invalid.code, 1);
    noWriteCalls(invalid.calls);
    assert.deepEqual(f.load(), replaced);
  }
});
