import { useState } from "react";
import type { ReactElement } from "react";
import { ArrowUpRight, Check, Play, Search, Video } from "lucide-react";
import { cache, rpc, useRpc } from "../api";
import type { Page } from "../api";
import { Action, Empty, Heading, Modal, Pager, QueryState, value } from "../ui";
import "./podcasts.css";

export type Chapter = { seconds: number; title: string };
export type Episode = {
  id: string;
  youtube_id: string;
  kind: "podcast" | "masterclass";
  title: string;
  published_at: string;
  status: "draft" | "published";
  is_featured: boolean;
  watched: boolean;
};
export type EpisodeDetail = Episode & {
  description: string;
  chapters: Chapter[];
  spotify_url: string | null;
};
type Episodes = Page<Episode> & { featured_id: string | null };

export const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;
export const spotifyEpisodePattern = /^https:\/\/open\.spotify\.com\/episode\/[A-Za-z0-9]{22}$/;
export const episodeKind = { podcast: "Podcast", masterclass: "Masterclass" };
export const episodeDay = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeZone: "America/Sao_Paulo",
});
export function chapterTime(seconds: number) {
  const text = new Date(seconds * 1000).toISOString().slice(11, 19);
  return seconds < 3600 ? text.slice(3) : text;
}

export async function refreshPodcasts() {
  await Promise.all([
    cache.invalidateQueries({ queryKey: ["app_podcasts"] }),
    cache.invalidateQueries({ queryKey: ["app_podcast"] }),
  ]);
}

function EpisodeCover({ id, featured = false }: { id: string; featured?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="podcast-cover" aria-hidden="true">
      <Video className="podcast-cover-placeholder" size={40} />
      {!failed && youtubeIdPattern.test(id) && (
        <img
          alt=""
          src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
          loading={featured ? "eager" : "lazy"}
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      )}
      <span className="podcast-play"><Play fill="currentColor" size={featured ? 28 : 18} /></span>
    </span>
  );
}

