import { resolve } from 'node:path';
import { assertProject, root } from './local.mjs';
try {
  assertProject(); process.loadEnvFile(resolve(root, '.local/service.env'));
  if (process.env.SUPABASE_URL !== 'http://127.0.0.1:58521' || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error();
  const result = await fetch(`${process.env.SUPABASE_URL}/functions/v1/process-invites`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(50_000) });
  if (!result.ok) { await result.body?.cancel(); throw Error(); }
  const data = await result.json();
  console.log(JSON.stringify({ processed: data.attempted }));
} catch { console.error('Processamento de convites não concluído; fila durável preservada.'); process.exitCode = 1; }
