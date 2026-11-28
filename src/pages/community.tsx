import { AdminSurface } from "./admin-surface";
import { HelpLink } from "../help-link";
import { useCallback, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Clock,
  Flag,
  ImageIcon,
  MessageSquare,
  PenLine,
  Send,
  ShieldCheck,
  ThumbsUp,
  Trophy,
} from "lucide-react";
import { cache, date, errorMessage, rpc, useRpc } from "../api";
import type { Page, Post, Space } from "../api";
import { useAuth } from "../auth";
import { clearDraft, draftStorageKey } from "../draft";
import { useModules } from "../modules";
import {
  Action,
  AdminBadge,
  Back,
  Empty,
  Field,
  Form,
  Heading,
  Modal,
  Notice,
  QueryState,
  Search,
  useDraftKey,
  value,
} from "../ui";
import { PrivateImage } from "../media";
import { Upload } from "../upload";
import "./community.css";

type CommunityFeed = Page<Post> & { spaces: Space[] };

export const statusName = (status: string) =>
  ({
    pending: "Enviado para revisão",
    approved: "Publicado",
    rejected: "Não aprovado",
    hidden: "Oculto",
    removed: "Removido",
    open: "Aberto",
    in_progress: "Em andamento",
    waiting_member: "Aguardando aluno",
    resolved: "Resolvido",
    closed: "Encerrado",
    paid: "Pago",
    pending_payment: "Aguardando pagamento",
    refunded: "Estornado",
    chargeback: "Chargeback",
    expired: "Expirado",
    cancelled: "Cancelado",
    draft: "Rascunho",
    published: "Publicado",
    archived: "Arquivado",
  })[status] ?? status;
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
}

function PostMeta({ post }: { post: Post & { avatar_id?: string | null } }) {
  const role = {
    instructor: "Instrutor",
    moderator: "Moderação",
    support: "Suporte",
  }[post.author_role];
  return (
    <div className="community-author">
      <span className="community-avatar" aria-hidden="true">
        {initials(post.author_name)}
      </span>
      {post.avatar_id && (
        <PrivateImage
          kind="avatar"
          id={post.avatar_id}
          className="community-avatar community-avatar-image"
        />
      )}
      <div className="community-author-details">
        <div className="community-byline">
          <strong>{post.author_name}</strong>
          {post.author_role === "admin" ? <AdminBadge /> : <span className="badge">{role ?? (post.plan_name || "Membro")}</span>}
        </div>
        <time dateTime={post.created_at}>{date(post.created_at)}</time>
      </div>
    </div>
  );
}

function ReviewInfo({ guide = false }: { guide?: boolean }) {
  const modules = useModules();
  return (
    <section
      className="community-card community-info"
      aria-label="Moderação da comunidade"
    >
      <h2>
        <ShieldCheck size={18} aria-hidden="true" /> Revisão humana
      </h2>
      <p>
        Publicações e respostas passam pela revisão da equipe antes de ficarem
        visíveis aos demais membros.
      </p>
      <p>Denúncias são analisadas pela equipe de moderação.</p>
      {guide && modules.help && (
        <HelpLink className="community-context-link" to="/ajuda/comunidade">
          Como publicar na comunidade <ArrowRight size={16} aria-hidden="true" />
        </HelpLink>
      )}
    </section>
  );
}

