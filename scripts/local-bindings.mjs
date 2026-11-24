import { isEntrypoint, projectLabel } from './installer-docker.mjs';

export function assertBindings(container, project, network, expected, { running = true } = {}) {
  const { HostConfig: host, NetworkSettings: live } = container;
  const endpoint = Object.values(live?.Networks || {});
  const bindings = Object.entries(host?.PortBindings || {}).filter(([, entries]) => entries?.length);
  const published = Object.entries(live?.Ports || {}).filter(([, entries]) => entries?.length);
  const matches = (entries, ips) => entries.length === Object.keys(expected).length && entries.every(([port, mapped]) =>
    mapped.length === 1 && mapped[0].HostPort === expected[port] && ips.includes(mapped[0].HostIp));
  if (container.Config?.Labels?.[projectLabel] !== project || host?.PublishAllPorts !== false ||
      ![network.name, network.id].includes(host.NetworkMode) ||
      endpoint.length !== 1 || live.Networks[network.name]?.NetworkID !== network.id ||
      !matches(bindings, ['', '127.0.0.1']) ||
      (running && !container.State?.Running) ||
      (container.State?.Running && !matches(published, ['127.0.0.1']))) {
    throw Error('Container fora da identidade, do estado ou dos bindings loopback esperados.');
  }
}

if (isEntrypoint(import.meta.url)) {
  console.error('Reparo e rollback de bindings desativados. Consulte o procedimento de instalação isolada em docs/operations.md.');
  process.exitCode = 1;
}
