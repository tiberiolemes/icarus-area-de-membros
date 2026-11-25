import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { cache, type Post } from "./api";
import { Community, PostPage } from "./pages/community";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58621");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

const topic: Post = {
  id: "publicacao",
  space_id: "estudos",
  title: "Relato de demonstração",
  body: "Uma discussão com dados sintéticos.",
  author_name: "Pessoa Teste",
  author_id: "pessoa",
  author_role: "member",
  plan_name: "",
  status: "approved",
  created_at: "2026-11-23T12:00:00Z",
  vote_count: 1,
  voted: false,
  reply_count: 0,
  can_edit: false,
};
const spaces = [{ id: "estudos", name: "Estudos", can_post: false }];
const feed = { spaces, items: [topic], total: 21, page: 1, page_size: 20 };

afterEach(() => {
  cleanup();
  cache.clear();
  vi.unstubAllGlobals();
});

function mount(
  handler: (rpc: string, args: Record<string, unknown>) => Response,
) {
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input).split("/").at(-1)!, JSON.parse(String(init?.body))),
  );
  vi.stubGlobal("fetch", transport);
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={["/app/comunidade?q=relato&space=estudos"]}>
        <Routes>
          <Route path="/app/comunidade" element={<Community />} />
          <Route path="/app/comunidade/:post" element={<PostPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return transport;
}

it("preserva os filtros ao abrir e voltar de uma discussão de espaço somente leitura", async () => {
  mount((rpc) =>
    rpc === "app_post"
      ? Response.json({ post: topic, replies: [], can_moderate: false })
      : Response.json({
          ...feed,
          spaces: [{ ...spaces[0], description: "Estudos compartilhados." }],
        }),
  );
  const title = await screen.findByRole("link", { name: topic.title });
  expect(screen.getByRole("link", { name: "Estudos" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  expect(
    screen.getByText("Você tem acesso de leitura a este espaço."),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Escrever publicação" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Estudos compartilhados.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Consultar ranking" })).toHaveAttribute(
    "href",
    "/app/ranking",
  );
  expect(
    screen.getByRole("link", { name: "Como publicar na comunidade" }),
  ).toHaveAttribute("href", "/ajuda/comunidade");

  fireEvent.click(title);
  expect(
    await screen.findByText("Ainda não há respostas para esta publicação."),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "Voltar à comunidade" }),
  ).toHaveAttribute("href", "/app/comunidade?q=relato&space=estudos");
  expect(
    await screen.findByRole("link", { name: "Ver publicações do espaço" }),
  ).toHaveAttribute("href", "/app/comunidade?space=estudos");
});

it("omite o espaço sem acesso e exibe o anexo do feed sem solicitar o arquivo", async () => {
  const transport = mount((rpc, args) => {
    if (rpc === "app_post") {
      return Response.json({ post: topic, replies: [], can_moderate: false });
    }
    if (args.p_space_id) {
      return Response.json({
        ...feed,
        items: [{ ...topic, image_id: "imagem-privada" }],
      });
    }
    return Response.json({ ...feed, spaces: [] });
  });
  const title = await screen.findByRole("link", { name: topic.title });
  expect(screen.getByText("Imagem na publicação")).toBeInTheDocument();
  expect(transport.mock.calls).toHaveLength(1);

  fireEvent.click(title);
  await screen.findByRole("heading", { name: topic.title });
  await waitFor(() =>
    expect(cache.getQueryState(["app_feed", {}])?.status).toBe("success"),
  );
  expect(
    screen.queryByRole("link", { name: "Ver publicações do espaço" }),
  ).not.toBeInTheDocument();
});

