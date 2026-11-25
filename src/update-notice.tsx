import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { version as current } from "../package.json";
import { Notice } from "./ui";

type Release = { tag: string; url: string };
const official = "tiberiolemes/icarus-area-de-membros";
const day = 86_400_000;
const semver = (value: string) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);

/** Só x.y.z conta como versão; pré-lançamentos e tags fora do formato nunca disparam o aviso. */
export function newer(tag: string, than: string) {
  const [a, b] = [semver(tag), semver(than)];
  const diff = a && b ? a.findIndex((part, i) => part !== b[i]) : -1;
  return diff >= 0 && a![diff] > b![diff];
}

// Armazenamento bloqueado (janela privada, política do navegador) só desliga o cache e a dispensa.
function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* segue sem guardar */ }
}

const valid = (release: Partial<Release> | null): release is Release =>
  typeof release?.tag === "string" && typeof release.url === "string" && release.url.startsWith("https://github.com/");

async function latest(repo: string): Promise<Release | null> {
  const key = `icarus:release:${repo}`;
  let cached: (Partial<Release> & { at?: number }) | null = null;
  try { cached = JSON.parse(read(key) ?? "null"); } catch { /* cache corrompido: consulta de novo */ }
  const age = Date.now() - Number(cached?.at);
  if (age >= 0 && age < day) {
    if (valid(cached)) return { tag: cached.tag, url: cached.url };
    // Falha guardada: no limite do GitHub, o painel não repete a consulta a cada recarga.
    if (cached?.tag === undefined) return null;
  }
  let data;
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: "application/vnd.github+json" } });
    data = response.ok ? await response.json() : null;
  } catch {
    // Sem rede, CSP ou recarga no meio da consulta: nada chegou ao GitHub, então tenta de novo na próxima abertura.
    return null;
  }
  const release = { tag: data?.tag_name, url: data?.html_url };
  if (!valid(release)) {
    // Erro do GitHub (como o limite de requisições) ou resposta inesperada: guarda a falha por 24 horas.
    write(key, JSON.stringify({ at: Date.now() }));
    return null;
  }
  write(key, JSON.stringify({ ...release, at: Date.now() }));
  return release;
}

/** Aviso de versão nova para admins: o navegador consulta as Releases públicas do GitHub, no máximo uma vez por dia. */
export function UpdateNotice() {
  const repo = (import.meta.env.VITE_ICARUS_UPDATE_REPO as string | undefined) ?? official;
  const enabled = /^[\w.-]+\/[\w.-]+$/.test(repo) && import.meta.env.MODE !== "demo";
  const { data: release } = useQuery({ queryKey: ["latest-release", repo], queryFn: () => latest(repo), enabled, retry: false, staleTime: Infinity });
  const dismissKey = `icarus:release-dismissed:${repo}`;
  const [dismissed, setDismissed] = useState(() => read(dismissKey));
  if (!enabled || !release || !newer(release.tag, current) || dismissed === release.tag) return null;
  return (
    <Notice>
      <p><strong>Versão {release.tag.replace(/^v/, "")} disponível.</strong> Esta instalação usa a {current}. Faça backup e siga o roteiro antes de atualizar.</p>
      <p className="update-notice-actions">
        <a className="button primary" href={release.url} target="_blank" rel="noreferrer">Notas da versão</a>
        <a className="button" href={`https://github.com/${repo}/blob/${release.tag}/docs/operations.md#atualizar-de-versão`} target="_blank" rel="noreferrer">Como atualizar</a>
        <button type="button" onClick={() => {
          write(dismissKey, release.tag);
          setDismissed(release.tag);
          // O botão some com o aviso: devolve o foco ao conteúdo em vez de deixá-lo cair no body.
          document.getElementById("main")?.focus();
        }}>Dispensar esta versão</button>
      </p>
    </Notice>
  );
}
