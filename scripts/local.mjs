import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNewDockerInventory, createInstallerNetwork, inspectContainers, inspectNetwork, installedContainers, isEntrypoint, onInstallerDocker, preflightNewDocker } from './installer-docker.mjs';
import { assertBindings } from './local-bindings.mjs';

export const root = resolve(process.env.ICARUS_LOCAL_WORKDIR || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
export const project = 'icarus-courses-local';
const edgePid = resolve(root, '.local/edge-runtime-process.json');
const ownership = resolve(root, '.local/local-installation.json');
const networkName = 'icarus-courses-local-loopback';
const bindings = {
  db: { '5432/tcp': '58522' }, kong: { '8000/tcp': '58521' }, inbucket: { '8025/tcp': '58524' },
  auth: {}, rest: {}, storage: {}, edge_runtime: {},
};
const exists = (path) => lstatSync(path, { throwIfNoEntry: false });

async function checkFunctions() {
  let ready = false;
  // Native cold setup can exceed 30s before the first route becomes available.
  const readyStarted = Date.now(), deadline = readyStarted + 90_000;
  while (Date.now() < deadline && !ready) {
    try {
      const response = await fetch('http://127.0.0.1:58521/functions/v1/capabilities', { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (response.status === 200) { const value = await response.json(); ready = typeof value.asaas === 'boolean' && typeof value.bunny === 'boolean'; } else await response.body?.cancel();
    } catch {}
    if (!ready) await new Promise((accept) => setTimeout(accept, 300));
  }
  privateWrite(resolve(root, '.local/edge-readiness.json'), JSON.stringify({ ready, elapsed_ms: Date.now() - readyStarted, budget_ms: 90_000 }));
  if (!ready) throw Error('Servidor Edge não respondeu por HTTP.');
}
export function assertProject() {
  const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
  if (!/^project_id\s*=\s*"icarus-courses-local"\s*$/m.test(config) ||
      !configTable(config, 'api', /^[ \t]*port[ \t]*=[ \t]*58521[ \t]*(?:#.*)?$/m) ||
      !configTable(config, 'db', /^[ \t]*port[ \t]*=[ \t]*58522[ \t]*(?:#.*)?$/m)) throw Error('Destino local inválido. Nenhuma ação executada.');
  return config;
}
function configTable(config, name, pattern) {
  const sections = config.split(/(?=^[ \t]*\[)/m).filter((part) => part.split(/\r?\n|#/, 1)[0].trim() === `[${name}]`);
  return sections.length === 1 && pattern.test(sections[0]);
}
function assertNewStackConfig(config) {
  const enabled = /^[ \t]*enabled[ \t]*=[ \t]*true[ \t]*(?:#.*)?$/m;
  const disabled = /^[ \t]*enabled[ \t]*=[ \t]*false[ \t]*(?:#.*)?$/m;
  const smtp = configTable(config, 'local_smtp', /^[ \t]*port[ \t]*=[ \t]*58524[ \t]*(?:#.*)?$/m) &&
    configTable(config, 'local_smtp', enabled);
  if (!smtp || /^[ \t]*["']?(?:smtp_port|pop3_port)["']?[ \t]*=/m.test(config) ||
      /^[ \t]*(?:\[[ \t]*)?["']?inbucket["']?[ \t]*[.\]=]/m.test(config)) {
    throw Error('Mailpit exige [local_smtp] ativo na porta 58524, sem portas SMTP/POP3 adicionais.');
  }
  if (!configTable(config, 'api', enabled) || !configTable(config, 'api.tls', disabled) || !configTable(config, 'db.pooler', disabled)) {
    throw Error('Bindings locais exigem API ativa, TLS da API desativado e pooler desativado.');
  }
}
export function privateWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (!existsSync(path) || !readFileSync(path).equals(Buffer.from(content))) writeFileSync(path, content, { mode: 0o600 });
  if ((statSync(path).mode & 0o777) !== 0o600) chmodSync(path, 0o600);
}
export function command(binary, args, { logFailure = true, ...options } = {}) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    if (!logFailure) throw Error(`${binary} não concluiu a operação no destino declarado.`);
    privateWrite(resolve(root, '.local/command-failure.json'), JSON.stringify({ binary, exit_code: result.status, signal: result.signal, cause: result.error?.code || null, stdout: result.stdout?.toString(), stderr: result.stderr?.toString(), checked_at: new Date().toISOString() }));
    throw Error(`${binary} não concluiu; diagnóstico privado em .local/command-failure.json.`);
  }
  return result.stdout;
}
export function localContainers({ id, docker }, options = {}) {
  const state = options.state ?? (exists(ownership)?.isFile() && JSON.parse(readFileSync(ownership, 'utf8')));
  if (!state || id !== state.daemon || inspectNetwork(docker, networkName) !== state.network) throw Error('Instalação local sem identidade registrada neste daemon.');
  const expectedNames = Object.keys(bindings).map((service) => `/supabase_${service}_${project}`);
  const ids = installedContainers(docker);
  const containers = inspectContainers(docker, state.containers);
  if (JSON.stringify(ids.sort()) !== JSON.stringify([...state.containers].sort()) ||
      JSON.stringify(containers.map(({ Name }) => Name).sort()) !== JSON.stringify(expectedNames.sort())) {
    throw Error('Inventário local divergiu da instalação registrada.');
  }
  for (const service of Object.keys(bindings)) {
    const container = containers.find(({ Name }) => Name === `/supabase_${service}_${project}`);
    const running = options.running !== false && !(options.allowStoppedEdge && service === 'edge_runtime');
    assertBindings(container, project, { name: networkName, id: state.network }, bindings[service], { running });
  }
  return containers;
}

export async function onLocalDatabase(run) {
  assertProject();
  return onInstallerDocker(command, (target) => {
    const containers = localContainers(target);
    const database = containers.find(({ Name }) => Name === `/supabase_db_${project}`).Id;
    return run({ ...target, database, containers });
  });
}

export async function status({ save = true } = {}) {
  return onLocalDatabase((target) => healthyStatus(target, save));
}

export function localCredentials({ native }) {
  const data = JSON.parse(native(['status', '-o', 'json'], root));
  const api = data.API_URL || data.api_url;
  if (api !== 'http://127.0.0.1:58521') throw Error('API fora do destino Icarus local.');
  const anon = data.ANON_KEY || data.anon_key, service = data.SERVICE_ROLE_KEY || data.service_role_key;
  if (!anon || !service) throw Error('Status incompleto. Chaves não exibidas.');
  return { api, anon, service };
}

async function healthyStatus(target, save = true) {
  const { api, anon, service } = localCredentials(target);
  const checks = await Promise.all([
    fetch(`${api}/auth/v1/health`, { headers: { apikey: anon }, redirect: 'error', signal: AbortSignal.timeout(5000) }),
    fetch(`${api}/storage/v1/status`, { headers: { apikey: anon }, redirect: 'error', signal: AbortSignal.timeout(5000) }),
    fetch(`${api}/rest/v1/rpc/app_public_context`, { method: 'POST', headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(5000) }),
  ]);
  const health = { auth_healthy: checks[0].status === 200, storage_healthy: checks[1].status === 200, database_api_healthy: checks[2].status === 200 };
  for (const check of checks) await check.body?.cancel();
  if (!Object.values(health).every(Boolean)) throw Error('Auth/Storage/API do banco local sem saúde completa.');
  if (save) {
    privateWrite(resolve(root, '.env.local'), `VITE_SUPABASE_URL=${api}\nVITE_SUPABASE_ANON_KEY=${anon}\n`);
    const serverPath = resolve(root, '.local/service.env');
    const previous = existsSync(serverPath) ? readFileSync(serverPath, 'utf8').split('\n').filter((line) => !/^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=/.test(line)) : ['APP_ORIGIN=http://127.0.0.1:8088', 'ICARUS_MODE=local'];
    privateWrite(serverPath, `SUPABASE_URL=${api}\nSUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${service}\n${previous.filter(Boolean).join('\n')}\n`);
  }
  return { project, api, healthy: true, ...health, loopback: true, credentials_saved: save };
}

export async function main(action = process.argv[2]) {
  if (!['start', 'stop', 'status', 'functions', 'functions-restart'].includes(action)) throw Error('Uso: node scripts/local.mjs start|stop|status|functions|functions-restart');
  const config = assertProject();
  const localDir = exists(resolve(root, '.local'));
  if (localDir && !localDir.isDirectory()) throw Error('.local precisa ser um diretório próprio.');
  await onInstallerDocker(command, async (target) => {
    const { id, docker, native, assertCli, assertDaemon } = target;
    if (action === 'start' && !exists(ownership)) {
      assertNewStackConfig(config);
      const edgeDefaults = 'APP_ORIGIN=http://127.0.0.1:8088\nICARUS_MODE=local\nICARUS_PUBLIC_SUPABASE_URL=http://127.0.0.1:58521\n';
      const edgeEnv = resolve(root, '.local/edge.env');
      const nativeEnv = resolve(root, 'supabase/functions/.env');
      const remnants = ['.local/start-evidence.json', '.local/bind-repair.json', '.local/service.env', 'supabase/.temp', 'supabase/.branches', 'supabase/functions/.env'];
      for (const directory of ['', 'supabase']) {
        for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) remnants.push(resolve(root, directory, name));
      }
      if (exists(edgePid) || remnants.some((path) => exists(resolve(root, path)))) throw Error('Checkout local contém estado ou configuração de outra instalação.');
      if (!exists(resolve(root, 'supabase'))?.isDirectory() || !exists(resolve(root, 'supabase/functions'))?.isDirectory()) throw Error('A fonte Supabase precisa estar no checkout.');
      assertCli();
      await preflightNewDocker(docker, [58521, 58522, 58524]);
      const input = exists(edgeEnv);
      if (input && !input.isFile()) throw Error('Configuração Edge precisa ser um arquivo próprio.');
      if (!input) privateWrite(edgeEnv, edgeDefaults);
      writeFileSync(nativeEnv, readFileSync(edgeEnv), { flag: 'wx', mode: 0o600 });
      privateWrite(resolve(root, '.local/start-evidence.json'), JSON.stringify({ phase: 'native-start', completed: false }));
      assertDaemon();
      const network = createInstallerNetwork(docker, networkName);
      assertNewDockerInventory(docker, network);
      native(['start', '--network-id', networkName, '-x', 'studio,imgproxy,logflare,vector,realtime,postgres-meta'], root);
      const state = { daemon: id, network, containers: installedContainers(docker) };
      localContainers(target, { state });
      privateWrite(ownership, JSON.stringify(state));
    }
    const containers = localContainers(target, { running: !['start', 'stop'].includes(action), allowStoppedEdge: action === 'functions-restart' });
    const db = containers.find(({ Name }) => Name === `/supabase_db_${project}`);
    if (action === 'stop') {
      const running = [...containers.filter((container) => container.Id !== db.Id), db].filter(({ State }) => State.Running);
      if (running.length) docker(['stop', ...running.map(({ Id }) => Id)]);
      console.log('Icarus local parado, com volumes preservados.');
      return;
    }
    if (action === 'start') {
      if (!db.State.Running) docker(['start', db.Id]);
      const stopped = containers.filter(({ Id, State }) => Id !== db.Id && !State.Running).map(({ Id }) => Id);
      if (stopped.length) docker(['start', ...stopped]);
      localContainers(target);
    }
    if (action === 'functions-restart') {
      const edge = containers.find(({ Name }) => Name === `/supabase_edge_runtime_${project}`);
      docker([edge.State.Running ? 'restart' : 'start', edge.Id]);
      localContainers(target);
    }
    let health;
    const deadline = Date.now() + 30_000;
    for (;;) {
      try { health = await healthyStatus(target); break; }
      catch (error) { if (action !== 'start' || Date.now() >= deadline) throw error; await new Promise((accept) => setTimeout(accept, 500)); }
    }
    if (action !== 'status') await checkFunctions();
    if (action === 'start') privateWrite(resolve(root, '.local/start-evidence.json'), JSON.stringify({ phase: 'ready', completed: true }));
    console.log(JSON.stringify(health));
  });
}
if (isEntrypoint(import.meta.url)) main().catch((error) => {
  console.error(`Operação local não concluída: ${error.message}`);
  process.exitCode = 1;
});