function EpisodePlayer({ episode }: { episode: EpisodeDetail }) {
  const [position, setPosition] = useState({ seconds: 0, change: 0 });
  const id = episode.youtube_id;
  if (!youtubeIdPattern.test(id)) return <Empty>Vídeo indisponível.</Empty>;
  return (
    <div className="podcast-player">
      <iframe
        key={position.change}
        title={`Vídeo do YouTube · ${episode.title}`}
        src={`https://www.youtube-nocookie.com/embed/${id}?start=${position.seconds}&autoplay=${position.change > 0 ? 1 : 0}`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {episode.description && <p className="podcast-description">{episode.description}</p>}
      {episode.chapters.length > 0 && (
        <section aria-label="Capítulos">
          <h3>Capítulos</h3>
          <ol className="podcast-chapters">
            {episode.chapters.map(({ seconds, title }) => (
              <li key={seconds}>
                <button onClick={() => setPosition((last) => ({ seconds, change: last.change + 1 }))}>
                  <span>{chapterTime(seconds)}</span> {title}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="podcast-actions">
        <Action run={async () => {
          const data = await rpc<{ watched: boolean }>("app_podcast_watch", {
            p_id: episode.id,
            p_watched: !episode.watched,
          });
          cache.setQueryData(["app_podcast", { p_id: episode.id }], { ...episode, watched: data.watched });
          await refreshPodcasts();
        }}>
          {episode.watched ? "Desmarcar como assistido" : "Marcar como assistido"}
        </Action>
        {episode.watched && <span role="status" className="podcast-watched"><Check size={16} /> Assistido</span>}
        {episode.spotify_url && spotifyEpisodePattern.test(episode.spotify_url) && (
          <a href={episode.spotify_url} target="_blank" rel="noopener noreferrer">Ouvir no Spotify <ArrowUpRight size={16} /></a>
        )}
        <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer">Abrir no YouTube <ArrowUpRight size={16} /></a>
      </div>
    </div>
  );
}

function focusPodcastClose(content: HTMLDivElement | null) {
  // Com o detalhe em cache, o iframe já pode estar presente quando o modal abre.
  content?.closest(".dialog")?.querySelector<HTMLButtonElement>("button.close")?.focus({ preventScroll: true });
}

function EpisodeModal({ episode, trigger }: { episode: Episode; trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const query = useRpc<EpisodeDetail>("app_podcast", { p_id: episode.id }, open);
  return (
    <Modal title={episode.title} description={episodeKind[episode.kind]} trigger={trigger}
      open={open} onOpenChange={setOpen}>
      <div className="podcast-detail" ref={focusPodcastClose}>
        {open && <QueryState query={query}>{query.data && <EpisodePlayer episode={query.data} />}</QueryState>}
      </div>
    </Modal>
  );
}

function FeaturedEpisode({ id }: { id: string }) {
  const query = useRpc<EpisodeDetail>("app_podcast", { p_id: id });
  return (
    <QueryState query={query}>
      {query.data && <FeaturedCard episode={query.data} />}
    </QueryState>
  );
}

function FeaturedCard({ episode }: { episode: EpisodeDetail }) {
  return (
    <section className="podcast-featured" aria-labelledby="podcast-featured-title">
      <EpisodeModal episode={episode} trigger={
        <button className="podcast-featured-preview" aria-label={`Assistir ${episode.title}`}>
          <EpisodeCover key={episode.youtube_id} id={episode.youtube_id} featured />
        </button>
      } />
      <div className="podcast-featured-copy">
        <div className="podcast-featured-meta">
          <span className="podcast-featured-label">Em destaque</span>
          <span className="podcast-meta">{episodeKind[episode.kind]} · {episodeDay.format(new Date(episode.published_at))}</span>
        </div>
        <h2 id="podcast-featured-title">{episode.title}</h2>
        {episode.description && <p className="podcast-featured-description">{episode.description}</p>}
        {episode.chapters.length > 0 && (
          <div>
            <h3>Capítulos</h3>
            <ol className="podcast-chapters podcast-chapters-preview">
              {episode.chapters.slice(0, 3).map(({ seconds, title }) => (
                <li key={seconds}><span>{chapterTime(seconds)}</span> {title}</li>
              ))}
            </ol>
          </div>
        )}
        <EpisodeModal episode={episode} trigger={<button className="primary"><Play size={18} /> Assistir episódio</button>} />
      </div>
    </section>
  );
}

export function Podcasts() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const query = useRpc<Episodes>("app_podcasts", { p_page: page, p_query: filter });
  const data = query.data;
  return (
    <div className="podcasts podcast-surface" data-tour="podcasts">
      <Heading title="Podcasts e masterclasses em vídeo">
        Assista aos episódios e avance diretamente para os capítulos que quiser ver.
      </Heading>
      {data?.featured_id && <FeaturedEpisode id={data.featured_id} />}
      <section aria-labelledby="podcast-episodes-title">
        <div className="podcast-list-heading">
          <h2 id="podcast-episodes-title">Todos os episódios</h2>
          <form role="search" className="search stitch-search podcast-search" onSubmit={(event) => {
            event.preventDefault();
            setFilter(value(new FormData(event.currentTarget), "q"));
            setPage(1);
          }}>
            <input name="q" type="search" maxLength={120} aria-label="Buscar episódios por título" placeholder="Buscar por título" />
            <button type="submit" aria-label="Buscar"><Search size={18} aria-hidden="true" /></button>
          </form>
        </div>
        <QueryState query={query}>
          {data && (data.items.length > 0 ? (
            <ul className="podcast-grid">
              {data.items.map((episode) => (
                <li key={episode.id}>
                  <EpisodeModal episode={episode} trigger={
                    <button className="podcast-card" aria-label={`Assistir ${episode.title}${episode.watched ? " · Assistido" : ""}`}>
                      <EpisodeCover id={episode.youtube_id} />
                      <span className="podcast-card-copy">
                        <span className="podcast-meta">{episodeKind[episode.kind]} · {episodeDay.format(new Date(episode.published_at))}</span>
                        <strong>{episode.title}</strong>
                        {episode.watched && <span className="podcast-watched"><Check size={16} /> Assistido</span>}
                      </span>
                    </button>
                  } />
                </li>
              ))}
            </ul>
          ) : <Empty>{filter ? "Nenhum episódio encontrado. Tente outro título." : "Os episódios publicados aparecerão aqui."}</Empty>)}
          {data && (data.total > 20 || page > 1) && <Pager page={page} total={data.total} onChange={setPage} />}
        </QueryState>
      </section>
    </div>
  );
}
