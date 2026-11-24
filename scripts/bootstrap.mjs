import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { command, localCredentials, onLocalDatabase, privateWrite, root } from './local.mjs';
import { isEntrypoint } from './installer-docker.mjs';

export function localClient(target) {
  const { api, service } = localCredentials(target);
  return createClient(api, service, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => { target.assertSocket(); return fetch(input, { ...init, redirect: 'error' }); } },
  });
}
export async function bootstrap() {
  if (!process.argv.includes('--demo')) throw Error('Bootstrap exige --demo explícito.');
  return onLocalDatabase(seedDemo);
}

async function seedDemo(target) {
  const admin = localClient(target), path = resolve(root, '.local/demo-accounts.json');
  const guard = (enabled) => target.docker(['exec', target.database, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `update ica_private.local_demo_guard set enabled=${enabled ? 'true' : 'false'} where singleton;`]);
  const accounts = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  for (const role of ['admin', 'member', 'pro', 'moderator', 'support']) {
    if (accounts[role]) {
      const check = await admin.auth.admin.getUserById(accounts[role].id);
      if (check.error) throw Error('Conta demo salva não está no Auth. Não redefini o progresso.');
      continue;
    }
    const email = `${role}@demo.icarus.invalid`, password = `Ic!9${randomBytes(24).toString('base64url')}`;
    let created;
    guard(true);
    try { created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { icarus_server_created: true, icarus_local_demo: true }, user_metadata: { full_name: `DEMONSTRAÇÃO ${role}`, demo: true } }); }
    finally { guard(false); }
    if (created.error) throw Error(`Conta demo não criada (Auth status ${created.error.status}, código ${created.error.code || 'indisponível'}); confira estado sem recriar dados.`);
    accounts[role] = { id: created.data.user.id, email, password };
    privateWrite(path, JSON.stringify(accounts, null, 2));
  }
  const seedArgs = { p_accounts: Object.fromEntries(Object.entries(accounts).map(([role, user]) => [role, user.id])) };
  const seed = async () => {
    guard(true);
    try { const result = await admin.rpc('app_local_demo', seedArgs); if (result.error || !result.data) throw Error('Helper demo local indisponível.'); return result.data; }
    finally { guard(false); }
  };
  const seeded = await seed();
  privateWrite(resolve(root, '.local/ACESSOS.md'), `# Icarus LOCAL: demonstração\n\nCredenciais sintéticas, privadas. Não usar em produção.\n\n${Object.entries(accounts).map(([role, user]) => `- ${role}: ${user.email} | ${user.password}`).join('\n')}\n\nMFA é opcional. Contas com fator verificado precisam do código no login.\n`);
  const fixture = resolve(root, '.local/demo-8s.mp4');
  if (!existsSync(fixture)) command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=640x360:r=24:d=8', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', fixture]);
  for (const [path, content, type] of [[seeded.lesson_path, readFileSync(fixture), 'video/mp4'], [seeded.material_path, 'DEMONSTRAÇÃO: material sintético local do Icarus.\nNão representa conteúdo ou cliente real.\n', 'text/plain']]) {
    const separator = path.lastIndexOf('/');
    const existing = await admin.storage.from('icarus-private').list(path.slice(0, separator), { search: path.slice(separator + 1), limit: 100 });
    if (existing.error || !existing.data) throw Error('Não foi possível conferir a fixture; nenhum arquivo foi sobrescrito.');
    if (!existing.data.some((file) => file.name === path.slice(separator + 1))) { const result = await admin.storage.from('icarus-private').upload(path, content, { contentType: type, upsert: false }); if (result.error) throw Error('Fixture não enviada ao bucket privado.'); }
  }
  await seed();
  privateWrite(resolve(root, '.local/demo-resources.json'), JSON.stringify({ ...seeded, storage_path: seeded.lesson_path }, null, 2));
  console.log('Demonstração local criada/preservada; acessos em .local/ACESSOS.md (600), vídeo privado de 8s.');
}
if (isEntrypoint(import.meta.url)) bootstrap().catch((error) => { console.error(`Bootstrap incompleto: ${error.message} Credenciais omitidas.`); process.exitCode = 1; });
