import * as Dialog from "@radix-ui/react-dialog";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { ArrowRight, Award, Bell, BookOpen, Check, FolderOpen, LifeBuoy, MessageSquare, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { date, internalPath, rpc } from "../api";
import type { Page } from "../api";
import { StitchIcon } from "../stitch-icon";
import { Empty, Heading, Loading, Notice } from "../ui";
import "./notifications.css";

type NotificationItem = {
  id: string;
  event_key: string;
  title: string;
  subtitle: string | null;
  action_path: string | null;
  created_at: string;
  read_at: string | null;
};
type NotificationPage = Page<NotificationItem> & { unread_count: number };
type NotificationView = Omit<NotificationItem, "read_at"> & { unread: boolean };
type NotificationList = Page<NotificationView> & { unread_count: number };
type Preference = {
  event_key: string;
  group: string;
  label: string;
  in_app: boolean;
  email: boolean;
  email_available: boolean;
};
type Preferences = { items: Preference[] };
type MemberProps = { memberId: string };

const historyPath = "/app/notificacoes";
const time = new Intl.RelativeTimeFormat("pt-BR", { numeric: "always" });

function relativeTime(value: string) {
  const seconds = Math.round((Date.parse(value) - Date.now()) / 1000);
  if (!Number.isFinite(seconds)) return "Data indisponível";
  if (Math.abs(seconds) < 60) return "Agora";
  if (Math.abs(seconds) < 3600) return time.format(Math.trunc(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return time.format(Math.trunc(seconds / 3600), "hour");
  return time.format(Math.trunc(seconds / 86400), "day");
}

export const notificationListKey = (memberId: string) => ["app_notifications", memberId] as const;

export async function reconcileNotificationQueries(
  cache: QueryClient,
  filter: { queryKey: readonly [string, string]; exact?: boolean },
) {
  // A invalidação sozinha reaproveita a primeira consulta ainda sem dados.
  await cache.cancelQueries(filter);
  return cache.invalidateQueries(filter);
}

function useNotifications(memberId: string, page: number) {
  return useQuery({
    queryKey: [...notificationListKey(memberId), page],
    queryFn: async (): Promise<NotificationList> => {
      const data = await rpc<NotificationPage>("app_notifications", { p_page: page });
      return {
        ...data,
        items: data.items.map(({ read_at, ...item }) => ({ ...item, unread: read_at === null })),
      };
    },
  });
}

function useMarkRead(memberId: string) {
  const cache = useQueryClient();
  const mutationKey = ["app_notifications_read", memberId];
  const busy = useIsMutating({ mutationKey, exact: true }) > 0;
  const mutation = useMutation({
    mutationKey,
    mutationFn: (id: string | null) => rpc<{ unread_count: number }>("app_notifications_read", { p_id: id }),
    onSuccess: () => {
      void reconcileNotificationQueries(cache, { queryKey: notificationListKey(memberId) });
    },
  });
  async function markRead(id: string | null, opensAnotherTab = false) {
    if (!opensAnotherTab && cache.isMutating({ mutationKey, exact: true })) return false;
    try {
      await mutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  }
  return { busy, mutation, markRead };
}

const destinations = {
  cursos: { icon: BookOpen, label: "Ver curso" },
  materiais: { icon: FolderOpen, label: "Ver materiais" },
  comunidade: { icon: MessageSquare, label: "Ver publicação" },
  certificados: { icon: Award, label: "Ver certificados" },
  suporte: { icon: LifeBuoy, label: "Ver chamado" },
};

function NotificationRow({ item, busy, markRead }: {
  item: NotificationView;
  busy: boolean;
  markRead: (id: string, opensAnotherTab?: boolean) => Promise<boolean>;
}) {
  const path = internalPath(item.action_path, "");
  const target = /^\/app(?:\/|\?|$)/.test(path) ? path : "";
  const section = target.split(/[/?]/)[2];
  const destination = Object.hasOwn(destinations, section) ? destinations[section as keyof typeof destinations] : undefined;
  const Icon = destination?.icon ?? Bell;
  const navigate = useNavigate();
  const row = useRef<HTMLLIElement>(null);
  const validDate = Number.isFinite(Date.parse(item.created_at));

  return (
    <li className="notification-row" data-unread={item.unread} ref={row} tabIndex={-1}>
      <span className="notification-row-icon"><Icon size={19} aria-hidden="true" /></span>
      <div className="notification-row-body">
        <strong>{item.title}</strong>
        {item.subtitle && <p>{item.subtitle}</p>}
        <div className="notification-row-meta">
          <time dateTime={validDate ? item.created_at : undefined} title={validDate ? date(item.created_at) : undefined}>
            {relativeTime(item.created_at)}
          </time>
          {target ? (
            <Link
              className="notification-action"
              to={target}
              aria-label={`${destination?.label ?? "Abrir notificação"}: ${item.title}`}
              aria-disabled={item.unread && busy ? true : undefined}
              onClick={async (event) => {
                if (!item.unread || event.defaultPrevented || event.button !== 0) return;
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                  if (!event.altKey && (event.metaKey || event.ctrlKey)) void markRead(item.id, true);
                  return;
                }
                event.preventDefault();
                if (busy) return;
                const link = event.currentTarget;
                if (await markRead(item.id) && link.isConnected) navigate(target);
              }}
              onAuxClick={(event) => {
                if (!event.defaultPrevented && event.button === 1 && item.unread) void markRead(item.id, true);
              }}
            >
              {destination?.label ?? "Abrir notificação"} <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : item.unread && (
            <button
              className="notification-action"
              type="button"
              aria-disabled={busy}
              aria-label={`Marcar como lida: ${item.title}`}
              onClick={async (event) => {
                const button = event.currentTarget;
                if (!busy && await markRead(item.id) && document.activeElement === button) row.current?.focus();
              }}
            >Marcar como lida</button>
          )}
        </div>
      </div>
      {item.unread && <span className="notification-row-dot"><span className="sr-only">Não lida</span></span>}
    </li>
  );
}

function MarkAll({ count, reader }: { count?: number; reader: ReturnType<typeof useMarkRead> }) {
  const unavailable = count === undefined || count === 0 || reader.busy;
  return (
    <button className="notification-action" type="button" aria-disabled={unavailable}
      onClick={() => { if (!unavailable) void reader.markRead(null); }}>
      <Check size={16} aria-hidden="true" /> Marcar todas como lidas
    </button>
  );
}

function NotificationRows({ query, reader, preview = false }: {
  query: ReturnType<typeof useNotifications>;
  reader: ReturnType<typeof useMarkRead>;
  preview?: boolean;
}) {
  return (
    <div className="notification-list">
      {reader.mutation.isError && <Notice error>Não foi possível marcar como lida. Tente novamente.</Notice>}
      <span className="sr-only" role="status">
        {reader.mutation.isPending ? "Marcando como lida…" : reader.mutation.isSuccess ?
          (reader.mutation.variables === null ? "Notificações marcadas como lidas." : "Notificação marcada como lida.") : ""}
      </span>
      {query.isError && (
        <div className="notification-load-error">
          <Notice error>Não foi possível {query.data ? "atualizar" : "carregar"} as notificações.</Notice>
          <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>Tentar novamente</button>
        </div>
      )}
      {query.isPending && <Loading />}
      {query.data && (query.data.items.length ? (
        <ul className="notification-rows">
          {(preview ? query.data.items.slice(0, 5) : query.data.items).map((item) => (
            <NotificationRow key={item.id} item={item} busy={reader.busy} markRead={reader.markRead} />
          ))}
        </ul>
      ) : <Empty>Seus avisos aparecem aqui quando houver novidades.</Empty>)}
    </div>
  );
}

export function NotificationBell({ memberId, stitchIcon }: MemberProps & { stitchIcon?: boolean }) {
  const query = useNotifications(memberId, 1);
  const reader = useMarkRead(memberId);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const { key } = useLocation();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 0, right: 12 });
  const open = openedAt === key;
  const count = query.isError ? undefined : query.data?.unread_count;
  const routeChanged = openedAt !== null && openedAt !== key;
  const bellIcon = <Bell size={22} aria-hidden="true" />;

  useEffect(() => { if (routeChanged) setOpenedAt(null); }, [routeChanged]);

  useEffect(() => {
    if (!open) return;
    function place() {
      const button = trigger.current?.getBoundingClientRect();
      if (button) setPosition({ top: Math.max(8, button.bottom + 8), right: Math.max(12, window.innerWidth - button.right) });
    }
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(show) => {
      if (show) {
        const button = trigger.current!.getBoundingClientRect();
        setPosition({ top: Math.max(8, button.bottom + 8), right: Math.max(12, window.innerWidth - button.right) });
        if (!reader.busy) reader.mutation.reset();
        void query.refetch();
      }
      setOpenedAt(show ? key : null);
    }}>
      <Dialog.Trigger ref={trigger} type="button" className="icon-button notification-bell" data-tour="notification-bell"
        aria-label={count ? `Notificações, ${count} ${count === 1 ? "não lida" : "não lidas"}` : "Notificações"}>
        {stitchIcon ? <StitchIcon name="notifications" fallback={bellIcon} /> : bellIcon}
        {count !== undefined && count > 0 && <span className="notification-badge" aria-hidden="true"><span>{count > 99 ? "99+" : count}</span></span>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="notification-overlay" />
        <Dialog.Content className="notification-dropdown" aria-modal="true" aria-describedby={undefined}
          style={{ "--notification-top": `${position.top}px`, "--notification-right": `${position.right}px` } as CSSProperties}
          onOpenAutoFocus={(event) => { event.preventDefault(); title.current?.focus(); }}
          onCloseAutoFocus={(event) => { if (routeChanged) event.preventDefault(); }}>
          <header className="notification-dropdown-header">
            <Dialog.Title ref={title} tabIndex={-1}>Notificações</Dialog.Title>
            <Dialog.Close type="button" className="icon-button notification-close" aria-label="Fechar notificações"><X size={20} /></Dialog.Close>
            <MarkAll count={count} reader={reader} />
          </header>
          <NotificationRows query={query} reader={reader} preview />
          <footer className="notification-dropdown-footer">
            <Link className="notification-action" to={historyPath}>Ver todas as notificações <ArrowRight size={16} aria-hidden="true" /></Link>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function NotificationHistory({ memberId }: MemberProps) {
  const [page, setPage] = useState(1);
  const heading = useRef<HTMLDivElement>(null);
  const query = useNotifications(memberId, page);
  const reader = useMarkRead(memberId);
  const data = query.data;
  function goTo(next: number) {
    reader.mutation.reset();
    setPage(next);
    heading.current?.querySelector("h1")?.focus();
  }
  return (
    <section className="notification-history" data-tour="notification-history">
      <div ref={heading}>
        <Heading title="Notificações" action={<MarkAll count={query.isError ? undefined : data?.unread_count} reader={reader} />}>
          Acompanhe seus avisos e atualizações.
        </Heading>
      </div>
      <NotificationRows query={query} reader={reader} />
      {(page > 1 || (data && data.total > data.page_size)) && (
        <nav className="pagination" aria-label="Paginação de notificações">
          <span role="status">Página {data?.page ?? page}{data && ` de ${Math.max(1, Math.ceil(data.total / data.page_size))}`}</span>
          <button type="button" disabled={reader.busy || page <= 1} onClick={() => goTo((data?.page ?? page) - 1)}>Anterior</button>
          <button type="button" disabled={reader.busy || !data || data.page * data.page_size >= data.total} onClick={() => goTo((data?.page ?? page) + 1)}>Próxima</button>
        </nav>
      )}
    </section>
  );
}

export function NotificationPreferences({ memberId }: MemberProps) {
  const cache = useQueryClient();
  const queryKey = ["app_notification_preferences", memberId] as const;
  const query = useQuery({ queryKey, queryFn: () => rpc<Preferences>("app_notification_preferences") });
  const mutationKey = ["app_set_notification_preference", memberId];
  const busy = useIsMutating({ mutationKey, exact: true }) > 0;
  const mutation = useMutation({
    mutationKey,
    mutationFn: (item: Preference) => rpc<Preference>("app_set_notification_preference", {
      p_event_key: item.event_key, p_in_app: !item.in_app,
    }),
    onSuccess: () => reconcileNotificationQueries(cache, { queryKey, exact: true }),
  });
  const items = query.data?.items ?? [];
  const showEmail = items.some((item) => item.email_available);
  const groups = new Map<string, Preference[]>();
  for (const item of items) {
    const group = groups.get(item.group);
    if (group) group.push(item);
    else groups.set(item.group, [item]);
  }

  return (
    <section className="notification-preferences" data-tour="notification-preferences">
      <Heading title="Preferências de notificação" level={2}>Escolha quais avisos deseja receber na plataforma.</Heading>
      {query.isPending && <Loading />}
      {query.isError && (
        <div className="notification-load-error">
          <Notice error>Não foi possível carregar as preferências de notificação.</Notice>
          <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>Tentar novamente</button>
        </div>
      )}
      {query.data && (items.length ? (
        <>
          <table className="notification-preference-table">
            <thead><tr><th scope="col">Evento</th><th scope="col">Na plataforma</th>{showEmail && <th scope="col">E-mail</th>}</tr></thead>
            {[...groups].map(([group, preferences]) => (
              <tbody key={group}>
                <tr className="notification-preference-group"><th scope="rowgroup" colSpan={showEmail ? 3 : 2}>{group}</th></tr>
                {preferences.map((item) => (
                  <tr key={item.event_key}>
                    <th scope="row">{item.label}</th>
                    <td>
                      <button type="button" className="notification-switch" role="switch"
                        aria-label={`${item.label} na plataforma`} aria-checked={item.in_app} aria-disabled={busy || query.isError}
                        onClick={() => {
                          if (!query.isError && !cache.isMutating({ mutationKey, exact: true })) mutation.mutate(item);
                        }}>
                        <span aria-hidden="true" />
                      </button>
                    </td>
                    {showEmail && <td>{item.email_available ? (item.email ? "Ativado" : "Desativado") : "Indisponível"}</td>}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          {showEmail && <p className="notification-email-note">O estado do e-mail é apenas informativo.</p>}
          {mutation.isError && <Notice error>Não foi possível salvar «{mutation.variables.label}». Tente novamente.</Notice>}
          <p className="notification-status" role="status">
            {mutation.isPending ? "Salvando preferência…" : mutation.isSuccess ? "Preferência salva." : ""}
          </p>
        </>
      ) : <Empty>As preferências disponíveis para sua conta aparecerão aqui.</Empty>)}
    </section>
  );
}