function SpaceInfo({ space, link = false }: { space: Space; link?: boolean }) {
  return (
    <section
      className="community-card community-info community-side-context"
      aria-label="Espaço da comunidade"
    >
      <h2>
        <MessageSquare size={18} aria-hidden="true" /> {space.name}
      </h2>
      {space.description && <p>{space.description}</p>}
      {link && (
        <Link
          className="community-context-link"
          to={{
            pathname: "/app/comunidade",
            search: "?" + new URLSearchParams({ space: space.id }),
          }}
        >
          Ver publicações do espaço <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}

function ThreadSpace({ id }: { id: string }) {
  const feed = useRpc<CommunityFeed>("app_feed");
  const space = feed.isSuccess && feed.data.spaces.find((item) => item.id === id);
  return space ? <SpaceInfo space={space} link /> : null;
}

export function Vote({
  post,
  type = "post",
  compact = false,
}: {
  post: Post;
  type?: "post" | "reply";
  compact?: boolean;
}) {
  return post.status !== "approved" ? (
    <span className="badge">{statusName(post.status)}</span>
  ) : (
    <Action
      run={async () => {
        await rpc("app_vote", { p_target_type: type, p_target_id: post.id });
        await Promise.all([
          cache.invalidateQueries({ queryKey: ["app_feed"] }),
          cache.invalidateQueries({ queryKey: ["app_post"] }),
        ]);
      }}
    >
      {compact ? (
        <>
          <ChevronUp size={18} aria-hidden="true" />
          <ThumbsUp className="community-vote-thumb" size={18} aria-hidden="true" />
          <span className="sr-only">
            {post.voted ? "Retirar voto" : "Votar"}
          </span>
          <strong>{post.vote_count}</strong>
          <span className="community-vote-label">
            {post.vote_count === 1 ? "voto" : "votos"}
          </span>
        </>
      ) : (
        <>
          <ArrowUp size={18} aria-hidden="true" />
          {post.voted ? "Retirar voto" : "Votar"} ({post.vote_count})
        </>
      )}
    </Action>
  );
}
export function Report({ id, type }: { id: string; type: "post" | "reply" }) {
  return (
    <Modal
      title="Denunciar conteúdo"
      trigger={
        <button>
          <Flag size={18} aria-hidden="true" />
          Denunciar
        </button>
      }
      description="A equipe vai analisar esta denúncia. Ela não remove o conteúdo automaticamente."
    >
      <Form
        draft={false}
        label="Enviar denúncia"
        onSave={async (data) => {
          await rpc("app_report", {
            p_target_type: type,
            p_target_id: id,
            p_reason: value(data, "reason"),
          });
        }}
      >
        <Field label="Motivo">
          <textarea name="reason" required minLength={10} maxLength={2000} />
        </Field>
      </Form>
    </Modal>
  );
}
export function Community() {
  const modules = useModules();
  const [params, setParams] = useSearchParams(),
    q = params.get("q") ?? "",
    space = params.get("space") ?? "",
    query = useInfiniteQuery({
      queryKey: ["app_feed", { space, q }],
      queryFn: ({ pageParam }) =>
        rpc<CommunityFeed>("app_feed", {
          p_space_id: space || null,
          p_query: q,
          p_page: pageParam,
        }),
      initialPageParam: 1,
      getNextPageParam: (page) =>
        page.page * page.page_size < page.total ? page.page + 1 : undefined,
    }),
    items = query.data?.pages.flatMap((page) => page.items) ?? [],
    first = query.data?.pages[0];
  const revealActiveSpace = useCallback((link: HTMLAnchorElement | null) => {
    const strip = link?.parentElement;
    if (!link || !strip || strip.scrollWidth <= strip.clientWidth) return;
    const { left, right } = link.getBoundingClientRect();
    const bounds = strip.getBoundingClientRect();
    strip.scrollLeft +=
      Math.min(0, left - bounds.left) + Math.max(0, right - bounds.right);
  }, []);
  const currentSpace = first?.spaces.find((item) => item.id === space);
  const feedError = query.isFetchNextPageError && first ? null : query.error;
  const canCompose =
    Boolean(first?.spaces.some((item) => item.can_post !== false)) &&
    currentSpace?.can_post !== false &&
    !feedError;
  const composerUrl =
    "/app/comunidade/novo" +
    (space ? "?" + new URLSearchParams({ space }) : "");
  const spacesById = new Map(first?.spaces.map((item) => [item.id, item.name]));
  return (
    <section className="community community-feed">
      <Heading title="Comunidade">
        Compartilhe aprendizados e tire dúvidas com outros membros.
      </Heading>
      <div className="community-controls">
        {Boolean(first?.spaces.length) && (
          <nav className="community-spaces" aria-label="Espaços da comunidade">
            <Link
              ref={!space ? revealActiveSpace : undefined}
              to={{ search: "?" + new URLSearchParams({ q }) }}
              aria-current={!space ? "true" : undefined}
            >
              Todos
            </Link>
            {first?.spaces.map((item) => (
              <Link
                key={item.id}
                ref={space === item.id ? revealActiveSpace : undefined}
                to={{ search: "?" + new URLSearchParams({ q, space: item.id }) }}
                aria-current={space === item.id ? "true" : undefined}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        )}
        {!first && space && query.error && (
          <Link
            className="button"
            to={{ search: "?" + new URLSearchParams({ q }) }}
          >
            Todos os espaços
          </Link>
        )}
        <div className="community-toolbar">
          <span>
            <Clock size={16} aria-hidden="true" /> Mais recentes
          </span>
          <Search
            initial={q}
            label="Buscar discussões"
            placeholder="Buscar discussões…"
            variant="stitch"
            onSearch={(q) => setParams({ q, space })}
          />
        </div>
      </div>
      <div className="community-columns">
        <div className="community-stack" data-tour="community">
          <QueryState
            query={{
              isPending: query.isPending,
              error: feedError,
              refetch: query.refetch,
            }}
          >
            {canCompose && (
              <div className="community-card community-compose">
                <span className="community-compose-icon" aria-hidden="true">
                  <PenLine size={20} />
                </span>
                <p>Compartilhe uma dúvida ou um aprendizado.</p>
                <Link className="button primary" to={composerUrl}>
                  Escrever publicação <Send size={16} aria-hidden="true" />
                </Link>
              </div>
            )}
            {currentSpace?.can_post === false && (
              <Notice>Você tem acesso de leitura a este espaço.</Notice>
            )}
            {items.map((post) => {
              const postUrl = {
                pathname: `/app/comunidade/${post.id}`,
                search: params.toString(),
              };
              const spaceName = post.space_id && spacesById.get(post.space_id);
              return (
                <article
                  key={post.id}
                  className="community-card community-preview"
                >
                  {(spaceName || post.status !== "approved") && (
                    <div className="community-preview-tags">
                      {spaceName && <span className="badge">{spaceName}</span>}
                      {post.status !== "approved" && (
                        <span className="badge">{statusName(post.status)}</span>
                      )}
                    </div>
                  )}
                  <div className="community-preview-content">
                    {post.status === "approved" && (
                      <div
                        className="community-vote-rail"
                        data-voted={post.voted}
                      >
                        <Vote post={post} compact />
                      </div>
                    )}
                    <div className="community-preview-body">
                      <h2>
                        <Link to={postUrl}>{post.title ?? "Publicação"}</Link>
                      </h2>
                      <p className="prose community-excerpt">{post.body}</p>
                      {post.image_id && (
                        <p className="community-preview-attachment">
                          <ImageIcon size={16} aria-hidden="true" /> Imagem na publicação
                        </p>
                      )}
                      <footer className="community-preview-footer">
                        <PostMeta post={post} />
                        <Link className="community-replies-link" to={postUrl}>
                          <MessageSquare size={16} aria-hidden="true" />
                          <span>
                            {post.reply_count ?? 0}{" "}
                            <span className="community-replies-label">
                              {(post.reply_count ?? 0) === 1
                                ? "resposta"
                                : "respostas"}
                            </span>
                          </span>
                        </Link>
                      </footer>
                    </div>
                  </div>
                </article>
              );
            })}
            {!items.length && (
              <Empty>
                {q
                  ? "Nenhuma publicação encontrada. Tente outra busca."
                  : canCompose
                    ? "Ainda não há publicações disponíveis. Escreva a primeira para revisão."
                    : "Ainda não há publicações disponíveis para você."}
              </Empty>
            )}
            {first && items.length > 0 && (
              <div className="community-pagination">
                <span role="status">
                  {items.length} de {first.total} publicações
                </span>
                {query.isFetchNextPageError && (
                  <Notice error>{errorMessage(query.error)}</Notice>
                )}
                {query.hasNextPage && (
                  <button
                    disabled={query.isFetchingNextPage}
                    onClick={() => query.fetchNextPage()}
                  >
                    {query.isFetchingNextPage
                      ? "Carregando…"
                      : query.isFetchNextPageError
                        ? "Tentar carregar mais"
                        : "Carregar mais discussões"}
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </QueryState>
        </div>
        <div className="community-sidebar">
          {currentSpace?.description && <SpaceInfo space={currentSpace} />}
          {modules.ranking && (
            <section className="community-card community-info community-side-context" aria-labelledby="community-ranking">
              <h2 id="community-ranking">
                <Trophy size={18} aria-hidden="true" /> Ranking
              </h2>
              <p>Acompanhe sua colocação e consulte a classificação por período.</p>
              <Link className="community-context-link" to="/app/ranking">
                Consultar ranking <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </section>
          )}
          <ReviewInfo guide />
        </div>
      </div>
    </section>
  );
}
export function Composer() {
  const { post: id } = useParams();
  const { session } = useAuth();
  const legacyKey = draftStorageKey(session?.user.id ?? "", `post:${id ?? "new"}`);
  return <PostComposer key={legacyKey} id={id} legacyKey={legacyKey} />;
}

function PostComposer({ id, legacyKey }: { id?: string; legacyKey: string }) {
  const label = "Enviar para revisão";
  const draftKey = useDraftKey(label, id);
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    query = useRpc<{ post: Post; replies: Post[] }>(
      "app_post",
      { p_id: id },
      !!id,
    ),
    spaces = useRpc<CommunityFeed>("app_feed"),
    [created, setCreated] = useState<string | null>(null),
    [chosenSpace, setChosenSpace] = useState<string | null>(null),
    [draft] = useState<{
      title: string;
      body: string;
      space?: string;
    } | null>(() => {
      try {
        return JSON.parse(sessionStorage.getItem(legacyKey) ?? "null");
      } catch {
        return null;
      }
    });
  const data = query.data?.post;
  const postableSpaces = spaces.data?.spaces.filter(
    (space) => space.can_post !== false,
  );
  const requestedSpace =
    chosenSpace ??
    draft?.space ??
    (id ? data?.space_id : params.get("space")) ??
    "";
  const selectedSpace = postableSpaces?.some((space) => space.id === requestedSpace)
    ? requestedSpace
    : "";
  return (
    <>
      <Back to="/app/comunidade" />
      <Heading title={id ? "Editar publicação" : "Nova publicação"} />
      <Notice>
        Publicações e edições ficam pendentes até a aprovação da equipe. Use um
        título claro.
      </Notice>
      {id && query.isPending ? (
        <p role="status">Carregando publicação…</p>
      ) : id && !data ? (
        <QueryState query={query}>
          <Notice error>Publicação indisponível.</Notice>
        </QueryState>
      ) : data && !data.can_edit ? (
        <Notice error>Você não pode editar esta publicação.</Notice>
      ) : (
        <div className="reading">
          <Form
            label={label}
            draft={id}
            draftReady={!spaces.isPending}
            secondaryAction={
              <button
                type="button"
                onClick={() => {
                  if (draftKey) clearDraft(draftKey);
                  clearDraft(legacyKey);
                  navigate("/app/comunidade");
                }}
              >
                Descartar e voltar
              </button>
            }
            onSave={async (data) => {
              const result = await rpc<{ id: string; status: string }>(
                "app_save_post",
                {
                  p_id: id ?? null,
                  p_space_id: value(data, "space"),
                  p_title: value(data, "title"),
                  p_body: value(data, "body"),
                  p_image_path: null,
                },
              );
              clearDraft(legacyKey);
              setCreated(result.id);
              await cache.invalidateQueries({ queryKey: ["app_feed"] });
            }}
          >
            <Field label="Título">
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={draft?.title ?? data?.title ?? ""}
              />
            </Field>
            <Field label="Espaço">
              <select
                name="space"
                required
                data-no-draft={spaces.isPending || undefined}
                value={selectedSpace}
                onChange={(event) => setChosenSpace(event.currentTarget.value)}
              >
                <option value="">Selecione um espaço</option>
                {postableSpaces?.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sua publicação">
              <textarea
                name="body"
                rows={10}
                required
                minLength={3}
                maxLength={20_000}
                defaultValue={draft?.body ?? data?.body ?? ""}
              />
            </Field>
          </Form>
        </div>
      )}
      {created && (
        <section>
          <Notice>
            Enviado para revisão. A publicação será exibida aos demais membros
            após a aprovação.
          </Notice>
          <Upload
            kind="post-image"
            resourceId={created}
            onUploaded={() =>
              void cache.invalidateQueries({ queryKey: ["app_post"] })
            }
          />
          <Link className="button" to={"/app/comunidade/" + created}>
            Ver minha publicação pendente
          </Link>
        </section>
      )}
    </>
  );
}
export function PostPage({ admin = false }: { admin?: boolean }) {
  const { post } = useParams(),
    [params] = useSearchParams(),
    query = useRpc<{ post: Post; replies: Post[]; can_moderate: boolean }>(
      "app_post",
      { p_id: post },
    ),
    data = query.data,
    [archiveOpen, setArchiveOpen] = useState(false),
    [archiveAction, setArchiveAction] = useState(true),
    [archiving, setArchiving] = useState(false),
    [archiveNotice, setArchiveNotice] = useState(""),
    postFocus = useRef<HTMLElement>(null);
  const canArchive = !!data?.post.can_archive,
    canRestore = !!data?.post.can_restore;
  function closeArchive(open: boolean) {
    if (archiving) return;
    if (open) setArchiveAction(canArchive);
    setArchiveOpen(open);
    if (!open && !canArchive && !canRestore)
      requestAnimationFrame(() => postFocus.current?.focus());
  }
  const content = (
    <section
      className={
        admin
          ? "community community-thread"
          : "community community-thread community-member-thread"
      }
    >
      {!admin && <Back to={"/app/comunidade?" + params} label="Voltar à comunidade" />}
      <QueryState query={query}>
        {data && (
          <div className="community-columns">
            <div className="community-stack">
              <article
                className="community-card community-topic"
                ref={postFocus}
                tabIndex={-1}
              >
                <PostMeta post={data.post} />
                {!admin && <Heading title={data.post.title ?? "Publicação"} />}
                {archiveNotice && <Notice>{archiveNotice}</Notice>}
                {data.post.status !== "approved" && (
                  <Notice>
                    {data.post.status === "archived"
                      ? "Publicação arquivada. O texto, a imagem, as respostas e os votos foram preservados. Novas interações ficam desativadas."
                      : `${statusName(data.post.status)}. A publicação não está visível aos demais membros.`}
                  </Notice>
                )}
                <div className="prose">{data.post.body}</div>
                {data.post.image_id && (
                  <PrivateImage
                    kind="post-image"
                    id={data.post.image_id}
                    className="post-image"
                    alt="Imagem anexada à publicação"
                  />
                )}
                <div className="actions community-topic-actions">
                  <Vote post={data.post} />
                  <span className="community-replies-link">
                    <MessageSquare size={16} aria-hidden="true" />
                    {data.replies.length}{" "}
                    {data.replies.length === 1 ? "resposta" : "respostas"}
                  </span>
                  {data.post.status === "approved" && (
                    <Report type="post" id={data.post.id} />
                  )}
                  {data.post.can_edit && (
                    <Link to={"/app/comunidade/" + post + "/editar"}>
                      Editar publicação
                    </Link>
                  )}
                  {(canArchive || canRestore || archiveOpen) && (
                    <Modal
                      title={
                        archiveAction
                          ? "Arquivar publicação"
                          : "Restaurar publicação"
                      }
                      open={archiveOpen}
                      onOpenChange={closeArchive}
                      trigger={
                        <button disabled={!canArchive && !canRestore}>
                          {canRestore
                            ? "Restaurar publicação"
                            : "Arquivar publicação"}
                        </button>
                      }
                      description={
                        !archiveAction
                          ? "A publicação volta ao estado anterior ao arquivamento. Conteúdo pendente ou não aprovado continua nesse estado. Texto, imagem, respostas e votos são preservados."
                          : "A publicação deixa de aparecer aos demais membros. Você e a equipe mantêm acesso ao histórico. Texto, imagem, respostas e votos são preservados; você poderá restaurar o que arquivou."
                      }
                    >
                      <Form
                        label={
                          archiveAction
                            ? "Confirmar arquivamento"
                            : "Confirmar restauração"
                        }
                        disabled={archiveAction ? !canArchive : !canRestore}
                        secondaryAction={
                          <button
                            type="button"
                            onClick={() => closeArchive(false)}
                          >
                            Cancelar
                          </button>
                        }
                        onSave={async () => {
                          setArchiving(true);
                          try {
                            const result = await rpc<{
                              id: string;
                              status: string;
                              archived: boolean;
                            }>("app_archive_post", {
                              p_id: data.post.id,
                              p_archived: archiveAction,
                            });
                            const refreshed = await query.refetch();
                            await cache.invalidateQueries({
                              queryKey: ["app_feed"],
                            });
                            const state = refreshed.isSuccess
                              ? refreshed.data.post.status
                              : result.status;
                            setArchiveNotice(
                              result.archived
                                ? "Publicação arquivada. Seu histórico foi preservado."
                                : `Publicação restaurada. Estado atual: ${statusName(state)}.`,
                            );
                            setArchiveOpen(false);
                            if (
                              !refreshed.data?.post.can_archive &&
                              !refreshed.data?.post.can_restore
                            )
                              requestAnimationFrame(() =>
                                postFocus.current?.focus(),
                              );
                          } catch (error) {
                            await query.refetch();
                            throw error;
                          } finally {
                            setArchiving(false);
                          }
                        }}
                      >
                        <p>
                          Confirme para continuar. Nenhum conteúdo será
                          excluído.
                        </p>
                      </Form>
                    </Modal>
                  )}
                </div>
                {data.can_moderate && data.post.status !== "archived" && (
                  <Moderate
                    type="post"
                    direct={admin}
                    status={data.post.status}
                    id={data.post.id}
                    after={() => query.refetch()}
                  />
                )}
              </article>
              <section
                className="community-stack"
                aria-labelledby="community-discussion"
              >
                <h2
                  id="community-discussion"
                  className="community-discussion-heading"
                >
                  Discussão da comunidade
                  {!admin && (
                    <span className="badge" aria-hidden="true">
                      {data.replies.length}
                    </span>
                  )}
                </h2>
                {!data.replies.length && (
                  <Empty>Ainda não há respostas para esta publicação.</Empty>
                )}
                {data.replies.map((reply) => (
                  <article
                    key={reply.id}
                    className="community-card community-reply"
                  >
                    <PostMeta post={reply} />
                    <div className="prose">{reply.body}</div>
                    {data.post.status === "approved" && (
                      <div className="actions">
                        <Vote post={reply} type="reply" />
                        {reply.status === "approved" && (
                          <Report type="reply" id={reply.id} />
                        )}
                      </div>
                    )}
                    {data.can_moderate && (
                      <Moderate
                        type="reply"
                        direct={admin}
                        status={reply.status}
                        id={reply.id}
                        after={() => query.refetch()}
                      />
                    )}
                  </article>
                ))}
              </section>
              {data.post.status === "approved" ? (
                <section
                  className="community-card community-contribution"
                  aria-labelledby="community-contribution"
                >
                  <h2 id="community-contribution">Sua contribuição</h2>
                  <Form
                    label="Enviar resposta para revisão"
                    successMessage="Resposta enviada para revisão."
                    onSave={async (data, form) => {
                      await rpc("app_reply", {
                        p_post_id: post,
                        p_body: value(data, "body"),
                      });
                      form.reset();
                      await Promise.all([
                        query.refetch(),
                        cache.invalidateQueries({ queryKey: ["app_feed"] }),
                      ]);
                    }}
                  >
                    <Field label="Escreva uma resposta">
                      <textarea
                        name="body"
                        rows={5}
                        required
                        minLength={3}
                        maxLength={10_000}
                      />
                    </Field>
                  </Form>
                </section>
              ) : (
                <Notice>
                  {data.post.status === "archived"
                    ? "Esta publicação está arquivada e mantém as respostas apenas para leitura."
                    : "As respostas ficam disponíveis quando a publicação está aprovada."}
                </Notice>
              )}
            </div>
            {admin ? (
              <ReviewInfo />
            ) : (
              <div className="community-sidebar">
                {data.post.space_id && <ThreadSpace id={data.post.space_id} />}
                <ReviewInfo guide />
              </div>
            )}
          </div>
        )}
      </QueryState>
    </section>
  );
  return admin ? <AdminSurface section="publicacao"
    trail={["Administração", { label: "Fila de moderação", to: "/admin/comunidade" }, "Publicação"]}
    title={data?.post.title ?? "Publicação"} description="Leia a discussão e registre a decisão de moderação.">
    {content}
  </AdminSurface> : content;
}
export function Moderate({ id, type, status, after, direct = true }: {
  id: string;
  type: "post" | "reply";
  status?: string;
  direct?: boolean;
  after: () => unknown;
}) {
  const [decision, setDecision] = useState<"reject" | "hide" | "remove">();
  const labels = { reject: "Rejeitar", hide: "Ocultar", remove: "Remover" };
  async function apply(choice: string, reason: string) {
    await rpc("app_moderate", {
      p_target_type: type, p_target_id: id, p_decision: choice, p_reason: reason,
    });
    await Promise.all([
      after(),
      cache.invalidateQueries({ queryKey: ["app_feed"] }),
      cache.invalidateQueries({ queryKey: ["app_post"] }),
      cache.invalidateQueries({ queryKey: ["app_admin_list"] }),
      cache.invalidateQueries({ queryKey: ["app_admin_moderation_queue"] }),
      cache.invalidateQueries({ queryKey: ["app_admin_reports"] }),
    ]);
  }
  if (!direct) return <details className="moderate">
    <summary>Moderação manual</summary>
    <Form draft={false} label="Confirmar decisão" onSave={async (data) => {
      if (!window.confirm("Confirmar esta decisão de moderação?")) throw new Error("Decisão cancelada.");
      await apply(value(data, "decision"), value(data, "reason"));
    }}>
      <Field label="Decisão">
        <select name="decision">
          <option value="approve">Aprovar</option>
          <option value="reject">Rejeitar</option>
          <option value="hide">Ocultar</option>
          <option value="remove">Remover</option>
        </select>
      </Field>
      <Field label="Motivo da decisão"><textarea name="reason" required minLength={5} maxLength={2000} /></Field>
    </Form>
  </details>;
  if (status === "archived") return null;
  return (
    <div className="actions">
      {status !== "approved" && <Action run={() => apply("approve", "Aprovação manual.")}>Aprovar</Action>}
      {(["reject", "hide", "remove"] as const).filter((choice) =>
        !(choice === "reject" && status && status !== "pending") &&
        !(choice === "hide" && (status === "hidden" || status === "removed")) &&
        !(choice === "remove" && status === "removed"),
      ).map((choice) => <Modal key={choice} title={labels[choice] + (type === "post" ? " publicação" : " resposta")}
        open={decision === choice} onOpenChange={(open) => setDecision(open ? choice : undefined)}
        trigger={<button>{labels[choice]}</button>}>
        <Form draft={false} label={labels[choice]} onDone={() => setDecision(undefined)}
          onSave={(data) => apply(choice, value(data, "reason"))}>
          <Field label="Motivo da decisão">
            <textarea name="reason" required minLength={3} maxLength={2000} />
          </Field>
        </Form>
      </Modal>)}
    </div>
  );
}
