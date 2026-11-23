import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertProject, command, privateWrite, project, root } from './local.mjs';

try {
  assertProject(); process.loadEnvFile(resolve(root, '.local/service.env'));
  if (process.env.SUPABASE_URL !== 'http://127.0.0.1:58521' || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error();
  const file = resolve(root, '.local/first-admin.json');
  if (process.argv[2] === 'invite') {
    const email = process.argv[3];
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error();
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const created = await admin.auth.admin.createUser({ email, email_confirm: false, app_metadata: { icarus_server_created: true, icarus_password_setup_required: true } });
    if (created.error || !created.data.user) throw Error();
    privateWrite(file, JSON.stringify({ id: created.data.user.id, email, created_at: new Date().toISOString() }));
    const invite = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: 'http://127.0.0.1:8088/auth/callback' });
    if (invite.error) throw Error();
    console.log('Convite nativo solicitado; confirme recebimento, primeira senha e MFA antes de promover.');
  } else if (process.argv[2] === 'promote') {
    const { id } = JSON.parse(readFileSync(file, 'utf8'));
    if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id)) throw Error();
    const sql = `do $$ begin if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id='${id}'::uuid and not p.demo and not p.suspended and not p.password_setup_required and u.email_confirmed_at is not null and u.raw_app_meta_data->>'icarus_server_created'='true' and exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')) then raise exception 'Confirmação de email, primeira senha e MFA são obrigatórios.'; end if; update public.profiles set role='admin' where id='${id}'::uuid; end $$;`;
    command('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { input: sql });
    console.log('Primeiro administrador específico promovido após email, senha e MFA nativos.');
  } else throw Error();
} catch { console.error('Primeiro administrador não concluído. Use invite EMAIL ou promote; nenhum segredo foi exibido e estado existente foi preservado.'); process.exitCode = 1; }
