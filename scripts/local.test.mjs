import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

test('stop preserves its PID when the owned process ignores SIGTERM', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'icarus-stop-'));
  const previous = process.env.ICARUS_LOCAL_WORKDIR;
  process.env.ICARUS_LOCAL_WORKDIR = fixture;
  const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});process.on("SIGUSR2",()=>process.exit(0));process.send("ready");setInterval(()=>{},1000)', 'functions serve', fixture], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    await once(child, 'message');
    const { privateWrite, stopFunctions } = await import('./local.mjs');
    const record = JSON.stringify({ pid: child.pid, workdir: fixture });
    const path = join(fixture, '.local/edge-runtime-process.json');
    privateWrite(path, record);
    await assert.rejects(stopFunctions(), /PID preservado/);
    assert.equal(readFileSync(path, 'utf8'), record);
    assert.doesNotThrow(() => process.kill(child.pid, 0));
  } finally {
    child.kill('SIGUSR2'); await once(child, 'exit');
    rmSync(fixture, { recursive: true });
    if (previous === undefined) delete process.env.ICARUS_LOCAL_WORKDIR;
    else process.env.ICARUS_LOCAL_WORKDIR = previous;
  }
});
