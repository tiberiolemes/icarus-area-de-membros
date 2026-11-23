import http from 'node:http';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertProject, command, privateWrite, project, root } from './local.mjs';

const installQa = process.env.ICARUS_BIND_INSTALL_QA === '1';
const bindProject = installQa ? 'icarus-courses-install-qa' : project;
const names = (installQa ? ['db'] : ['db', 'kong', 'inbucket', 'edge_runtime', 'studio', 'pooler', 'analytics']).map((name) => `supabase_${name}_${bindProject}`);
const journal = resolve(root, '.local/bind-repair.json');
const canonical = (value) => JSON.stringify(value, function (_key, item) { return item && !Array.isArray(item) && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item; });
const socket = () => {
  const endpoint = process.env.DOCKER_HOST || JSON.parse(command('docker', ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}']).trim());
  if (!endpoint.startsWith('unix://')) throw Error('Reparo permitido somente no Docker local via Unix socket.');
  return endpoint.slice(7);
};
async function api(method, path, body) {
  return await new Promise((accept, reject) => {
    const req = http.request({ socketPath: socket(), path: `/v1.47${path}`, method, headers: body ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let value = ''; res.setEncoding('utf8'); res.on('data', (part) => { value += part; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(Error(`Docker ${method} ${path.split('?')[0]} falhou (${res.statusCode}; detalhes privados omitidos).`));
        try { accept(value ? JSON.parse(value) : null); } catch { reject(Error('Resposta Docker inválida.')); }
      });
    });
    req.on('error', () => reject(Error('Docker local indisponível.'))); req.setTimeout(30_000, () => req.destroy(Error('Docker timeout')));
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
function allowed(container) {
  const name = container.Name.slice(1);
  if (!names.includes(name)) throw Error('Container fora da allowlist Icarus.');
  return name;
}
function creation(original) {
  const host = structuredClone(original.HostConfig);
  for (const bindings of Object.values(host.PortBindings || {})) for (const binding of bindings || []) binding.HostIp = '127.0.0.1';
  // Refuse anonymous implicit mounts rather than change volume ownership or configuration.
  for (const mount of original.Mounts || []) if (!(host.Binds || []).some((bind) => bind.startsWith(`${mount.Type === 'volume' ? mount.Name : mount.Source}:${mount.Destination}`)) && !(host.Mounts || []).some((m) => m.Source === mount.Name && m.Target === mount.Destination)) throw Error('Mount não explicitamente preservável.');
  const endpoints = Object.fromEntries(Object.entries(original.NetworkSettings.Networks).map(([network, value]) => [network, { Aliases: (value.Aliases || []).filter((alias) => alias !== original.Id && alias !== original.Id.slice(0, 12)), IPAMConfig: value.IPAMConfig, DriverOpts: value.DriverOpts }]));
  return { ...original.Config, HostConfig: host, NetworkingConfig: { EndpointsConfig: endpoints } };
}
async function restore(snapshots) {
  const inventory = await api('GET', '/containers/json?all=1');
  if (snapshots.some((old) => !inventory.some((c) => c.Id === old.Id))) throw Error('Original ausente. Rollback não é possível; containers atuais foram preservados.');
  for (const old of [...snapshots].reverse()) {
    const name = allowed(old), backup = `${name}-bind-backup`;
    const all = await api('GET', '/containers/json?all=1');
    const preserved = all.find((c) => c.Id === old.Id);
    if (!preserved) throw Error('Original desapareceu; rollback incompleto.');
    const replacement = all.find((c) => c.Id !== old.Id && c.Names.includes(`/${name}`));
    if (replacement) { if (replacement.State === 'running') await api('POST', `/containers/${replacement.Id}/stop?t=15`); await api('DELETE', `/containers/${replacement.Id}?v=false`); }
    if (preserved.Names.includes(`/${backup}`)) await api('POST', `/containers/${old.Id}/rename?name=${encodeURIComponent(name)}`);
    const now = await api('GET', `/containers/${old.Id}/json`);
    for (const [network, settings] of Object.entries(old.NetworkSettings.Networks)) if (!now.NetworkSettings.Networks[network]) await api('POST', `/networks/${encodeURIComponent(network)}/connect`, { Container: old.Id, EndpointConfig: { Aliases: settings.Aliases, IPAMConfig: settings.IPAMConfig } });
    if (old.State.Running && !now.State.Running) await api('POST', `/containers/${old.Id}/start`);
  }
}
function verifyReplacement(old, current) {
  const expected = creation(old);
  // Inspect varies null/false for this unset QA default; an enabled OOM-disable flag is never ignored.
  const host = (value) => installQa ? { ...value, OomKillDisable: value.OomKillDisable ?? false } : value;
  const aliases = (value) => Object.fromEntries(Object.entries(value.NetworkSettings.Networks).map(([network, settings]) => [network, (settings.Aliases || []).filter((alias) => ![old.Id, old.Id.slice(0, 12), current.Id, current.Id.slice(0, 12)].includes(alias)).sort()]));
  if (canonical(host(current.HostConfig)) !== canonical(host(expected.HostConfig)) || canonical(old.Config) !== canonical(current.Config) || canonical(old.Mounts) !== canonical(current.Mounts) || canonical(aliases(old)) !== canonical(aliases(current))) {
    const differing = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => canonical(a[key]) !== canonical(b[key]));
    privateWrite(resolve(root, '.local/bind-comparison.json'), JSON.stringify({ config_keys: differing(old.Config, current.Config), host_keys: differing(expected.HostConfig, current.HostConfig), mounts_equal: canonical(old.Mounts) === canonical(current.Mounts), aliases_equal: canonical(aliases(old)) === canonical(aliases(current)) }));
    throw Error('Configuração não preservada.');
  }
}
async function checkHealth() {
  const health = installQa ? { db: false } : { db: false, auth: false, storage: false }, deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { command('docker', ['exec', `supabase_db_${bindProject}`, 'pg_isready', '-U', 'postgres', '-d', 'postgres']); health.db = true; } catch { health.db = false; }
    for (const [name, url] of [['auth', 'http://127.0.0.1:58521/auth/v1/health'], ['storage', 'http://127.0.0.1:58521/storage/v1/status']]) {
      if (installQa) continue;
      try { health[name] = (await fetch(url, { signal: AbortSignal.timeout(1500) })).status === 200; } catch { health[name] = false; }
    }
    if (Object.values(health).every(Boolean)) break;
    await new Promise((accept) => setTimeout(accept, 500));
  }
  privateWrite(resolve(root, '.local/bind-health.json'), JSON.stringify({ ...health, checked_at: new Date().toISOString() }));
  if (!Object.values(health).every(Boolean)) throw Error('Saúde incompleta após reparo.');
  return health;
}
export async function main(action = process.argv[2] || 'dry-run') {
  if (installQa) {
    const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
    if (!root.endsWith('/.local/clean-install') || !/^project_id = "icarus-courses-install-qa"$/m.test(config) || !/port = 58622\b/.test(config)) throw Error('QA fora da allowlist de instalação isolada.');
  } else assertProject();
  if (action === 'rollback') { await restore(JSON.parse(readFileSync(journal, 'utf8'))); privateWrite(`${journal}.rolled-back`, readFileSync(journal)); unlinkSync(journal); console.log('Bindings anteriores restaurados; volumes preservados.'); return; }
  if (existsSync(journal) && ['apply', 'finalize'].includes(action)) {
    const snapshots = JSON.parse(readFileSync(journal, 'utf8'));
    for (const old of snapshots) {
      allowed(old);
      verifyReplacement(old, await api('GET', `/containers/${encodeURIComponent(old.Name.slice(1))}/json`));
      if (!old.removed) {
        const original = await api('GET', `/containers/${old.Id}/json`);
        if (original.State.Running || original.Name !== `${old.Name}-bind-backup`) throw Error('Original fora do estado parado esperado.');
      }
    }
    const health = await checkHealth();
    if (action === 'finalize') {
      for (const old of snapshots) if (!old.removed) {
        await api('DELETE', `/containers/${old.Id}?v=false`);
        old.removed = true; privateWrite(journal, JSON.stringify(snapshots));
      }
      privateWrite(resolve(root, `.local/bind-repair-completed-${Date.now()}.json`), JSON.stringify({ status: 'complete', applied: true, removed_containers: snapshots.length, volumes_removed: 0, snapshots, health, completed_at: new Date().toISOString() }));
      unlinkSync(journal);
      console.log(JSON.stringify({ finalized: true, ...health, volumes_removed: 0 }));
    } else console.log(JSON.stringify({ already_applied: true, ...health, originals: 'stopped-preserved-for-rollback' }));
    return;
  }
  const all = await api('GET', '/containers/json?all=1');
  const targets = [];
  for (const c of all.filter((c) => c.Names.some((n) => names.includes(n.slice(1))))) {
    const inspected = await api('GET', `/containers/${c.Id}/json`);
    const bindings = Object.values(inspected.HostConfig.PortBindings || {}).flat().filter(Boolean);
    if (bindings.some((b) => !['127.0.0.1', '::1'].includes(b.HostIp))) targets.push(inspected);
  }
  if (action === 'dry-run') { console.log(JSON.stringify(targets.map((c) => ({ name: allowed(c), ports: Object.values(c.HostConfig.PortBindings).flat().map((b) => ({ from: b.HostIp || '0.0.0.0', to: '127.0.0.1', port: b.HostPort })), volumes_preserved: c.Mounts.length })))); return; }
  if (action !== 'apply') throw Error('Uso: local-bindings.mjs dry-run|apply|rollback|finalize');
  if (!targets.length) { console.log('Bindings Icarus já limitados ao loopback.'); return; }
  privateWrite(journal, JSON.stringify(targets));
  try {
    for (const old of targets) {
      const name = allowed(old), replacement = creation(old);
      if (old.State.Running) await api('POST', `/containers/${old.Id}/stop?t=15`);
      for (const network of Object.keys(old.NetworkSettings.Networks)) await api('POST', `/networks/${encodeURIComponent(network)}/disconnect`, { Container: old.Id });
      await api('POST', `/containers/${old.Id}/rename?name=${encodeURIComponent(`${name}-bind-backup`)}`);
      const created = await api('POST', `/containers/create?name=${encodeURIComponent(name)}`, replacement);
      if (old.State.Running || installQa) await api('POST', `/containers/${created.Id}/start`);
      const check = await api('GET', `/containers/${created.Id}/json`);
      verifyReplacement(old, check);
    }
    const health = await checkHealth();
    // Keep stopped originals until the coordinator verifies SQL/Auth/Storage; rollback remains available.
    console.log(JSON.stringify({ applied: true, ...health, originals: 'stopped-preserved-for-rollback' }));
  } catch (error) {
    await restore(targets);
    unlinkSync(journal);
    throw Error(`Reparo falhou e foi revertido: ${error.message}`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) main().catch((error) => { console.error(`Reparo não concluído: ${error.message} Consulte o journal privado antes de qualquer nova ação.`); process.exitCode = 1; });
