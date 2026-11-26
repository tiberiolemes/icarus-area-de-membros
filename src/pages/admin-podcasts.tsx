import { AdminSurface } from "./admin-surface";
import { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppError, rpc, useRpc } from "../api";
import type { Page } from "../api";
import { Back, Empty, Field, Form, Modal, Notice, Pager, QueryState, Search, value } from "../ui";
import {
  chapterTime, episodeDay, episodeKind, refreshPodcasts, spotifyEpisodePattern, youtubeIdPattern,
} from "./podcasts";
import type { Chapter, Episode, EpisodeDetail } from "./podcasts";

const route = "/admin/podcasts";
const editorDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const statusLabel = { draft: "Rascunho", published: "Publicado", archived: "Arquivado" };
type AdminEpisode = Omit<Episode, "status"> & { status: keyof typeof statusLabel };
type AdminEpisodeDetail = Omit<EpisodeDetail, "status"> & AdminEpisode;

function externalUrl(input: string) {
  if (!input.startsWith("https://") || /[\\\s]/.test(input)) return null;
  try {
    const url = new URL(input);
    return url.username || url.password || url.port ? null : url;
  } catch {
    return null;
  }
}

export function parseYouTube(input: string) {
  const url = externalUrl(input);
  if (!url) return null;
  let id: string | null = null;
  if (url.hostname === "youtu.be") {
    id = url.pathname.slice(1);
  } else if (["www.youtube.com", "youtube.com", "m.youtube.com"].includes(url.hostname)) {
    if (url.pathname === "/watch" && url.searchParams.getAll("v").length === 1) {
      id = url.searchParams.get("v");
    } else {
      id = /^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})$/.exec(url.pathname)?.[1] ?? null;
    }
  }
  return id && youtubeIdPattern.test(id) ? id : null;
}

export function parseSpotify(input: string) {
  const url = externalUrl(input);
  const canonical = url ? url.origin + url.pathname : "";
  return spotifyEpisodePattern.test(canonical) ? canonical : null;
}

export function parseChapters(input: string): Chapter[] {
  const lines = input.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 40) throw new AppError("Informe até 40 capítulos.");
  let previous = -1;
  return lines.map((line, index) => {
    const match = /^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)\s+(.{1,160})$/.exec(line);
    const seconds = match ? Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) : -1;
    if (!match || seconds <= previous || seconds > 86399)
      throw new AppError(`Confira o capítulo ${index + 1}. Use MM:SS ou HH:MM:SS, seguido do título, em ordem crescente.`);
    previous = seconds;
    return { seconds, title: match[4] };
  });
}

