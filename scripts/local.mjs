import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(process.env.ICARUS_LOCAL_WORKDIR || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
export const project = 'icarus-courses-local';
const edgePid = resolve(root, '.local/edge-runtime-process.json');
export async function stopFunctions() {
  if (!existsSync(edgePid)) return;
  const record = JSON.parse(readFileSync(edgePid, 'utf8'));
  const processInfo = spawnSync('ps', ['-p', String(record.pid), '-o', 'command='], { encoding: 'utf8' });
  if (processInfo.status === 0) {
    if (!processInfo.stdout.includes('functions serve') || !processInfo.stdout.includes(record.workdir)) throw Error('PID não pertence ao servidor Edge registrado; preservado.');
    process.kill(record.pid, 'SIGTERM');
    for (let i = 0; i < 30; i++) { try { process.kill(record.pid, 0); } catch { break; } await new Promise((accept) => setTimeout(accept, 100)); }
    let alive = true;
    try { process.kill(record.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
    if (alive) throw Error('Processo Edge não encerrou; PID preservado para recuperação explícita.');
  }
  unlinkSync(edgePid);
}
async function startFunctions() {
  const workdir = resolve(process.env.ICARUS_FUNCTIONS_WORKDIR || root);
  const config = readFileSync(resolve(workdir, 'supabase/config.toml'), 'utf8');
  if (!/^project_id = "icarus-courses-local"$/m.test(config)) throw Error('Fonte Edge fora do projeto Icarus.');
  const edgeEnv = resolve(root, '.local/edge.env');
  if (!existsSync(edgeEnv)) privateWrite(edgeEnv, 'APP_ORIGIN=http://127.0.0.1:8088\nICARUS_MODE=local\nICARUS_PUBLIC_SUPABASE_URL=http://127.0.0.1:58521\n');
  let running = false;
  if (existsSync(edgePid)) {
    const record = JSON.parse(readFileSync(edgePid, 'utf8'));
    const info = spawnSync('ps', ['-p', String(record.pid), '-o', 'command='], { encoding: 'utf8' });
    running = info.status === 0 && info.stdout.includes('functions serve') && info.stdout.includes(record.workdir) && record.workdir === workdir;
    if (!running && info.status === 0) throw Error('Processo Edge existente tem outra fonte; pare explicitamente antes de trocar.');
  }
  if (!running) {
    const logPath = resolve(root, '.local/edge-runtime.log');
    if (!existsSync(logPath)) privateWrite(logPath, '');
    const output = openSync(logPath, 'a', 0o600);
    chmodSync(logPath, 0o600);
    const child = spawn('supabase', ['functions', 'serve', '--env-file', edgeEnv, '--profile', resolve(root, '.local/supabase-profile.toml'), '--workdir', workdir], { cwd: workdir, detached: true, stdio: ['ignore', output, output] });
    child.on('error', () => {}); child.unref();
    if (!child.pid) throw Error('Servidor Edge não iniciou.');
    privateWrite(edgePid, JSON.stringify({ pid: child.pid, workdir }));
  }
  let ready = false;
  // Native cold setup can exceed 30s before the first route becomes available.
  const readyStarted = Date.now(), deadline = readyStarted + 90_000;
  while (Date.now() < deadline && !ready) {
    try {
      const response = await fetch('http://127.0.0.1:58521/functions/v1/capabilities', { signal: AbortSignal.timeout(5000) });
      if (response.status === 200) { const value = await response.json(); ready = typeof value.asaas === 'boolean' && typeof value.bunny === 'boolean'; } else await response.body?.cancel();
    } catch {}
    if (!ready) await new Promise((accept) => setTimeout(accept, 300));
  }
  privateWrite(resolve(root, '.local/edge-readiness.json'), JSON.stringify({ ready, elapsed_ms: Date.now() - readyStarted, budget_ms: 90_000, pid: JSON.parse(readFileSync(edgePid, 'utf8')).pid, source: workdir }));
  if (!ready) throw Error('Servidor Edge não respondeu por HTTP; saída privada em .local/edge-runtime.log.');
}
export function assertProject() {
  const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
  if (!/^project_id\s*=\s*"icarus-courses-local"\s*$/m.test(config) || !/\[api\][\s\S]*?port\s*=\s*58521\b/.test(config) || !/\[db\][\s\S]*?port\s*=\s*58522\b/.test(config)) throw Error('Destino local inválido. Nenhuma ação executada.');
}
export function privateWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (!existsSync(path) || !readFileSync(path).equals(Buffer.from(content))) writeFileSync(path, content, { mode: 0o600 });
  if ((statSync(path).mode & 0o777) !== 0o600) chmodSync(path, 0o600);
}
export function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    privateWrite(resolve(root, '.local/command-failure.json'), JSON.stringify({ binary, exit_code: result.status, signal: result.signal, cause: result.error?.code || null, stdout: result.stdout?.toString(), stderr: result.stderr?.toString(), checked_at: new Date().toISOString() }));
    throw Error(`${binary} não concluiu; diagnóstico privado em .local/command-failure.json.`);
  }
  return result.stdout;
}
export function cli(args) {
  assertProject();
  const profile = resolve(root, '.local/supabase-profile.toml');
  privateWrite(profile, 'name = "icarus-local"\napi_url = "https://api.supabase.com"\ndashboard_url = "https://supabase.com/dashboard"\nproject_host = "supabase.co"\n');
  return command('supabase', [...args, '--profile', profile, '--workdir', root]);
}
export async function status({ save = true } = {}) {
  const data = JSON.parse(cli(['status', '-o', 'json']));
  const api = data.API_URL || data.api_url;
  if (!['http://127.0.0.1:58521', 'http://localhost:58521'].includes(api)) throw Error('API fora do destino Icarus local.');
  const anon = data.ANON_KEY || data.anon_key, service = data.SERVICE_ROLE_KEY || data.service_role_key;
  if (!anon || !service) throw Error('Status incompleto. Chaves não exibidas.');
  const checks = await Promise.all([
    fetch(`${api}/auth/v1/health`, { headers: { apikey: anon }, signal: AbortSignal.timeout(5000) }),
    fetch(`${api}/storage/v1/status`, { headers: { apikey: anon }, signal: AbortSignal.timeout(5000) }),
    fetch(`${api}/rest/v1/rpc/app_public_context`, { method: 'POST', headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) }),
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
  const containers = JSON.parse(command('docker', ['inspect', `supabase_kong_${project}`, `supabase_db_${project}`, `supabase_inbucket_${project}`]));
  const bindings = containers.flatMap((c) => Object.values(c.HostConfig.PortBindings || {}).flat());
  const loopback = bindings.every((b) => ['127.0.0.1', '::1'].includes(b.HostIp));
  return { project, api, healthy: true, ...health, loopback, credentials_saved: save };
}
export async function main(action = process.argv[2]) {
  assertProject();
  if (action === 'start') {
    const receipt = { phase: 'native-start', completed: false };
    const stage = (phase) => { receipt.phase = phase; privateWrite(resolve(root, '.local/start-evidence.json'), JSON.stringify(receipt)); };
    stage('native-start');
    // Supabase preserves the existing project volumes; never reset to bootstrap.
    cli(['start', '-x', 'studio,imgproxy,logflare,vector,realtime,postgres-meta']);
    stage('loopback-bindings');
    const { main: repairBindings } = await import('./local-bindings.mjs');
    await repairBindings('apply');
    stage('auth-storage-postgrest-readiness');
    const deadline = Date.now() + 30_000;
    for (;;) {
      try { await status(); break; }
      catch (error) { if (Date.now() >= deadline) throw error; await new Promise((accept) => setTimeout(accept, 500)); }
    }
    stage('edge-http-readiness');
    await startFunctions();
    const health = await status();
    const journal = resolve(root, '.local/bind-repair.json');
    if (existsSync(journal)) {
      const originals = JSON.parse(readFileSync(journal, 'utf8'));
      const names = ['db', 'kong', 'inbucket'].map((name) => `/supabase_${name}_${project}`);
      if (!originals.length || originals.length > 3 || new Set(originals.map((c) => c.Name)).size !== originals.length || originals.some((c) => !names.includes(c.Name))) throw Error('Journal não contém somente backups técnicos DB/API/mail; preservado.');
      stage('finalize-technical-bind-backups');
      await repairBindings('finalize');
    }
    receipt.completed = true; stage('ready');
    console.log(JSON.stringify(health));
  } else if (action === 'functions') {
    await status(); await startFunctions(); console.log('Edge Functions respondendo por HTTP local.');
  } else if (action === 'functions-restart') {
    await stopFunctions(); await status(); await startFunctions(); console.log('Somente Edge Functions reiniciadas; Auth/DB preservados.');
  } else if (action === 'status') console.log(JSON.stringify(await status()));
  else if (action === 'stop') {
    await stopFunctions();
    const present = command('docker', ['ps', '-a', '--filter', `name=${project}`, '--format', '{{.Names}}']).split('\n').some((name) => name.endsWith(`_${project}`));
    if (present) cli(['stop', '--project-id', project]);
    console.log('Icarus local parado; volumes preservados.');
  } else throw Error('Uso: node scripts/local.mjs start|stop|status');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Operação local não concluída. Confira destino/configuração e saúde do Icarus local; nenhuma credencial foi exibida.'); process.exitCode = 1; });
