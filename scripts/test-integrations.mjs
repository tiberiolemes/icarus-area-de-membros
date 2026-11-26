import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './local.mjs';
const envNames = ['SUPABASE_URL', 'SUPABASE_PUBLIC_URL', 'ICARUS_PUBLIC_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_ORIGIN', 'ICARUS_MODE', 'ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN', 'ASAAS_ENV', 'ASAAS_ITEM_IMAGE_BASE64', 'TURNSTILE_SECRET_KEY', 'BUNNY_LIBRARY_ID', 'BUNNY_TOKEN_KEY', 'BUNNY_ALLOWED_DOMAIN', 'BUNNY_CDN_HOST', 'BUNNY_STREAM_API_KEY', 'EMAIL_CONFIGURED', 'DEMO_ACCOUNTS_PATH', 'DEMO_RESOURCES_PATH', 'ICARUS_LOCAL_WORKDIR'];
const local = process.argv.includes('--local');
const outbox = process.argv.includes('--outbox-http');
const args = ['test', '--node-modules-dir=manual', `--allow-env=${envNames.join(',')}`];
if (local || outbox) {
  const env = resolve(root, '.local/service.env');
  if (!existsSync(env)) { console.error('Ambiente local privado ausente; execute status e bootstrap --demo.'); process.exit(1); }
  args.push(`--env-file=${env}`, outbox ? '--allow-net=127.0.0.1' : '--allow-net=127.0.0.1:58521,127.0.0.1:58524');
  if (outbox) args.push(`--env-file=${resolve(root, '.local/edge.env')}`, '--allow-run=docker', '--allow-read=supabase/tests/fixtures', `--allow-write=${resolve(root, '.local')}`, 'tests/integration/outbox_http_test.ts');
  else args.push(`--allow-read=${resolve(root, '.local')}`, 'tests/integration/local_test.ts');
} else args.push('tests/integration/edge_test.ts', 'tests/integration/feedback_edge_test.ts');
const result = spawnSync('deno', args, { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit', env: { ...process.env, ICARUS_LOCAL_WORKDIR: root, DEMO_ACCOUNTS_PATH: resolve(root, '.local/demo-accounts.json'), DEMO_RESOURCES_PATH: resolve(root, '.local/demo-resources.json') } });
if (result.error) console.error('Deno2/SDK indisponível; testes não executados.');
process.exitCode = result.status ?? 1;