function EpisodeEditor({ episode }: { episode?: AdminEpisodeDetail }) {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [status, setStatus] = useState(episode?.status ?? "draft");
  const [featured, setFeatured] = useState(episode?.is_featured ?? false);
  const [confirming, setConfirming] = useState(false);
  const archived = episode?.status === "archived";
  const savedId = useRef<string>(undefined);
  return (
    <AdminSurface className="podcast-surface" section="podcast-editor" formAction
      trail={["Administração", { label: "Podcasts", to: route }, episode ? "Editar episódio" : "Novo episódio"]}
      title={episode ? "Editar episódio" : "Novo episódio"}
      description={episode?.title ?? "Preencha os dados do episódio e defina sua publicação."}
      action={episode && <Modal open={confirming} onOpenChange={setConfirming}
        title={archived ? "Restaurar episódio" : "Arquivar episódio"}
        description={archived ? "O episódio voltará como rascunho." : "O episódio sairá do catálogo. O histórico será preservado."}
        trigger={<button>{archived ? "Restaurar" : "Arquivar"}</button>}>
        <Form label={archived ? "Restaurar episódio" : "Arquivar episódio"} onDone={() => {
          setConfirming(false);
          if (archived) setStatus("draft");
          setFeatured(false);
        }} onSave={async () => {
          await rpc("app_admin_archive_podcast", { p_id: episode.id, p_archived: !archived });
          await refreshPodcasts();
        }}>
          <p>{episode.title}</p>
        </Form>
      </Modal>}>
      <section className="settings-panel" data-tour="podcast-editor">
      {state?.created && <Notice>Episódio cadastrado.</Notice>}
      <Form
        label="Salvar episódio"
        submitInHeading
        disabled={archived}
        className="podcast-editor"
        onSave={async (data) => {
          const youtube = parseYouTube(value(data, "youtube_url"));
          if (!youtube) throw new AppError("Informe uma URL válida de vídeo do YouTube.");
          const spotifyInput = value(data, "spotify_url");
          const spotify = parseSpotify(spotifyInput);
          if (spotifyInput && !spotify) throw new AppError("Informe o link de um episódio em open.spotify.com.");
          const result = await rpc<{ id: string }>("app_admin_save_podcast", {
            p_id: episode?.id ?? null,
            p_youtube_id: youtube,
            p_kind: value(data, "kind"),
            p_title: value(data, "title"),
            p_description: value(data, "description"),
            p_published_at: `${value(data, "published_at")}T00:00:00-03:00`,
            p_status: status,
            p_is_featured: status === "published" && data.has("is_featured"),
            p_chapters: parseChapters(value(data, "chapters")),
            p_spotify_url: spotify,
          });
          if (status === "draft") setFeatured(false);
          if (!episode) savedId.current = result.id;
          await refreshPodcasts();
        }}
        onDone={() => {
          if (savedId.current) navigate(`${route}/${savedId.current}`, { replace: true, state: { created: true } });
        }}
      >
        <Field label="URL do vídeo no YouTube" hint="A miniatura vem do vídeo informado. Revise os capítulos se trocar o vídeo.">
          <input name="youtube_url" type="url" required maxLength={500}
            defaultValue={episode ? `https://www.youtube.com/watch?v=${episode.youtube_id}` : ""} />
        </Field>
        <Field label="Tipo">
          <select name="kind" defaultValue={episode?.kind ?? "podcast"}>
            <option value="podcast">Podcast</option><option value="masterclass">Masterclass</option>
          </select>
        </Field>
        <Field label="Título">
          <input name="title" required maxLength={160} defaultValue={episode?.title} />
        </Field>
        <Field label="Descrição">
          <textarea name="description" maxLength={5000} rows={4} defaultValue={episode?.description} />
        </Field>
        <Field label="Data do episódio">
          <input name="published_at" type="date" required min="1900-01-01" max="2100-12-31"
            defaultValue={episode ? editorDate.format(new Date(episode.published_at)) : undefined} />
        </Field>
        <Field label="Capítulos" hint="Um capítulo por linha. Exemplo: 09:00 Nome do capítulo.">
          <textarea name="chapters" rows={4} maxLength={6800}
            defaultValue={episode?.chapters.map(({ seconds, title }) => `${chapterTime(seconds)} ${title}`).join("\n")} />
        </Field>
        <Field label="Link do episódio no Spotify (opcional)">
          <input name="spotify_url" type="url" maxLength={500} defaultValue={episode?.spotify_url ?? ""} />
        </Field>
        <Field label="Estado" hint="Rascunhos ficam fora do catálogo do aluno.">
          <select name="status" value={archived ? "archived" : status} onChange={(event) => setStatus(event.target.value as Episode["status"])}>
            <option value="draft">Rascunho</option><option value="published">Publicado</option>
            {archived && <option value="archived">Arquivado</option>}
          </select>
        </Field>
        {status === "published" && (
          <label className="podcast-featured-option">
            <input name="is_featured" type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} />
            Exibir em destaque, substituindo o destaque atual
          </label>
        )}
      </Form>
      </section>
    </AdminSurface>
  );
}

function EditPodcast({ id }: { id: string }) {
  const query = useRpc<AdminEpisodeDetail>("app_podcast", { p_id: id, p_admin: true });
  return query.data ? <EpisodeEditor episode={query.data} /> : <AdminSurface section="podcast-editor"
    trail={["Administração", { label: "Podcasts", to: route }, "Editar episódio"]}
    title="Editar episódio" description="Confira os dados do episódio.">
    <QueryState query={query}>{null}</QueryState>
  </AdminSurface>;
}

function AdminPodcastList() {
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState("");
  const query = useRpc<Page<AdminEpisode>>("app_podcasts", { p_page: page, p_query: term, p_admin: true });
  const data = query.data;
  return (
    <AdminSurface className="podcast-surface" section="podcasts" trail={["Administração", "Podcasts"]}
      title="Podcasts e masterclasses" description="Gerencie os episódios e escolha o destaque do catálogo."
      action={<Link className="button primary" to={`${route}/novo`}>Novo episódio</Link>}>
      <section className="settings-panel" data-tour="admin-podcasts">
        <Search label="Buscar episódios" variant="stitch" initial={term} onSearch={(value) => { setTerm(value); setPage(1); }} />
      <QueryState query={query}>
        {data && (data.items.length > 0 ? (
          <ul className="podcast-admin-list">
            {data.items.map((episode) => (
              <li key={episode.id}>
                <div>
                  <strong>{episode.title}</strong>
                  <span className="podcast-meta">
                    {episodeKind[episode.kind]} · {episodeDay.format(new Date(episode.published_at))} · {statusLabel[episode.status]}
                    {episode.is_featured && " · Em destaque"}
                  </span>
                </div>
                <Link className="button" to={`${route}/${episode.id}`} aria-label={`Editar ${episode.title}`}>Editar</Link>
              </li>
            ))}
          </ul>
        ) : <Empty>Nenhum episódio cadastrado nesta página.</Empty>)}
        {data && (data.total > 20 || page > 1) && <Pager page={page} total={data.total} onChange={setPage} />}
      </QueryState>
      </section>
    </AdminSurface>
  );
}

export function AdminPodcasts() {
  const { episodio } = useParams<{ episodio: string }>();
  if (episodio === "novo") return <EpisodeEditor key={episodio} />;
  if (episodio) {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(episodio))
      return <><Back to={route} /><Empty>Episódio indisponível.</Empty></>;
    return <EditPodcast key={episodio} id={episodio} />;
  }
  return <AdminPodcastList />;
}
