import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertProject, onLocalDatabase, privateWrite, root } from './local.mjs';
import { dockerId, isEntrypoint } from './installer-docker.mjs';

export function runSqlTests({ workdir = root, databaseContainer, testsDir = resolve(workdir, 'supabase/tests'), env, assertSocket }) {
  const config = readFileSync(resolve(workdir, 'supabase/config.toml'), 'utf8');
  if (!dockerId.test(databaseContainer) || !env.DOCKER_HOST?.startsWith('unix:///')) throw Error('SQL exige ID completo e socket do instalador.');
  if (workdir === root) assertProject();
  else if (
    !/^project_id = "icarus-courses-install-qa"$/m.test(config) || !/^\[db\][^\[]*?^port = 58622$/m.test(config)) throw Error('Destino SQL fora do Icarus local/QA.');
  const files = readdirSync(testsDir).filter((name) => name.endsWith('.sql')).sort();
  if (!files.length) throw Error('Nenhum teste SQL encontrado.');
  const results = [];
  for (const name of files) {
    const source = readFileSync(resolve(testsDir, name), 'utf8');
    if (!/^begin;/im.test(source) || !/rollback;\s*$/im.test(source)) throw Error('Teste SQL precisa terminar com rollback.');
    assertSocket();
    const result = spawnSync('docker', ['exec', '-i', databaseContainer, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { env, input: source, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    privateWrite(resolve(workdir, '.local/test-db', `${name}.log`), `${result.stdout || ''}\n${result.stderr || ''}`);
    const denominators = (result.stdout || '').split('\n').filter((line) => /^\d+$/.test(line.trim())).map(Number);
    results.push({ file: name, exit_code: result.status, assertions: denominators.at(-1) ?? null });
    if (result.error || result.status !== 0) { privateWrite(resolve(workdir, '.local/test-db/result.json'), JSON.stringify({ passed: false, results }, null, 2)); throw Error(`Teste SQL ${name} falhou; detalhes privados preservados.`); }
  }
  const concurrency = resolve(testsDir, 'outbox_concurrency.py');
  assertSocket();
  const race = spawnSync('python3', [concurrency], { env: { ...env, ICARUS_DB_CONTAINER: databaseContainer }, encoding: 'utf8', timeout: 45_000, maxBuffer: 1024 * 1024 });
  privateWrite(resolve(workdir, '.local/test-db/outbox_concurrency.log'), `${race.stdout || ''}\n${race.stderr || ''}`);
  const raceCount = Number((race.stdout || '').match(/(\d+) assertions passed/)?.[1]);
  results.push({ file: 'outbox_concurrency.py', exit_code: race.status, assertions: Number.isFinite(raceCount) ? raceCount : null });
  const receipt = { passed: !race.error && race.status === 0 && raceCount === 4, results, checked_at: new Date().toISOString() };
  privateWrite(resolve(workdir, '.local/test-db/result.json'), JSON.stringify(receipt, null, 2));
  if (!receipt.passed) throw Error('Corrida SQL de duas sessões falhou; saída privada preservada.');
  console.log(JSON.stringify(receipt)); return receipt;
}
if (isEntrypoint(import.meta.url)) {
  onLocalDatabase((target) => {
    return runSqlTests({ databaseContainer: target.database, env: target.env, assertSocket: target.assertSocket });
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
