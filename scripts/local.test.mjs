import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBindings } from './local-bindings.mjs';

test('a stopped registered container must still have safe requested bindings for restart', () => {
  const name = 'bridge-local', id = '1'.repeat(64), project = 'icarus-courses-local';
  const expected = { '5432/tcp': '58522' };
  const port = { HostIp: '', HostPort: '58522' };
  const container = {
    State: { Running: false },
    Config: { Labels: { 'com.supabase.cli.project': project } },
    HostConfig: { PublishAllPorts: false, NetworkMode: name, PortBindings: { '5432/tcp': [port] } },
    NetworkSettings: { Networks: { [name]: { NetworkID: id } }, Ports: null },
  };
  assert.doesNotThrow(() => assertBindings(container, project, { name, id }, expected, { running: false }));
  port.HostIp = '0.0.0.0';
  assert.throws(() => assertBindings(container, project, { name, id }, expected, { running: false }), /bindings loopback/);
});
