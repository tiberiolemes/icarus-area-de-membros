import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Onboarding } from "./access";
import { Settings } from "./settings";

const { rpc, invalidateQueries, updateUser, fixture } = vi.hoisted(() => ({
  rpc: vi.fn(),
  invalidateQueries: vi.fn(),
  updateUser: vi.fn(),
  fixture: {
    profile: {
      id: "fixture",
      full_name: "Aluna Teste",
      theme: "dark",
      company: {},
      bio: "",
      role: "member",
      plan_name: "Plano teste",
      onboarding_complete: false,
    },
    plans: [],
    settings: {
      onboarding: { company_required: true },
      onboarding_questions: [
        {
          id: "stage",
          key: "stage",
          active: true,
          order_index: 0,
          required: true,
          label: "Estágio do negócio",
          type: "select",
          options: ["MVP", "Expansão"],
        },
      ],
    },
  },
}));
vi.mock("../auth", () => ({ useBootstrap: () => ({ data: fixture }) }));
vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  rpc,
  cache: { invalidateQueries },
  client: () => ({ auth: { updateUser } }),
}));

function Destination() {
  const { pathname, search } = useLocation();
  return (
    <h1>
      {pathname}
      {search}
    </h1>
  );
}

function mount(path: string) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const app = () => (
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/app/configuracoes" element={<Settings />} />
          <Route path="*" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(app());
  return () => view.rerender(app());
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.profile.bio = "";
  rpc.mockImplementation(async (name: string) =>
    name === "app_notification_preferences" ? { items: [] } : undefined,
  );
});

