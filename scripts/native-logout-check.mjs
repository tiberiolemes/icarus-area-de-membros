import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { assertProject, privateWrite, root } from './local.mjs';

const assert = (condition, message) => { if (!condition) throw Error(message); };
try {
  assertProject(); process.loadEnvFile(resolve(root, '.local/service.env'));
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  assert(url === 'http://127.0.0.1:58521', 'Destino Native inválido.');
  const options = { auth: { persistSession: false, autoRefreshToken: false } }, admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
  const file = resolve(root, '.local/logout-qa-accounts.json');
  const accounts = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  while (accounts.length < 2) {
    const email = `logout-${randomUUID()}@example.test`, password = `Ic!9${randomUUID()}`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { icarus_server_created: true }, user_metadata: { full_name: 'DEMONSTRAÇÃO logout Native' } });
    assert(!created.error, 'Conta sintética Native não criada.'); accounts.push({ id: created.data.user.id, email, password }); privateWrite(file, JSON.stringify(accounts));
  }
  const other = createClient(url, anon, options); const otherLogin = await other.auth.signInWithPassword(accounts[1]); assert(!otherLogin.error, 'Controle Native não autenticou.');
  assert(!(await other.rpc('app_touch_session', { p_activity: false })).error, 'Controle sem sessão DB válida.');
  const cases = [];
  try {
    for (const consumed of [false, true]) {
      let logoutHttp = null;
      const client = createClient(url, anon, { ...options, global: { fetch: async (input, init) => { const response = await fetch(input, init); if (String(input).includes('/auth/v1/logout')) logoutHttp = response.status; return response; } } });
      const login = await client.auth.signInWithPassword(accounts[0]); assert(!login.error, 'Ator Native não autenticou.');
      const claims = await client.auth.getClaims(login.data.session.access_token); const sid = claims.data.claims.session_id;
      const response = await fetch(`${url}/functions/v1/reauthenticate`, { method: 'POST', headers: { authorization: `Bearer ${login.data.session.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ password: accounts[0].password }) });
      assert(response.status === 200, 'Reauth Native não criou nonce.'); await response.body.cancel();
      const nonce = await admin.from('reauth_nonces').select('actor_id', { count: 'exact', head: true }).eq('session_id', sid).eq('actor_id', accounts[0].id); assert(nonce.count === 1, 'Nonce próprio não encontrado.');
      if (consumed) assert(!(await admin.from('reauth_nonces').update({ consumed_at: new Date().toISOString() }).eq('session_id', sid).eq('actor_id', accounts[0].id)).error, 'Fixture consumed não aplicada.');
      const auditId = randomUUID(); assert(!(await admin.from('audit_events').insert({ id: auditId, actor_id: accounts[0].id, action: 'qa-native-logout', target_type: 'profiles', target_id: accounts[0].id, reason: 'DEMONSTRAÇÃO: auditoria preservada após logout.' })).error, 'Auditoria fixture não criada.');
      const loggedOut = await client.auth.signOut(); assert(!loggedOut.error && logoutHttp >= 200 && logoutHttp < 300, 'Logout GLOBAL Native falhou.');
      const remaining = await admin.from('reauth_nonces').select('actor_id', { count: 'exact', head: true }).eq('session_id', sid);
      const audit = await admin.from('audit_events').select('id', { count: 'exact', head: true }).eq('id', auditId);
      const control = await other.rpc('app_touch_session', { p_activity: false });
      assert(remaining.count === 0 && audit.count === 1 && !control.error, 'Nonce/audit/terceiro divergiram.');
      cases.push({ nonce_state: consumed ? 'consumed' : 'pending', global_logout_http: logoutHttp, nonce_removed: true, audit_preserved: true, other_session_intact: true });
    }
  } finally { await other.auth.signOut({ scope: 'local' }); }
  const receipt = { passed: true, cases, checked_at: new Date().toISOString() }; privateWrite(resolve(root, '.local/native-logout-evidence.json'), JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt));
} catch (error) { console.error(`Native logout não concluído: ${error.message}`); process.exitCode = 1; }