it("busca discussões pelo formulário com ícone e mantém o espaço ativo", async () => {
  const transport = mount(() => Response.json(feed));
  const search = screen.getByRole("searchbox", { name: "Buscar discussões" });
  await screen.findByRole("link", { name: "Estudos" });
  expect(search).toHaveValue("relato");

  fireEvent.change(search, { target: { value: " nova busca " } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar discussões" }));

  await waitFor(() => {
    const requestBody = transport.mock.calls.at(-1)?.[1]?.body;
    expect(JSON.parse(String(requestBody))).toEqual({
      p_space_id: "estudos",
      p_query: "nova busca",
      p_page: 1,
    });
  });
  expect(await screen.findByRole("link", { name: "Estudos" })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

it("nomeia o link de respostas e oferece voto apenas em publicação aprovada", async () => {
  mount(() =>
    Response.json({
      ...feed,
      items: [topic, { ...topic, id: "pendente", status: "pending", reply_count: 1 }],
    }),
  );

  expect(
    await screen.findByRole("link", { name: "0 respostas" }),
  ).toHaveAttribute("href", "/app/comunidade/publicacao?q=relato&space=estudos");
  expect(screen.getByRole("link", { name: "1 resposta" })).toHaveAttribute(
    "href",
    "/app/comunidade/pendente?q=relato&space=estudos",
  );
  expect(screen.getByText("Enviado para revisão")).toBeVisible();
  expect(screen.getAllByRole("button", { name: /Votar\s*1\s*voto/ })).toHaveLength(1);
});

it("mantém a primeira página após falha e permite tentar a próxima novamente", async () => {
  let attempts = 0;
  mount((_rpc, args) => {
    if (args.p_page === 1) return Response.json(feed);
    if (++attempts === 1) {
      return Response.json(
        { code: "P0001", message: "Falha de demonstração." },
        { status: 400 },
      );
    }
    return Response.json({
      ...feed,
      page: 2,
      items: [{ ...topic, id: "segunda", title: "Segunda discussão" }],
    });
  });

  fireEvent.click(
    await screen.findByRole("button", { name: "Carregar mais discussões" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Falha de demonstração.",
  );
  expect(screen.getByRole("link", { name: topic.title })).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Tentar carregar mais" }));
  expect(
    await screen.findByRole("link", { name: "Segunda discussão" }),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("mostra bloqueio devolvido pelo servidor e permite voltar para todos os espaços", async () => {
  mount((_rpc, args) =>
    args.p_space_id
      ? Response.json(
          { code: "P0001", message: "Espaço indisponível." },
          { status: 400 },
        )
      : Response.json({ ...feed, items: [], total: 0 }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Espaço indisponível.",
  );
  expect(
    screen.queryByRole("link", { name: "Escrever publicação" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Todos os espaços" }));
  expect(
    await screen.findByText(
      "Nenhuma publicação encontrada. Tente outra busca.",
    ),
  ).toBeVisible();
});

it("só exibe o anexo da discussão após receber a URL privada", async () => {
  let authorized = false;
  const transport = mount((rpc) => {
    if (rpc === "app_post")
      return Response.json({
        post: { ...topic, image_id: "anexo", image_path: "/interno/foto.png" },
        replies: [],
        can_moderate: false,
      });
    if (rpc === "media")
      return authorized
        ? Response.json({ url: "https://media.example.test/anexo-assinado" })
        : Response.json({ message: "Acesso ao anexo recusado." }, { status: 403 });
    return Response.json(feed);
  });

  fireEvent.click(await screen.findByRole("link", { name: topic.title }));
  expect(await screen.findByText("Acesso ao anexo recusado.")).toBeVisible();
  expect(
    screen.queryByRole("img", { name: "Imagem anexada à publicação" }),
  ).not.toBeInTheDocument();

  authorized = true;
  fireEvent.click(screen.getByRole("button", { name: "Carregar imagem" }));
  expect(
    await screen.findByRole("img", { name: "Imagem anexada à publicação" }),
  ).toHaveAttribute("src", "https://media.example.test/anexo-assinado");
  expect(
    transport.mock.calls
      .filter(([request]) => String(request).endsWith("/functions/v1/media"))
      .map(([, init]) => JSON.parse(String(init?.body))),
  ).toEqual([
    { kind: "post-image", id: "anexo" },
    { kind: "post-image", id: "anexo" },
  ]);
});

it("envia resposta por AJAX, mantém o texto na falha e confirma o envio para revisão", async () => {
  let attempt = 0;
  const body = '<img src=x onerror="alert(1)">';
  const transport = mount((rpc) => {
    if (rpc === "app_post") {
      const replies =
        attempt === 2
          ? [{ ...topic, id: "resposta", body, status: "pending" }]
          : [];
      return Response.json({ post: topic, replies, can_moderate: false });
    }
    if (rpc === "app_reply") {
      attempt += 1;
      return attempt === 1
        ? Response.json(
            { code: "P0001", message: "Não foi possível enviar." },
            { status: 400 },
          )
        : Response.json({ id: "resposta", status: "pending" });
    }
    return Response.json(feed);
  });
  fireEvent.click(await screen.findByRole("link", { name: topic.title }));
  const input = await screen.findByRole("textbox", {
    name: "Escreva uma resposta",
  });
  fireEvent.change(input, { target: { value: body } });
  const submit = screen.getByRole("button", {
    name: "Enviar resposta para revisão",
  });
  fireEvent.click(submit);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível enviar.",
  );
  expect(input).toHaveValue(body);
  fireEvent.click(submit);

  const rendered = await screen.findByText(body);
  expect(rendered.querySelector("img")).toBeNull();
  expect(
    await screen.findByText("Resposta enviada para revisão."),
  ).toBeVisible();
  expect(input).toHaveValue("");
  expect(
    transport.mock.calls.filter(([request]) =>
      String(request).endsWith("/app_reply"),
    ),
  ).toHaveLength(2);
});

it("mostra a badge Admin dourada com coroa para o autor admin e mantém a do plano para o membro", async () => {
  const admin = { ...topic, id: "admin-post", title: "Aviso da equipe", author_name: "Pessoa Admin", author_id: "admin", author_role: "admin", plan_name: "Membro Pro" };
  const member = { ...topic, plan_name: "Membro Pro" };
  mount(() => Response.json({ ...feed, items: [admin, member] }));
  await screen.findByRole("link", { name: admin.title });
  const [adminByline, memberByline] = Array.from(document.querySelectorAll<HTMLElement>(".community-byline"));
  const badge = adminByline.querySelector(".badge.admin-badge");
  expect(badge).toHaveTextContent(/^Admin$/);
  expect(badge!.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(adminByline).not.toHaveTextContent("Administração");
  expect(adminByline).not.toHaveTextContent("Membro Pro");
  expect(memberByline.querySelector(".badge")).toHaveTextContent(/^Membro Pro$/);
  expect(memberByline.querySelector(".admin-badge")).toBeNull();
});
