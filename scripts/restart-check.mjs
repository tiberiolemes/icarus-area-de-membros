import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertProject, command, privateWrite, root, project } from './local.mjs';
import { fingerprint } from './backup.mjs';
const evidence = { passed: false, actions: [], checked_at: new Date().toISOString() };
const save = () => privateWrite(resolve(root, '.local/restart-evidence.json'), JSON.stringify(evidence, null, 2));
try {
  assertProject();
  const localScript = fileURLToPath(new URL('./local.mjs', import.meta.url));
  const before = fingerprint('postgres'); privateWrite(resolve(root, '.local/restart-before.json'), JSON.stringify(before));
  for (const action of ['stop', 'stop', 'start', 'start']) {
    const stage = { action, completed: false }; evidence.actions.push(stage); save();
    command(process.execPath, [localScript, action], { timeout: 180_000 });
    stage.completed = true; save();
  }
  const after = fingerprint('postgres'), changed = Object.keys({ ...before, ...after }).filter((name) => before[name] !== after[name]);
  const storage = JSON.parse(command('docker', ['inspect', `supabase_storage_${project}`]))[0];
  const receipt = { passed: changed.length === 0, stop_twice: true, start_twice: true, unchanged_tables: Object.keys(before).length - changed.length, changed_tables: changed, runtime_storage_500MiB: storage.Config.Env.includes('FILE_SIZE_LIMIT=524288000'), checked_at: new Date().toISOString() };
  Object.assign(evidence, receipt); save();
  if (!receipt.passed || !receipt.runtime_storage_500MiB) throw Error('Persistência ou limite efetivo divergiram.');
  console.log(JSON.stringify(receipt));
} catch (error) { save(); console.error(`Janela de restart não concluída: ${error.message} Volumes preservados; consultar recibo privado.`); process.exitCode = 1; }
