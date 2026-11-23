import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertProject, command, privateWrite, project, root } from './local.mjs';
const assert = (value, message) => { if (!value) throw Error(message); };
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, value = 0; const bytes = [];
  for (const character of secret.toUpperCase().replace(/=+$/, '')) { const index = alphabet.indexOf(character); assert(index >= 0, 'Fator inválido.'); value = (value << 5) | index; bits += 5; if (bits >= 8) { bits -= 8; bytes.push((value >> bits) & 255); value &= (1 << bits) - 1; } }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(), offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
try {
  assertProject(); process.loadEnvFile(resolve(root, '.local/service.env'));
  assert(process.env.SUPABASE_URL === 'http://127.0.0.1:58521', 'Destino inválido.');
  const inspected = JSON.parse(command('docker', ['inspect', `supabase_storage_${project}`]))[0];
  assert(inspected.Config.Env.includes('FILE_SIZE_LIMIT=524288000'), 'Runtime Storage ainda não tem 500MiB; não iniciei Auth/upload.');
  const options = { auth: { persistSession: false, autoRefreshToken: false } }, admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options), client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options);
  const bucket = await admin.storage.getBucket('icarus-private'); assert(!bucket.error && bucket.data.file_size_limit === 524288000, 'Bucket não tem limite500MiB.');
  const account = JSON.parse(readFileSync(resolve(root, '.local/demo-accounts.json'), 'utf8')).admin, factor = JSON.parse(readFileSync(resolve(root, '.local/qa-admin-totp.json'), 'utf8'));
  assert(factor.actor_id === account.id, 'Fator não corresponde ao admin QA.');
  const login = await client.auth.signInWithPassword(account); assert(!login.error, 'Admin QA não autenticou.');
  let materialId, uploadId, path, receipt; const fixture = resolve(root, '.local/large-upload-qa.txt');
  try {
    const factors = await client.auth.mfa.listFactors(); assert(!factors.error, 'Fatores nativos indisponíveis.');
    const nativeFactor = factors.data.totp.find((f) => f.status === 'verified'); assert(nativeFactor, 'MFA nativo não verificado.');
    const mfa = await client.auth.mfa.challengeAndVerify({ factorId: nativeFactor.id, code: totp(factor.secret) }); assert(!mfa.error, 'MFA QA não confirmou.');
    const session = await client.auth.getSession(); assert(session.data.session, 'Sessão AAL2 ausente.');
    const name = `DEMONSTRAÇÃO upload grande ${randomUUID()}`;
    const material = await client.rpc('app_admin_save', { p_entity: 'materials', p_id: null, p_data: { name, description: 'Fixture QA sintética privada; cleanup após aceite.', file_type: 'text/plain', status: 'draft', access_mode: 'members' } }); assert(!material.error, 'Material QA não criado.'); materialId = material.data.id;
    const bytes = 56 * 1024 * 1024, data = Buffer.alloc(bytes, 65); data.write('DEMONSTRACAO QA arquivo sintetico privado.\n'); privateWrite(fixture, data);
    const call = async (name, body) => { const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/${name}`, { method: 'POST', headers: { authorization: `Bearer ${session.data.session.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }); const value = await response.json(); assert(response.status === 200, `HTTP ${name} falhou (${response.status}; código ${value.error?.code || 'indisponível'}).`); return value; };
    const reserve = await call('upload', { action: 'reserve', kind: 'material', resource_id: materialId, file_name: 'demonstracao-grande.txt', content_type: 'text/plain', size_bytes: bytes }); uploadId = reserve.upload_id; path = reserve.path;
    const sent = await client.storage.from('icarus-private').upload(path, data, { upsert: false, contentType: 'text/plain' }); assert(!sent.error, 'Storage nativo não aceitou arquivo >50MiB.');
    const finalized = await call('upload', { action: 'finalize', upload_id: uploadId }); assert(finalized.state === 'ready', 'Finalize não conferiu bytes/metadados.');
    const media = await call('media', { kind: 'material', id: materialId }); const ranged = await fetch(media.url, { headers: { Range: 'bytes=0-31' } }); assert(ranged.status === 206 && (await ranged.arrayBuffer()).byteLength === 32, 'URL pública não retornou Range real.');
    const stored = await admin.from('uploads').select('size_bytes,state,content_type').eq('id', uploadId).single(); assert(!stored.error && stored.data.size_bytes === bytes && stored.data.state === 'ready', 'Metadados persistidos divergiram.');
    receipt = { passed: true, actual_upload_bytes: bytes, above_50MiB: true, runtime_limit_bytes: 524288000, bucket_limit_bytes: bucket.data.file_size_limit, native_mfa_aal2: true, storage_upload: true, finalize_ready: true, public_url_range_http: 206, checked_at: new Date().toISOString() };
  } finally {
    if (path) assert(!(await admin.storage.from('icarus-private').remove([path])).error, 'Cleanup do objeto QA falhou.');
    if (uploadId) assert(!(await admin.from('uploads').delete().eq('id', uploadId).eq('actor_id', account.id)).error, 'Cleanup da reserva QA falhou.');
    if (materialId) assert(!(await admin.from('materials').delete().eq('id', materialId).eq('status', 'draft')).error, 'Cleanup do material QA falhou.');
    try { unlinkSync(fixture); } catch {}
    await client.auth.signOut({ scope: 'local' });
  }
  receipt.cleanup_completed = true;
  privateWrite(resolve(root, '.local/large-upload-evidence.json'), JSON.stringify(receipt, null, 2)); console.log(JSON.stringify(receipt));
} catch (error) { console.error(`Upload QA não concluído: ${error.message}`); process.exitCode = 1; }
