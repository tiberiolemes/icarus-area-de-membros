import { createHash } from 'node:crypto';
import { copyFileSync, constants, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertProject, command, privateWrite, root } from './local.mjs';
import { runSqlTests } from './test-db.mjs';
import { assertNewDockerInventory, createInstallerNetwork, inspectContainers, inspectNetwork, installedContainers, isEntrypoint, onInstallerDocker, preflightNewDocker } from './installer-docker.mjs';
import { assertBindings } from './local-bindings.mjs';

const project = 'icarus-courses-install-qa';
const networkName = 'icarus-install-qa-loopback';
const qa = resolve(root, '.local/clean-install');
const ownership = resolve(qa, '.local/installation.json');
const qaConfig = resolve(qa, 'supabase/config.toml');
const sourceMigrations = resolve(root, 'supabase/migrations');
const qaMigrations = resolve(qa, 'supabase/migrations');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const filePresent = (path) => lstatSync(path, { throwIfNoEntry: false });

function migrationFiles(dir) {
  if (!lstatSync(dir).isDirectory()) throw Error('Diretório de migrations precisa ser próprio.');
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || !/^\d{12}_[\w-]+\.sql$/.test(entry.name))) throw Error('Entrada inesperada nas migrations.');
  const names = entries.map(({ name }) => name).sort();
  if (new Set(names.map(version)).size !== names.length) throw Error('Versão de migration repetida.');
  return names;
}
function version(name) { return name.split('_')[0]; }

export function migrationTransaction(file, bytes, prefix) {
  const contents = bytes.toString('utf8').trim();
  const body = /^begin;\r?\n([\s\S]+)\r?\ncommit;$/i.exec(contents)?.[1];
  if (!body) throw Error(`Migration ${file} precisa estar delimitada por BEGIN e COMMIT em linhas próprias.`);
  const history = 'supabase_migrations.schema_migrations';
  const expected = `ARRAY[${prefix.map((item) => `'${item}'`).join(', ')}]::text[]`;
  const statement = `pg_catalog.convert_from(pg_catalog.decode('${Buffer.from(body).toString('hex')}', 'hex'), 'UTF8')`;
  // PostgreSQL prevents nested transaction control inside this DO while the outer transaction is active.
  return `BEGIN;
LOCK TABLE ${history} IN SHARE ROW EXCLUSIVE MODE;
DO $icarus_migration$
BEGIN
  IF ARRAY(SELECT version FROM ${history} ORDER BY version) IS DISTINCT FROM ${expected} THEN
    RAISE EXCEPTION 'Histórico QA mudou antes da migration';
  END IF;
  EXECUTE ${statement};
END;
$icarus_migration$;
INSERT INTO ${history} (version, name, statements)
VALUES ('${version(file)}', '${file.slice(13, -4)}', ARRAY[${statement}]);
COMMIT;
`;
}

