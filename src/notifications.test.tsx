import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { rpc } from "./api";
import { NotificationBell, NotificationHistory, NotificationPreferences } from "./pages/notifications";

vi.mock("./api", async (importOriginal) => ({ ...await importOriginal<typeof import("./api")>(), rpc: vi.fn() }));
const call = vi.mocked(rpc);
const readAt = "2026-11-24T10:15:00Z";
const course = {
  id: "89b2b880-f676-4a46-b164-7ec79115352c",
  event_key: "course_published", title: "Novo curso disponível", subtitle: "Acesse a primeira aula",
  action_path: "/app/cursos/novo", created_at: readAt, read_at: null as string | null,
};
const material = { ...course, id: "ab07aa7b-dbca-4c22-adaf-ad862c49425e", title: "Material novo", action_path: "/app/materiais" };
const preference = { event_key: "course_published", group: "Conteúdo", label: "Novo curso", in_app: true, email: false, email_available: false };
const member = { memberId: "titular" };

function mount(children: ReactNode, path = "/") {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000 } } });
  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={cache}><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></QueryClientProvider>
  );
  const result = render(wrap(children));
  return { ...result, cache, update: (node: ReactNode) => result.rerender(wrap(node)) };
}

const notificationPage = (items: typeof course[] = [course], count = 1) => ({ items, page: 1, page_size: 20, total: items.length, unread_count: count });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => call.mockReset());
afterEach(cleanup);

