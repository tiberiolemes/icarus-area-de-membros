import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProject, command, privateWrite, root } from './local.mjs';
import { runSqlTests } from './test-db.mjs';

const qaProject = 'icarus-courses-install-qa', network = 'icarus-install-qa-loopback';
const qa = resolve(root, '.local/clean-install');
function native(args) {
  return command('supabase', [...args, '--profile', resolve(qa, '.local/supabase-profile.toml'), '--workdir', qa]);
}
function sql(statement) { return command('docker', ['exec', `supabase_db_${qaProject}`, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-Atqc', statement]).trim(); }
export async function main(action = process.argv[2]) {
  assertProject();
  if (!['verify', 'upgrade'].includes(action)) {
  if (existsSync(resolve(qa, 'supabase/config.toml'))) throw Error('QA já existe. Use verify para conferir a instalação existente, sem reset.');
  const present = command('docker', ['ps', '-a', '--filter', `name=supabase_db_${qaProject}`, '--format', '{{.Names}}']).trim();
  if (present) throw Error('QA container já existe; nenhuma alteração executada.');
  mkdirSync(resolve(qa, 'supabase'), { recursive: true, mode: 0o700 });
  for (const entry of ['migrations', 'tests', 'functions', 'seed.sql']) cpSync(resolve(root, 'supabase', entry), resolve(qa, 'supabase', entry), { recursive: true });
  const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8').replace('project_id = "icarus-courses-local"', `project_id = "${qaProject}"`).replaceAll('585', '586');
  privateWrite(resolve(qa, 'supabase/config.toml'), config);
  privateWrite(resolve(qa, '.local/supabase-profile.toml'), 'name = "icarus-install-qa"\napi_url = "https://api.supabase.com"\ndashboard_url = "https://supabase.com/dashboard"\nproject_host = "supabase.co"\n');
  command('docker', ['network', 'create', '--driver', 'bridge', '--label', 'icarus.qa=clean-install', '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', network]);
  // One fresh DB only; native CLI owns its bootstrap and actual migration history.
  const started = native(['db', 'start', '--network-id', network]);
  privateWrite(resolve(qa, '.local/native-start.log'), started);
  }
  if (action === 'upgrade') {
    for (const entry of ['migrations', 'tests']) cpSync(resolve(root, 'supabase', entry), resolve(qa, 'supabase', entry), { recursive: true });
  }
  const bindScript = fileURLToPath(new URL('./local-bindings.mjs', import.meta.url));
  command(process.execPath, [bindScript, 'apply'], { env: { ...process.env, ICARUS_LOCAL_WORKDIR: qa, ICARUS_BIND_INSTALL_QA: '1' } });
  command('docker', ['start', `supabase_db_${qaProject}`]);
  const hasHistory = sql("select to_regclass('supabase_migrations.schema_migrations') is not null");
  if (hasHistory !== 't' || action === 'upgrade') privateWrite(resolve(qa, '.local/native-migrations.log'), native(['migration', 'up', '--local', '--include-all']));
  const actual = sql('select version from supabase_migrations.schema_migrations order by version').split('\n');
  const expected = readdirSync(resolve(qa, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).map((name) => name.split('_')[0]).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Histórico nativo não corresponde às migrations fonte.');
  const inspected = JSON.parse(command('docker', ['inspect', `supabase_db_${qaProject}`]))[0];
  const ports = Object.values(inspected.NetworkSettings.Ports || {}).flat().filter(Boolean);
  if (!ports.length || !ports.every((p) => p.HostIp === '127.0.0.1' && p.HostPort === '58622')) throw Error('QA não está restrito à porta loopback esperada.');
  const tests = runSqlTests({ workdir: qa, databaseContainer: `supabase_db_${qaProject}` });
  const receipt = { installed_by_native_cli: true, native_history_matches: true, migrations: actual.length, loopback: true, qa_project: qaProject, tests, checked_at: new Date().toISOString() };
  privateWrite(resolve(root, '.local/clean-install-evidence.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
  // Preserve the isolated DB/volume for inspection; cleanup is explicit, never a broad prune.
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(`Instalação QA incompleta: ${error.message} Estado preservado.`); process.exitCode = 1; });