export async function main(action = process.argv[2] ?? 'install') {
  if (!['install', 'verify', 'upgrade'].includes(action)) throw Error('Uso: node scripts/clean-install.mjs [install|verify|upgrade]');
  assertProject();
  const localDir = filePresent(resolve(root, '.local'));
  if (localDir && !localDir.isDirectory()) throw Error('.local precisa ser um diretório próprio.');
  if (action === 'install' && filePresent(qa)) throw Error('Diretório QA já existe, inclusive instalações parciais.');
  const sourceFiles = migrationFiles(sourceMigrations);
  if (!sourceFiles.length) throw Error('Nenhuma migration fonte encontrada.');
  const expected = sourceFiles.map(version);

  await onInstallerDocker(command, async (target) => {
    const { id, env, docker, native, assertCli, assertDaemon } = target;
    let state;
    if (action === 'install') {
      assertCli();
      await preflightNewDocker(docker, [58622]);
      const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8')
        .replace(/^project_id\s*=\s*"icarus-courses-local"\s*$/m, `project_id = "${project}"`)
        .replace(/^(port|shadow_port|inspector_port) = 585(\d\d)$/gm, '$1 = 586$2');
      if (!/^\[db\][^\[]*?^port = 58622$/m.test(config)) throw Error('Porta fonte do Postgres inesperada.');
      mkdirSync(resolve(root, '.local'), { recursive: true, mode: 0o700 });
      mkdirSync(qa, { mode: 0o700 });
      mkdirSync(qaMigrations, { recursive: true, mode: 0o700 });
      for (const file of sourceFiles) copyFileSync(resolve(sourceMigrations, file), resolve(qaMigrations, file), constants.COPYFILE_EXCL);
      copyFileSync(resolve(root, 'supabase/seed.sql'), resolve(qa, 'supabase/seed.sql'), constants.COPYFILE_EXCL);
      privateWrite(qaConfig, config);
      assertDaemon();
      const network = createInstallerNetwork(docker, networkName);
      assertNewDockerInventory(docker, network);
      privateWrite(resolve(qa, '.local/native-start.log'), native(['db', 'start', '--network-id', networkName], qa));
      const ids = installedContainers(docker);
      if (ids.length !== 1) throw Error('Instalação DB-only retornou um inventário inesperado.');
      state = { daemon: id, database: ids[0], network, config: digest(config) };
    } else {
      if (!filePresent(qa)?.isDirectory() || !filePresent(resolve(qa, 'supabase'))?.isDirectory() ||
          !filePresent(resolve(qa, '.local'))?.isDirectory() || !filePresent(ownership)?.isFile()) {
        throw Error('QA sem registro de origem de um install concluído.');
      }
      state = JSON.parse(readFileSync(ownership, 'utf8'));
    }
    if (state.daemon !== id) throw Error('O QA foi criado em outro daemon Docker.');
    const checkDatabase = () => {
      if (inspectNetwork(docker, networkName) !== state.network) throw Error('A rede registrada do QA mudou.');
      const [database] = inspectContainers(docker, [state.database]);
      if (database.Name !== `/supabase_db_${project}`) throw Error('O Postgres registrado mudou de nome.');
      assertBindings(database, project, { name: networkName, id: state.network }, { '5432/tcp': '58622' });
    };
    checkDatabase();
    if (!filePresent(qaConfig)?.isFile()) throw Error('Configuração QA precisa ser um arquivo próprio.');
    const config = readFileSync(qaConfig, 'utf8');
    if (digest(config) !== state.config) throw Error('Configuração QA mudou desde o install.');
    const qaFiles = migrationFiles(qaMigrations);
    if (qaFiles.some((file, i) => file !== sourceFiles[i] ||
        !readFileSync(resolve(qaMigrations, file)).equals(readFileSync(resolve(sourceMigrations, file))))) {
      throw Error('A cópia QA das migrations diverge da fonte atual.');
    }

    const history = () => docker(['exec', state.database, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
      '-Atqc', 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version']).trim().split('\n').filter(Boolean);
    let actual = history();
    if (!actual.length || actual.length > qaFiles.length || actual.some((value, i) => value !== expected[i])) {
      throw Error('Histórico QA precisa ser um prefixo consecutivo correspondente aos arquivos locais.');
    }
    if (action === 'upgrade' && actual.length < expected.length) {
      const pending = sourceFiles.slice(actual.length).map((file, index) => {
        const bytes = readFileSync(resolve(index + actual.length < qaFiles.length ? qaMigrations : sourceMigrations, file));
        return { file, bytes, input: migrationTransaction(file, bytes, expected.slice(0, actual.length + index)) };
      });
      // Stage the original bytes before committing any version so retries can validate the applied prefix.
      for (const { file, bytes } of pending.slice(qaFiles.length - actual.length)) {
        writeFileSync(resolve(qaMigrations, file), bytes, { flag: 'wx', mode: 0o600 });
      }
      for (const { input } of pending) {
        docker(['exec', '-i', state.database, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres',
          '-d', 'dbname=postgres application_name=icarus-qa-upgrade', '-f', '-'],
          { input, logFailure: true });
      }
      checkDatabase();
      actual = history();
    }
    if (actual.length !== expected.length || actual.some((value, i) => value !== expected[i])) throw Error('Histórico nativo não corresponde às migrations fonte.');
    assertDaemon();
    const tests = runSqlTests({ workdir: qa, databaseContainer: state.database, testsDir: resolve(root, 'supabase/tests'), env, assertSocket: target.assertSocket });
    if (action === 'install') privateWrite(ownership, JSON.stringify(state));
    const receipt = { action, installed_by_native_cli: action === 'install' ? true : null, native_history_matches: true,
      migrations: actual.length, loopback: true, qa_project: project, tests, checked_at: new Date().toISOString() };
    privateWrite(resolve(root, '.local/clean-install-evidence.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  });
}
if (isEntrypoint(import.meta.url)) main().catch((error) => {
  console.error(`Operação QA incompleta: ${error.message}`);
  process.exitCode = 1;
});
