import { closeSync, openSync, readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { onLocalDatabase, privateWrite, project, root } from './local.mjs';
import { isEntrypoint } from './installer-docker.mjs';

const schemas = ['public', 'app_private', 'auth', 'storage', 'extensions'];
const sql = ({ docker, database: id }, database, statement) => docker(['exec', id, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database, '-Atqc', statement]);
function archiveCommand(docker, args, file, direction) {
  if (direction === 'out') privateWrite(file, '');
  const descriptor = openSync(file, direction === 'out' ? 'w' : 'r', 0o600);
  try { return docker(args, { stdio: direction === 'out' ? ['ignore', descriptor, 'pipe'] : [descriptor, 'pipe', 'pipe'] }); }
  finally { closeSync(descriptor); }
}
export function protections(target, database) {
  return JSON.parse(sql(target, database, `select jsonb_build_object(
    'rpcs',coalesce((select jsonb_agg(jsonb_build_object('signature',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')','owner',pg_get_userbyid(p.proowner),'role',r.name,'execute',has_function_privilege(r.name,p.oid,'EXECUTE')) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),r.name) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values('anon'),('authenticated'),('service_role'))r(name) where n.nspname in ('public','app_private','auth','storage')),'[]'::jsonb),
    'tables',coalesce((select jsonb_agg(jsonb_build_object('name',n.nspname||'.'||c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'role',r.name,'privileges',array[has_table_privilege(r.name,c.oid,'SELECT'),has_table_privilege(r.name,c.oid,'INSERT'),has_table_privilege(r.name,c.oid,'UPDATE'),has_table_privilege(r.name,c.oid,'DELETE'),has_table_privilege(r.name,c.oid,'TRUNCATE'),has_table_privilege(r.name,c.oid,'REFERENCES'),has_table_privilege(r.name,c.oid,'TRIGGER')]) order by n.nspname,c.relname,r.name) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join(values('anon'),('authenticated'),('service_role'))r(name) where c.relkind in('r','p','v','m') and n.nspname in('public','app_private','auth','storage')),'[]'::jsonb),
    'policies',coalesce((select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in('public','app_private','auth','storage')),'[]'::jsonb),
    'default_acl',coalesce((select jsonb_agg(jsonb_build_object('role',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'kind',d.defaclobjtype,'acl',(select jsonb_agg(v::text order by v::text) from unnest(d.defaclacl)v)) order by n.nspname,pg_get_userbyid(d.defaclrole),d.defaclobjtype) from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in('public','app_private','auth','storage')),'[]'::jsonb))`));
}
function binaryManifest(docker, targetContainer, directory) {
  if (!['/mnt', '/tmp'].some((prefix) => directory === prefix || directory.startsWith(`${prefix}/icarus_restore_`))) throw Error('Destino binário inválido.');
  return docker(['exec', targetContainer, 'sh', '-c', `cd ${directory} && find . -type f -exec sha256sum {} +`]).split('\n').filter(Boolean).sort().join('\n');
}
export function fingerprint(target, database) {
  const tables = sql(target, database, "select schemaname||'.'||tablename from pg_tables where schemaname in ('public','app_private','auth','storage') order by 1").trim().split('\n').filter(Boolean);
  return Object.fromEntries(tables.map((table) => [table, sql(target, database, `select count(*)||':'||md5(coalesce(string_agg(row_hash,'' order by row_hash),'')) from (select md5(row_to_json(t)::text) row_hash from ${table} t) q`).trim()]));
}
export async function main(action = process.argv[2]) {
  if (!['dump', 'verify-restore'].includes(action)) throw Error('Uso: node scripts/backup.mjs dump|verify-restore');
  return onLocalDatabase((target) => backup(target, action));
}

function backup(target, action) {
  const { docker, database: container, containers } = target;
  const archive = resolve(root, '.local/backups/icarus.dump');
  const binaries = resolve(root, '.local/backups/icarus-storage.tar.gz');
  if (action === 'dump') {
    const storage = containers.find(({ Name }) => Name === `/supabase_storage_${project}`);
    const volume = storage.Mounts?.find((mount) => mount.Destination === '/mnt');
    if (volume?.Name !== `supabase_storage_${project}`) throw Error('Volume Storage fora do projeto esperado.');
    const dumpSchemas = [...schemas, ...(sql(target, 'postgres', "select to_regnamespace('supabase_migrations') is not null").trim() === 't' ? ['supabase_migrations'] : [])];
    archiveCommand(docker, ['exec', container, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--format=custom', ...dumpSchemas.flatMap((schema) => ['--schema', schema])], archive, 'out');
    archiveCommand(docker, ['exec', storage.Id, 'tar', '-C', '/mnt', '-czf', '-', '.'], binaries, 'out');
    privateWrite(resolve(root, '.local/backups/storage-manifest.txt'), binaryManifest(docker, storage.Id, '/mnt'));
    console.log('Dump SQL e binários Storage privados criados (600); pause escritas durante a captura.');
  } else if (action === 'verify-restore') {
    if (!existsSync(archive)) throw Error('Crie o dump primeiro.');
    const database = `icarus_restore_${randomBytes(6).toString('hex')}`;
    docker(['exec', container, 'createdb', '-U', 'supabase_admin', '--template=template0', database]);
    try {
      sql(target, database, 'create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists "uuid-ossp" with schema extensions;');
      const listing = docker(['exec', '-i', container, 'pg_restore', '-l'], { input: readFileSync(archive) });
      const listPath = resolve(root, '.local/backups/restore.list');
      privateWrite(listPath, listing.split('\n').filter((line) => !/ SCHEMA - (public|extensions) /.test(line)).join('\n'));
      docker(['cp', listPath, `${container}:/tmp/${database}.list`]);
      try { archiveCommand(docker, ['exec', '-i', container, 'pg_restore', '-U', 'supabase_admin', '-d', database, '--exit-on-error', ...(process.argv.includes('--omit-acl-negative') ? ['--no-privileges'] : []), '--use-list', `/tmp/${database}.list`], archive, 'in'); }
      finally { docker(['exec', container, 'rm', `/tmp/${database}.list`]); }
      const source = fingerprint(target, 'postgres'), restored = fingerprint(target, database);
      const passed = JSON.stringify(source) === JSON.stringify(restored);
      const sourceProtections = protections(target, 'postgres'), restoredProtections = protections(target, database);
      const permissionsMatch = JSON.stringify(sourceProtections) === JSON.stringify(restoredProtections);
      privateWrite(resolve(root, '.local/backups/restore-protections.json'), JSON.stringify({ source: sourceProtections, restored: restoredProtections, permissions_match: permissionsMatch }));
      if (!existsSync(binaries)) throw Error('Arquivo binário do Storage ausente.');
      const directory = `/tmp/${database}-storage`;
      const entries = docker(['exec', '-i', container, 'tar', '-tzf', '-'], { input: readFileSync(binaries), maxBuffer: 16 * 1024 * 1024 });
      if (entries.split('\n').some((entry) => entry.startsWith('/') || entry.split('/').includes('..'))) throw Error('Arquivo Storage contém caminho inseguro.');
      docker(['exec', container, 'mkdir', directory]);
      let binariesMatch = false;
      try {
        archiveCommand(docker, ['exec', '-i', container, 'tar', '-xzf', '-', '--no-same-owner', '--no-same-permissions', '-C', directory], binaries, 'in');
        binariesMatch = binaryManifest(docker, container, directory) === readFileSync(resolve(root, '.local/backups/storage-manifest.txt'), 'utf8');
      } finally { docker(['exec', container, 'rm', '-r', directory]); }
      privateWrite(resolve(root, `.local/backups/${process.argv.includes('--omit-acl-negative') ? 'restore-negative-acl' : 'restore-evidence'}.json`), JSON.stringify({ destination: database, tables: Object.keys(source).length, rows_match: passed, permissions_match: permissionsMatch, rpc_role_checks: sourceProtections.rpcs.length, table_role_checks: sourceProtections.tables.length, policies_checked: sourceProtections.policies.length, storage_binaries_match: binariesMatch, binary_files: entries.split('\n').filter((entry) => entry && !entry.endsWith('/')).length, checked_at: new Date().toISOString(), scope: schemas, excludes: ['cluster roles', 'external services'] }, null, 2));
      if (!passed) throw Error('Comparação de dados divergiu.');
      if (!binariesMatch) throw Error('Comparação binária do Storage divergiu.');
      if (!permissionsMatch) throw Error('RLS/ACL/owners/policies do restore divergiram.');
      console.log(`Restore isolado conferido: ${Object.keys(source).length} tabelas, binários e RLS/ACL/owners/policies iguais.`);
    } finally { docker(['exec', container, 'dropdb', '-U', 'supabase_admin', database]); }
  }
}
if (isEntrypoint(import.meta.url)) main().catch((error) => { console.error(`Backup/restore não concluído. ${error.message}`); process.exitCode = 1; });