describe("notificações", () => {
  it("mostra contagem somente após a consulta e recupera falha no dropdown", async () => {
    call.mockRejectedValueOnce(new Error("consulta falhou")).mockRejectedValueOnce(new Error("consulta falhou"))
      .mockResolvedValue(notificationPage());
    mount(<NotificationBell {...member} />);
    const bell = screen.getByRole("button", { name: "Notificações" });
    expect(bell.querySelector(".notification-badge")).toBeNull();
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    fireEvent.click(bell);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(bell).toHaveAccessibleName("Notificações");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText(course.title)).toBeVisible();
    expect(bell).toHaveAccessibleName("Notificações, 1 não lida");
  });

  it("aguarda o ACK antes de abrir o destino e preserva a leitura após falha", async () => {
    const ack = deferred<{ unread_count: number }>();
    const reconciled = deferred<ReturnType<typeof notificationPage>>();
    let reads = 0;
    call.mockImplementation(async (name) => {
      if (name === "app_notifications") return reads >= 2 ? reconciled.promise : notificationPage();
      if (++reads === 1) throw new Error("gravação falhou");
      return ack.promise;
    });
    mount(<><NotificationBell {...member} /><Routes><Route path="/" element={<h1>Player</h1>} />
      <Route path="/app/cursos/novo" element={<h1>Curso aberto</h1>} /></Routes></>);
    const bell = await screen.findByRole("button", { name: "Notificações, 1 não lida" });
    fireEvent.click(bell);
    const link = await screen.findByRole("link", { name: `Ver curso: ${course.title}` });
    fireEvent.click(link);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível marcar");
    expect(screen.getByText("Não lida")).toBeInTheDocument();
    expect(screen.getByText("Player")).toBeInTheDocument();
    fireEvent.click(link);
    fireEvent.click(link);
    await waitFor(() => expect(call).toHaveBeenCalledWith("app_notifications_read", { p_id: course.id }));
    expect(call.mock.calls.filter(([name]) => name === "app_notifications_read")).toHaveLength(2);
    expect(screen.getByText("Player")).toBeInTheDocument();
    await act(async () => ack.resolve({ unread_count: 0 }));
    expect(await screen.findByRole("heading", { name: "Curso aberto" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bell).toHaveAccessibleName("Notificações, 1 não lida");
    await act(async () => reconciled.resolve(notificationPage([{ ...course, read_at: readAt }], 0)));
    await waitFor(() => expect(bell.querySelector(".notification-badge")).toBeNull());
  });

  it.each([
    ["Ctrl", "click", { button: 0, ctrlKey: true }],
    ["Cmd", "click", { button: 0, metaKey: true }],
    ["botão do meio", "auxclick", { button: 1 }],
  ])("registra a leitura em %s sem cancelar a ação nativa", async (_label, name, options) => {
    let read = false;
    call.mockImplementation(async (rpcName) => {
      if (rpcName === "app_notifications_read") { read = true; return { unread_count: 0 }; }
      return notificationPage([{ ...course, read_at: read ? readAt : null }], read ? 0 : 1);
    });
    mount(<NotificationHistory {...member} />);
    const link = await screen.findByRole("link", { name: `Ver curso: ${course.title}` });
    expect(link).toHaveAttribute("href", course.action_path);
    fireEvent.contextMenu(link);
    fireEvent(link, new MouseEvent("auxclick", { button: 2, bubbles: true, cancelable: true }));
    expect(call.mock.calls.filter(([rpcName]) => rpcName === "app_notifications_read")).toHaveLength(0);

    expect(fireEvent(link, new MouseEvent(name, { ...options, bubbles: true, cancelable: true }))).toBe(true);
    await waitFor(() => expect(call).toHaveBeenCalledWith("app_notifications_read", { p_id: course.id }));
    await waitFor(() => expect(screen.queryByText("Não lida")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Notificações" })).toBeVisible();
  });

  it("pagina com o page_size do servidor e sincroniza a leitura coletiva com o sino", async () => {
    let marked = false;
    call.mockImplementation(async (name, args) => {
      if (name === "app_notifications_read") { marked = true; return { unread_count: 0 }; }
      const page = Number(args?.p_page);
      const item = page === 1 ? course : material;
      return { page, page_size: 1, total: 2, unread_count: marked ? 0 : 2,
        items: [{ ...item, read_at: marked ? readAt : null }] };
    });
    mount(<><NotificationBell {...member} /><NotificationHistory {...member} /></>);
    expect(await screen.findByText(course.title)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText(material.title)).toBeVisible();
    expect(screen.getByText("Página 2 de 2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Notificações" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Marcar todas como lidas" }));
    expect(await screen.findByText("Notificações marcadas como lidas.")).toBeInTheDocument();
    expect(call).toHaveBeenCalledWith("app_notifications_read", { p_id: null });
    expect(screen.getByRole("button", { name: "Notificações" }).querySelector(".notification-badge")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByText(course.title)).toBeVisible();
    expect(screen.queryByText("Não lida")).not.toBeInTheDocument();
  });

  it("escapa o conteúdo, recusa destinos externos e internos fora da área de membros e permite só marcar", async () => {
    const invalid = ["https://externo.invalid/", "javascript:void(0)", "//externo.invalid", "/app/../admin", "/app/%2e%2e/admin", "/app/\\externo.invalid"];
    call.mockImplementation(async (name) => name === "app_notifications_read" ? { unread_count: 5 } :
      notificationPage(invalid.map((path, index) => ({ ...course, title: `Aviso ${index}`, id: `${index}`,
        subtitle: "<img src=x>", action_path: path })), invalid.length));
    mount(<NotificationHistory {...member} />);
    expect(await screen.findAllByText("<img src=x>")).toHaveLength(invalid.length);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar como lida: Aviso 0" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("app_notifications_read", { p_id: "0" }));
  });

  it("abre com foco no título, fecha com Escape e volta ao sino", async () => {
    call.mockResolvedValue(notificationPage());
    mount(<NotificationBell {...member} />);
    const bell = await screen.findByRole("button", { name: "Notificações, 1 não lida" });
    fireEvent.click(bell);
    const dialog = await screen.findByRole("dialog", { name: "Notificações" });
    expect(within(dialog).getByRole("heading")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(bell).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("usa apenas preferências retornadas e só confirma a mudança na plataforma após ACK", async () => {
    const ack = deferred<typeof preference>();
    let saves = 0;
    let stored = preference;
    call.mockImplementation(async (name) => {
      if (name === "app_notification_preferences") return { items: [stored] };
      if (++saves === 1) throw new Error("falha");
      stored = await ack.promise;
      return stored;
    });
    mount(<NotificationPreferences {...member} />);
    const toggle = await screen.findByRole("switch", { name: "Novo curso na plataforma" });
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByRole("columnheader", { name: "E-mail" })).not.toBeInTheDocument();
    expect(screen.queryByText("WhatsApp")).not.toBeInTheDocument();
    toggle.focus();
    fireEvent.click(toggle);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar");
    expect(toggle).toBeChecked();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(await screen.findByText("Salvando preferência…")).toBeInTheDocument();
    expect(toggle).toBeChecked();
    expect(call).toHaveBeenCalledWith("app_set_notification_preference", { p_event_key: preference.event_key, p_in_app: false });
    await act(async () => ack.resolve({ ...preference, in_app: false }));
    expect(await screen.findByText("Preferência salva.")).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it("reconsulta a preferência atual quando o ACK de uma sessão anterior chega após reentrada", async () => {
    const oldAck = deferred<typeof preference>();
    const reread = deferred<{ items: (typeof preference)[] }>();
    let stored = preference;
    let saves = 0;
    let gets = 0;
    let holdRead = false;
    call.mockImplementation(async (name, args) => {
      if (name === "app_notification_preferences") {
        gets++;
        return holdRead ? reread.promise : { items: [stored] };
      }
      stored = { ...preference, in_app: Boolean(args?.p_in_app) };
      return ++saves === 1 ? oldAck.promise : stored;
    });
    const view = mount(<NotificationPreferences {...member} />);
    fireEvent.click(await screen.findByRole("switch"));
    await waitFor(() => expect(saves).toBe(1));
    view.update(null);
    view.cache.clear();
    view.update(<NotificationPreferences {...member} />);
    const toggle = await screen.findByRole("switch");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());

    const before = gets;
    holdRead = true;
    await act(async () => oldAck.resolve({ ...preference, in_app: false }));
    expect(gets).toBe(before + 1);
    expect(toggle).toBeChecked();
    await act(async () => reread.resolve({ items: [stored] }));
    expect(toggle).toBeChecked();
  });

  it("reinicia a consulta inicial de preferências se o ACK chegar enquanto ela está pendente", async () => {
    const ack = deferred<typeof preference>();
    const stale = deferred<{ items: (typeof preference)[] }>();
    const confirmed = { ...preference, in_app: false };
    let gets = 0;
    call.mockImplementation(async (name) => {
      if (name === "app_set_notification_preference") return ack.promise;
      if (++gets === 2) return stale.promise;
      return { items: [gets === 1 ? preference : confirmed] };
    });
    const view = mount(<NotificationPreferences {...member} />);
    fireEvent.click(await screen.findByRole("switch"));
    await waitFor(() => expect(call).toHaveBeenCalledWith("app_set_notification_preference", {
      p_event_key: preference.event_key, p_in_app: false,
    }));
    view.update(null);
    view.cache.clear();
    view.update(<NotificationPreferences {...member} />);
    await waitFor(() => expect(gets).toBe(2));
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    await act(async () => ack.resolve(confirmed));
    const toggle = await screen.findByRole("switch");
    expect(gets).toBe(3);
    expect(toggle).not.toBeChecked();
    await act(async () => stale.resolve({ items: [preference] }));
    expect(toggle).not.toBeChecked();
  });

  it("preserva aviso novo de mesmo titular durante o ACK coletivo de sessão anterior", async () => {
    const oldAck = deferred<{ unread_count: number }>();
    const reread = deferred<ReturnType<typeof notificationPage>>();
    const current = notificationPage([{ ...course, read_at: readAt }, material]);
    let reentered = false;
    let holdRead = false;
    let gets = 0;
    call.mockImplementation(async (name) => {
      if (name === "app_notifications_read") return oldAck.promise;
      gets++;
      return holdRead ? reread.promise : reentered ? current : notificationPage();
    });
    const surface = <><NotificationBell {...member} /><NotificationHistory {...member} /></>;
    const view = mount(surface);
    await screen.findByText(course.title);
    fireEvent.click(screen.getByRole("button", { name: "Marcar todas como lidas" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("app_notifications_read", { p_id: null }));
    view.update(null);
    view.cache.clear();
    reentered = true;
    view.update(<>{surface}</>);
    const newTitle = await screen.findByText(material.title);
    expect(newTitle.closest("li")).toHaveAttribute("data-unread", "true");

    const before = gets;
    holdRead = true;
    await act(async () => oldAck.resolve({ unread_count: 0 }));
    expect(gets).toBeGreaterThan(before);
    expect(newTitle.closest("li")).toHaveAttribute("data-unread", "true");
    expect(screen.getByRole("button", { name: "Notificações, 1 não lida" })).toBeVisible();
    await act(async () => reread.resolve(current));
    expect(newTitle.closest("li")).toHaveAttribute("data-unread", "true");
  });

  it("isola o cache por titular e apresenta e-mail disponível apenas para consulta", async () => {
    call.mockResolvedValueOnce({ items: [{ ...preference, email: true, email_available: true }] })
      .mockResolvedValue({ items: [] });
    const view = mount(<NotificationPreferences {...member} />);
    expect(await screen.findByRole("columnheader", { name: "E-mail" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Ativado" })).toBeVisible();
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    view.update(<NotificationPreferences key="outro" memberId="outro" />);
    expect(await screen.findByText("As preferências disponíveis para sua conta aparecerão aqui.")).toBeVisible();
    expect(screen.queryByText("Novo curso")).not.toBeInTheDocument();
  });
});
