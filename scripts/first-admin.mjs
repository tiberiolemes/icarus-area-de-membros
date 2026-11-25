import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { localClient } from './bootstrap.mjs';
import { onLocalDatabase, privateWrite, root } from './local.mjs';

async function firstAdmin(target) {
  const file = resolve(root, '.local/first-admin.json');
  if (process.argv[2] === 'invite') {
    const email = process.argv[3];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error();
    const admin = localClient(target);
    const created = await admin.auth.admin.createUser({ email, email_confirm: false, app_metadata: { icarus_server_created: true, icarus_password_setup_required: true } });
    if (created.error || !created.data.user) throw Error();
    privateWrite(file, JSON.stringify({ id: created.data.user.id, database: target.database, email, created_at: new Date().toISOString() }));
    const invite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: 'http://127.0.0.1:8088/auth/callback' });
    if (invite.error) throw Error();
    console.log('Convite nativo solicitado; confirme recebimento e primeira senha antes de promover.');
  } else if (process.argv[2] === 'promote') {
    const { id, database } = JSON.parse(readFileSync(file, 'utf8'));
    if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id) || (database !== undefined && database !== target.database)) throw Error();
    const sql = `do $$ begin if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id='${id}'::uuid and not p.demo and not p.suspended and not p.password_setup_required and u.email_confirmed_at is not null and u.raw_app_meta_data->>'icarus_server_created'='true') then raise exception 'Confirmação de email e primeira senha são obrigatórias.'; end if; update public.profiles set role='admin' where id='${id}'::uuid; end $$;`;
    target.docker(['exec', '-i', target.database, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: sql });
    console.log('Primeiro administrador específico promovido após email e senha nativos. Ative MFA em Segurança quando desejar.');
  } else throw Error();
}

if (!['invite', 'promote'].includes(process.argv[2])) {
  console.error('Uso: node scripts/first-admin.mjs invite EMAIL|promote');
  process.exitCode = 1;
} else {
  onLocalDatabase(firstAdmin).catch((error) => {
    console.error(`Primeiro administrador não concluído. ${error.message || 'Confira destino, conta e email.'}`);
    process.exitCode = 1;
  });
}