it.each([
  ["/app/materiais?pasta=guias&token=fixture", "/app/materiais?pasta=guias"],
  ["/app/cursos/curso/modulo/~ff9bd951-cfc7-4722-aeaf-c29bcec9b84b", "/app/cursos/curso/modulo/~ff9bd951-cfc7-4722-aeaf-c29bcec9b84b"],
  ["//externo.invalid/app/materiais", "/app/cursos"],
])(
  "valida as perguntas do ambiente e retoma %s pelo fluxo interno",
  async (target, destination) => {
    mount("/onboarding?returnTo=" + encodeURIComponent(target));
    const name = screen.getByRole("textbox", { name: "Nome da empresa" });
    const stage = screen.getByRole("radio", { name: "Expansão" });
    const submit = screen.getByRole("button", { name: "Concluir e continuar" });
    expect(submit.closest(".student-onboarding")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    fireEvent.click(submit);
    expect((await screen.findByText(/Confira os campos/)).closest('[role="alert"]')).toBeVisible();
    expect(rpc).not.toHaveBeenCalled();
    expect(
      screen.getByText("Selecione uma opção para continuar."),
    ).toBeVisible();
    fireEvent.input(name, { target: { value: "Empresa Teste" } });
    fireEvent.click(stage);
    fireEvent.click(submit);
    const heading = await screen.findByText(destination, { selector: "h1" });
    expect(heading).toBeVisible();
    expect(heading).toHaveAccessibleName(destination);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("app_profile", {
      p_data: {
        full_name: "Aluna Teste",
        company: { name: "Empresa Teste", stage: "Expansão" },
        onboarding_complete: true,
      },
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["bootstrap"] });
  },
);

it("mantém as respostas e foca o erro de onboarding antes de permitir nova tentativa", async () => {
  rpc.mockRejectedValueOnce(new Error("Cadastro indisponível"));
  mount("/onboarding?returnTo=%2Fapp%2Fmateriais");
  const heading = screen.getByRole("heading", { name: "Complete seu perfil" });
  await waitFor(() => expect(heading).toHaveFocus());
  const name = screen.getByRole("textbox", { name: "Nome da empresa" });
  const stage = screen.getByRole("radio", { name: "Expansão" });
  const submit = screen.getByRole("button", { name: "Concluir e continuar" });

  fireEvent.input(name, { target: { value: "Empresa Teste" } });
  fireEvent.click(stage);
  fireEvent.click(submit);

  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent("Cadastro indisponível");
  await waitFor(() => expect(error).toHaveFocus());
  expect(name).toHaveValue("Empresa Teste");
  expect(stage).toBeChecked();
  expect(invalidateQueries).not.toHaveBeenCalled();

  fireEvent.click(submit);
  expect(await screen.findByRole("heading", { name: "/app/materiais" })).toBeVisible();
  expect(rpc.mock.calls).toHaveLength(2);
  expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
});

it("salva somente o tema escolhido e atualiza o bootstrap consumido pelo shell", async () => {
  mount("/app/configuracoes");
  fireEvent.change(screen.getByRole("combobox", { name: "Tema" }), {
    target: { value: "light" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar aparência" }));
  await waitFor(() =>
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["bootstrap"] }),
  );
  expect(rpc.mock.calls.filter(([name]) => name === "app_profile")).toEqual([
    ["app_profile", { p_data: { theme: "light" } }],
  ]);
});

it("atualiza a bio intocada após refetch e salva apenas o campo editado", async () => {
  const reload = mount("/app/configuracoes");
  const bio = screen.getByRole("textbox", { name: "Bio" });
  expect(bio).toHaveValue("");
  fixture.profile.bio = "Bio salva em outra sessão";
  reload();
  expect(bio).toHaveValue(fixture.profile.bio);
  fireEvent.input(screen.getByRole("textbox", { name: "Nome completo" }), {
    target: { value: "Nome atualizado" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("app_profile", {
    p_data: { full_name: "Nome atualizado" },
  }));
});

it("só permite salvar o perfil quando o formulário tem alterações", async () => {
  mount("/app/configuracoes");
  const bio = screen.getByRole("textbox", { name: "Bio" });
  const save = screen.getByRole("button", { name: "Salvar perfil" });
  expect(bio).toBeEnabled();
  expect(save).toBeDisabled();
  fireEvent.submit(save.closest("form")!);
  expect(screen.queryByText("Salvo com sucesso.")).not.toBeInTheDocument();
  expect(rpc).not.toHaveBeenCalledWith("app_profile", expect.anything());

  fireEvent.input(bio, { target: { value: "Nova bio" } });
  expect(save).toBeEnabled();
  fireEvent.input(bio, { target: { value: "" } });
  expect(save).toBeDisabled();

  fireEvent.input(bio, { target: { value: "Bio confirmada" } });
  fireEvent.click(save);
  expect(await screen.findByText("Salvo com sucesso.")).toBeVisible();
  expect(rpc).toHaveBeenCalledWith("app_profile", { p_data: { bio: "Bio confirmada" } });
  expect(save).toBeDisabled();
});

it("mantém uma remoção explícita da bio após refetch e recusa do envio", async () => {
  fixture.profile.bio = "Bio anterior";
  const reload = mount("/app/configuracoes");
  const bio = screen.getByRole("textbox", { name: "Bio" });
  fireEvent.input(bio, { target: { value: "" } });
  fixture.profile.bio = "Bio nova em outra sessão";
  reload();
  expect(bio).toHaveValue("");
  rpc.mockImplementation(async (name: string) => {
    if (name === "app_profile") throw new Error("Perfil recusado");
    return { items: [] };
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Perfil recusado");
  expect(rpc).toHaveBeenCalledWith("app_profile", { p_data: { bio: "" } });
  expect(bio).toHaveValue("");
});

it("limpa os campos de senha após falha sem gravar credenciais no storage", async () => {
  mount("/app/configuracoes?aba=seguranca");
  updateUser.mockResolvedValueOnce({
    error: new Error("Solicitação recusada"),
  });
  const password = screen.getByLabelText("Nova senha");
  const confirmation = screen.getByLabelText("Confirme a nova senha");
  const syntheticPassword = "senha-sintetica-teste";
  const storage = vi.spyOn(Storage.prototype, "setItem");
  fireEvent.input(password, { target: { value: syntheticPassword } });
  fireEvent.input(confirmation, { target: { value: syntheticPassword } });
  fireEvent.click(screen.getByRole("button", { name: "Atualizar senha" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(updateUser).toHaveBeenCalledExactlyOnceWith({
    password: syntheticPassword,
  });
  expect(password).toHaveValue("");
  expect(confirmation).toHaveValue("");
  expect(storage).not.toHaveBeenCalled();
});

it("salva uma preferência pelo contrato integrado e lê o estado confirmado", async () => {
  let item = {
    event_key: "certificate_issued",
    group: "Progresso",
    label: "Certificado disponível",
    in_app: true,
    email: false,
    email_available: false,
  };
  rpc.mockImplementation(
    async (name: string, params?: { p_in_app: boolean }) => {
      if (name === "app_notification_preferences") return { items: [item] };
      if (name === "app_set_notification_preference" && params)
        return (item = { ...item, in_app: params.p_in_app });
      throw new Error("RPC inesperado na fixture");
    },
  );
  mount("/app/configuracoes");
  fireEvent.click(screen.getByRole("link", { name: "Notificações" }));
  expect(screen.getByRole("link", { name: "Notificações" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const toggle = await screen.findByRole("switch", {
    name: "Certificado disponível na plataforma",
  });
  expect(toggle).toHaveAttribute("aria-checked", "true");
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  expect(rpc).toHaveBeenCalledWith("app_set_notification_preference", {
    p_event_key: "certificate_issued",
    p_in_app: false,
  });
  expect(
    screen.queryByRole("columnheader", { name: "E-mail" }),
  ).not.toBeInTheDocument();
});

it("oferece sair e usar outra conta no onboarding obrigatório", async () => {
  mount("/onboarding");
  expect(await screen.findByRole("button", { name: "Sair e usar outra conta" })).toBeVisible();
});
