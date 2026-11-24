import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const dockerId = /^[a-f0-9]{64}$/;
export const projectLabel = 'com.supabase.cli.project';
const bridgeOption = 'com.docker.network.bridge.host_binding_ipv4';
const gatewayOption = 'com.docker.network.bridge.gateway_mode_ipv4';
const cliVersion = '2.109.1';

export function isEntrypoint(url) {
  return Boolean(process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)));
}

export async function onInstallerDocker(command, run) {
  const { ICARUS_INSTALL_DOCKER_HOST: host, ICARUS_INSTALL_DOCKER_ID: id } = process.env;
  const socket = host?.slice('unix://'.length);
  if (!id || !host?.startsWith('unix:///') || resolve(socket) !== socket || !socket.endsWith('/icarus-install.sock')) {
    throw Error('Declare o socket Unix dedicado ICARUS_INSTALL_DOCKER_HOST e o ID ICARUS_INSTALL_DOCKER_ID. Consulte docs/operations.md.');
  }
  const directory = dirname(socket);
  const parent = lstatSync(directory);
  const original = lstatSync(socket);
  if (!parent.isDirectory() || parent.uid !== process.getuid() || (parent.mode & 0o077) !== 0 ||
      realpathSync(directory) !== directory || !original.isSocket() || original.uid !== parent.uid) {
    throw Error('O socket dedicado precisa estar em diretório privado, próprio e sem aliases.');
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(DOCKER_|SUPABASE_|PG)/.test(key)));
  Object.assign(env, { DOCKER_HOST: host, SUPABASE_SERVICES_HOSTNAME: '127.0.0.1', SUPABASE_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' });
  const assertSocket = () => {
    const current = lstatSync(socket);
    if (!current.isSocket() || current.dev !== original.dev || current.ino !== original.ino) throw Error('O socket Docker mudou durante a operação.');
  };
  const docker = (args, options = {}) => { assertSocket(); return command('docker', args, { logFailure: false, ...options, env }); };
  const assertDaemon = () => {
    const [actual, version, os] = docker(['info', '--format', '{{.ID}} {{.ServerVersion}} {{.OSType}}']).trim().split(' ');
    if (actual !== id) throw Error('ID do daemon Docker difere do declarado.');
    const stable = /^29\.(\d+)\.\d+$/.exec(version);
    if (os !== 'linux' || !stable || Number(stable[1]) < 10) throw Error('O instalador exige Docker Engine Linux estável da série 29.x a partir da 29.10.0.');
  };
  const native = (args, workdir) => {
    assertDaemon();
    return command('supabase', [...args, '--workdir', workdir], { cwd: workdir, env });
  };
  const assertCli = () => {
    if (command('supabase', ['--version'], { env, logFailure: false }).trim() !== cliVersion) throw Error(`Use Supabase CLI ${cliVersion} no instalador.`);
  };
  const lock = `${socket}.lock`;
  const owner = resolve(lock, 'owner.json');
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let pid;
    try { if (lstatSync(lock).isDirectory() && lstatSync(owner).isFile()) pid = JSON.parse(readFileSync(owner, 'utf8')).pid; } catch {}
    throw Error(`Lock do instalador ocupado: ${lock} (PID ${Number.isSafeInteger(pid) && pid > 0 ? pid : 'desconhecido'}). Consulte “Recuperar um lock interrompido” em docs/operations.md.`);
  }
  try {
    writeFileSync(owner, JSON.stringify({ pid: process.pid, argv: process.argv.slice(1, 3), cwd: process.cwd(), started_at: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
    assertDaemon();
    return await run({ id, env, docker, native, assertCli, assertDaemon, assertSocket });
  } finally {
    if (existsSync(owner)) unlinkSync(owner);
    rmdirSync(lock);
  }
}

export function assertNewDockerInventory(docker, newNetwork = '') {
  const containers = docker(['container', 'ls', '--all', '--quiet']).trim();
  const volumes = docker(['volume', 'ls', '--quiet']).trim();
  const networks = docker(['network', 'ls', '--filter', 'type=custom', '--no-trunc', '--quiet']).trim();
  if (containers || volumes || networks !== newNetwork) {
    throw Error('A instalação nova exige daemon dedicado sem containers, volumes ou redes próprias.');
  }
}

export async function preflightNewDocker(docker, ports) {
  assertNewDockerInventory(docker);
  // Probe the VM's IPv4 wildcard to catch services outside Docker too.
  for (const port of ports) {
    const probe = createServer();
    await new Promise((accept, reject) => {
      probe.once('error', () => reject(Error(`A porta TCP ${port} não está livre.`)));
      probe.listen({ port, host: '0.0.0.0', exclusive: true }, () => probe.close((error) => error ? reject(error) : accept()));
    });
  }
}

export function inspectNetwork(docker, name) {
  const [network] = JSON.parse(docker(['network', 'inspect', name]));
  if (!dockerId.test(network?.Id) || network.Name !== name || network.Driver !== 'bridge' || network.EnableIPv6 !== false ||
      network.Options?.[bridgeOption] !== '127.0.0.1' || (network.Options[gatewayOption] ?? 'nat') !== 'nat' ||
      network.Options['com.docker.network.bridge.trusted_host_interfaces'] || network.Labels?.['icarus.installer'] !== name) {
    throw Error('Rede de instalação sem identidade ou configuração de loopback esperada.');
  }
  return network.Id;
}

export function createInstallerNetwork(docker, name) {
  const id = docker(['network', 'create', '--driver', 'bridge', '--label', `icarus.installer=${name}`,
    '--opt', `${bridgeOption}=127.0.0.1`, '--opt', `${gatewayOption}=nat`, name]).trim();
  if (inspectNetwork(docker, name) !== id) throw Error('A rede criada mudou de identidade.');
  return id;
}

export function inspectContainers(docker, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !dockerId.test(id)) || new Set(ids).size !== ids.length) throw Error('IDs completos de containers esperados.');
  const containers = JSON.parse(docker(['container', 'inspect', ...ids]));
  if (containers.length !== ids.length || containers.some((container, i) => container.Id !== ids[i])) throw Error('Identidade dos containers divergiu.');
  return containers;
}

// Discover IDs only after a fresh start on the exclusive, previously empty daemon.
export function installedContainers(docker) {
  return docker(['container', 'ls', '--all', '--no-trunc', '--quiet']).trim().split('\n').filter(Boolean);
}
