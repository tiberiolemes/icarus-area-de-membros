import { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowUp, Flag, MessageSquare } from "lucide-react";
import { cache, date, rpc, useRpc } from "../api";
import type { Page, Post, Space } from "../api";
import { useAuth } from "../auth";
import {
  Action,
  Back,
  Empty,
  Field,
  Form,
  Heading,
  Modal,
  Notice,
  QueryState,
  Search,
  Unsaved,
  value,
} from "../ui";
import { PrivateImage } from "../media";
import { Upload } from "../upload";

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
export function PostMeta({ post }: { post: Post }) {
  return (
    <p className="meta">
      {post.author_name}{" "}
      <span className="badge">
        {post.author_role === "member"
          ? post.plan_name || "Membro"
          : post.author_role}
      </span>{" "}
      · {date(post.created_at)} · <span>{statusName(post.status)}</span>
    </p>
  );
}
export function Vote({
  post,
  type = "post",
  onVoted,
}: {
  post: Post;
  type?: "post" | "reply";
  onVoted?: () => void;
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
        onVoted?.();
      }}
    >
      <ArrowUp size={18} aria-hidden="true" />
      {post.voted ? "Retirar voto" : "Votar"} ({post.vote_count})
    </Action>
  );
}
export function Report({ id, type }: { id: string; type: "post" | "reply" }) {
  return (
    <Modal
      title="Denunciar conteúdo"
      trigger={
        <button>
          <Flag size={18} />
          Denunciar
        </button>
      }
      description="A equipe vai analisar esta denúncia. Ela não remove o conteúdo automaticamente."
    >
      <Form
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
  const [params, setParams] = useSearchParams(),
    q = params.get("q") ?? "",
    space = params.get("space") ?? "",
    query = useInfiniteQuery({
      queryKey: ["app_feed", { space, q }],
      queryFn: ({ pageParam }) =>
        rpc<Page<Post> & { spaces: Space[] }>("app_feed", {
          p_space_id: space || null,
          p_query: q,
          p_page: pageParam,
        }),
      initialPageParam: 1,
      getNextPageParam: (page) =>
        page.page * 20 < page.total ? page.page + 1 : undefined,
    }),
    items = query.data?.pages.flatMap((page) => page.items) ?? [],
    first = query.data?.pages[0];
  return (
    <>
      <Heading
        title="Comunidade"
        action={
          <Link
            className="button primary"
            to={"/app/comunidade/novo" + (space ? "?space=" + space : "")}
          >
            Escrever publicação
          </Link>
        }
      >
        Compartilhe aprendizados e tire dúvidas. Publicações passam por revisão
        humana.
      </Heading>
      <div className="filters">
        <Search initial={q} onSearch={(q) => setParams({ q, space })} />
        <label className="field">
          <span>Espaço</span>
          <select
            value={space}
            onChange={(e) => setParams({ q, space: e.target.value })}
          >
            <option value="">Todos os espaços</option>
            {first?.spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <QueryState query={query}>
        <div className="feed" data-tour="community">
          {items.map((post) => (
            <article key={post.id} className="post-row">
              <div>
                <PostMeta post={post} />
                <h2>
                  <Link to={`/app/comunidade/${post.id}?${params}`}>
                    {post.title}
                  </Link>
                </h2>
                <p className="clamp prose">{post.body}</p>
              </div>
              <footer>
                <Vote post={post} />
                <Link to={`/app/comunidade/${post.id}?${params}`}>
                  <MessageSquare size={18} />
                  {post.reply_count ?? 0} respostas
                </Link>
              </footer>
            </article>
          ))}
        </div>
        {!items.length && (
          <Empty>
            {q
              ? "Nenhuma publicação encontrada. Tente outra busca."
              : "Este espaço ainda não tem publicações disponíveis. Escreva a primeira para revisão."}
          </Empty>
        )}
        {first && (
          <div className="pagination">
            <span>
              {items.length} de {first.total} publicações
            </span>
            {query.hasNextPage && (
              <button
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                {query.isFetchingNextPage ? "Carregando…" : "Carregar mais 20"}
              </button>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}
export function Composer() {
  const { post: id } = useParams(),
    [params] = useSearchParams(),
    navigate = useNavigate(),
    { session } = useAuth(),
    query = useRpc<{ post: Post; replies: Post[] }>(
      "app_post",
      { p_id: id },
      !!id,
    ),
    spaces = useRpc<Page<Post> & { spaces: Space[] }>("app_feed"),
    [dirty, setDirty] = useState(false),
    [created, setCreated] = useState<string | null>(null),
    [draft, setDraft] = useState<{
      title: string;
      body: string;
      space: string;
    } | null>(null),
    draftKey = `icarus:draft:${session?.user.id}:post:${id ?? "new"}`;
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(draftKey);
      if (stored) setDraft(JSON.parse(stored));
    } catch {
      /* Storage can be unavailable. */
    }
  }, [draftKey]);
  const data = query.data?.post;
  function preserve(form: HTMLFormElement) {
    const f = new FormData(form);
    setDirty(true);
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          title: value(f, "title"),
          body: value(f, "body"),
          space: value(f, "space"),
        }),
      );
    } catch {
      /* Keep the active form in memory if storage is full. */
    }
  }
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
        <div
          className="reading"
          onInput={(e) => {
            const form = (e.target as HTMLElement).closest("form");
            if (form) preserve(form);
          }}
        >
          <Form
            key={id ?? draftKey}
            label="Enviar para revisão"
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
              setDirty(false);
              sessionStorage.removeItem(draftKey);
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
                defaultValue={
                  draft?.space ?? data?.space_id ?? params.get("space") ?? ""
                }
              >
                <option value="">Selecione um espaço</option>
                {spaces.data?.spaces
                  .filter((s) => s.can_post !== false)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
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
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(draftKey);
                setDraft(null);
                setDirty(false);
                navigate("/app/comunidade");
              }}
            >
              Descartar e voltar
            </button>
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
    data = query.data;
  return (
    <>
      <Back
        to={admin ? "/admin/comunidade" : "/app/comunidade?" + params}
        label={admin ? "Fila de moderação" : "Voltar à comunidade"}
      />
      <QueryState query={query}>
        {data && (
          <div className="reading">
            <PostMeta post={data.post} />
            <Heading title={data.post.title ?? "Publicação"} />
            {data.post.status !== "approved" && (
              <Notice>
                {statusName(data.post.status)}. A publicação só fica visível aos
                demais membros após aprovação.
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
            <div className="actions">
              <Vote post={data.post} />
              {data.post.status === "approved" && (
                <Report type="post" id={data.post.id} />
              )}
              {data.post.can_edit && (
                <Link to={"/app/comunidade/" + post + "/editar"}>
                  Editar publicação
                </Link>
              )}
            </div>
            {data.can_moderate && (
              <Moderate
                type="post"
                id={data.post.id}
                after={() => query.refetch()}
              />
            )}
            <h2>
              {data.replies.length} resposta
              {data.replies.length === 1 ? "" : "s"}
            </h2>
            <div className="thread">
              {data.replies.map((reply) => (
                <article key={reply.id}>
                  <PostMeta post={reply} />
                  <div className="prose">{reply.body}</div>
                  <div className="actions">
                    <Vote post={reply} type="reply" />
                    {reply.status === "approved" && (
                      <Report type="reply" id={reply.id} />
                    )}
                  </div>
                  {data.can_moderate && (
                    <Moderate
                      type="reply"
                      id={reply.id}
                      after={() => query.refetch()}
                    />
                  )}
                </article>
              ))}
            </div>
            {data.post.status === "approved" ? (
              <Form
                label="Enviar resposta para revisão"
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
            ) : (
              <Notice>
                Você poderá responder após a aprovação desta publicação.
              </Notice>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}
export function Moderate({
  id,
  type,
  after,
}: {
  id: string;
  type: "post" | "reply";
  after: () => unknown;
}) {
  return (
    <details className="moderate">
      <summary>Moderação manual</summary>
      <Form
        label="Confirmar decisão"
        onSave={async (data) => {
          if (!window.confirm("Confirmar esta decisão de moderação?"))
            throw new Error("Decisão cancelada.");
          await rpc("app_moderate", {
            p_target_type: type,
            p_target_id: id,
            p_decision: value(data, "decision"),
            p_reason: value(data, "reason"),
          });
          await Promise.all([
            after(),
            cache.invalidateQueries({ queryKey: ["app_feed"] }),
            cache.invalidateQueries({ queryKey: ["app_post"] }),
            cache.invalidateQueries({ queryKey: ["app_admin_list"] }),
          ]);
        }}
      >
        <Field label="Decisão">
          <select name="decision">
            <option value="approve">Aprovar</option>
            <option value="reject">Rejeitar</option>
            <option value="hide">Ocultar</option>
            <option value="remove">Remover</option>
          </select>
        </Field>
        <Field label="Motivo da decisão">
          <textarea name="reason" required minLength={5} maxLength={2000} />
        </Field>
      </Form>
    </details>
  );
}
