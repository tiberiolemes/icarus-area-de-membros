import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { transport, url as demoUrl } from "../demo/transport";
import { client } from "./api";
import { AuthProvider } from "./auth";
import { RichEditor } from "./rich";
import * as ui from "./ui";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

const owner = "autor";
const route = "/admin/materiais?aba=lista";
const key = `icarus:draft:${owner}:${route}|Salvar|`;

function show(options: { owner?: string | null; excluded?: boolean; rich?: boolean; sensitive?: boolean } = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const { DraftOwner, Form } = ui;
  const form = <Form onSave={onSave} draft={options.excluded ? false : undefined}>
    <input aria-label="Título" name="title" defaultValue="Publicado" />
    <label><input type="checkbox" name="lesson_ids" value="aula-1" defaultChecked /> Aula 1</label>
    <label><input type="checkbox" name="lesson_ids" value="aula-2" /> Aula 2</label>
    <label>Estado <select name="status" defaultValue="draft">
      <option value="draft">Rascunho</option>
      <option value="published">Publicado</option>
    </select></label>
    {options.rich && <RichEditor initial="<p>Descrição salva</p>" />}
    {options.sensitive && <>
      <input aria-label="Senha" type="password" name="password" />
      <input aria-label="Senha visível" name="visible_password" data-sensitive />
      <div data-sensitive><input aria-label="Credencial" name="credential" /></div>
      <input aria-label="Filtro" name="filter" data-no-draft />
      <div data-no-draft><input aria-label="Busca" name="search" /></div>
      <input aria-label="Arquivo" name="file" type="file" />
    </>}
  </Form>;
  const renderResult = render(<MemoryRouter initialEntries={[route]}>
    {options.owner === null ? form : <DraftOwner.Provider value={options.owner ?? owner}>{form}</DraftOwner.Provider>}
  </MemoryRouter>);
  return { ...renderResult, onSave };
}

function seed(fields: [string, string][], savedAt = Date.now()) {
  localStorage.setItem(key, JSON.stringify({ savedAt, fields }));
}

function typeTitle(value: string) {
  fireEvent.input(screen.getByRole("textbox", { name: "Título" }), { target: { value } });
}

function tick(ms = 500) {
  act(() => vi.advanceTimersByTime(ms));
}

async function save() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Salvar$/ })));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 28, 14, 32));
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

it("digitar guarda o rascunho depois de meio segundo", () => {
  show();
  typeTitle("Primeiro texto");
  tick(300);
  typeTitle("Novo texto");
  tick(499);
  expect(localStorage.getItem(key)).toBeNull();
  tick(1);
  expect(JSON.parse(localStorage.getItem(key)!).fields).toContainEqual(["title", "Novo texto"]);
});

it("reabrir oferece recuperar e preenche texto, checkbox, select e texto rico", () => {
  seed([["title", "Não publicado"], ["lesson_ids", "aula-2"], ["status", "published"],
    ["description", '<p><strong>Recuperado</strong><img src="x" onerror="alert(1)"></p>']]);
  const { onSave } = show({ rich: true });
  expect(screen.getByText("Há um rascunho não salvo de hoje às 14:32.")).toBeVisible();
  expect(screen.getByLabelText("Título")).toHaveValue("Publicado");
  const inputs = vi.fn();
  screen.getByLabelText("Aula 2").closest("form")!.addEventListener("input", inputs);
  fireEvent.click(screen.getByRole("button", { name: "Recuperar rascunho" }));
  expect(screen.getByLabelText("Título")).toHaveValue("Não publicado");
  expect(screen.getByLabelText("Aula 1")).not.toBeChecked();
  expect(screen.getByLabelText("Aula 2")).toBeChecked();
  expect(screen.getByLabelText("Estado")).toHaveValue("published");
  const editor = screen.getByRole("textbox", { name: "Descrição" });
  expect(editor).toHaveTextContent("Recuperado");
  expect(editor.querySelector("img")).toBeNull();
  expect(inputs).toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
});

it("salvar com sucesso apaga o rascunho", async () => {
  seed([["title", "Novo texto"]]);
  const { onSave } = show();
  typeTitle("Outro texto");
  await save();
  tick();
  expect(onSave).toHaveBeenCalledOnce();
  expect(localStorage.getItem(key)).toBeNull();
});

it("Descartar apaga e esconde o aviso", () => {
  seed([["title", "Novo texto"]]);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
  expect(localStorage.getItem(key)).toBeNull();
  expect(screen.queryByRole("button", { name: "Recuperar rascunho" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Título")).toHaveValue("Publicado");
});

it("senha, campo sensível, data-no-draft e arquivo ficam de fora", () => {
  show({ sensitive: true });
  for (const label of ["Senha", "Senha visível", "Credencial", "Filtro", "Busca"]) {
    fireEvent.input(screen.getByLabelText(label), { target: { value: "dado reservado" } });
  }
  fireEvent.input(screen.getByLabelText("Arquivo"), {
    target: { files: [new File(["segredo"], "segredo.txt")] },
  });
  tick();
  expect(localStorage.getItem(key)).toBeNull();
  typeTitle("Título seguro");
  tick();
  expect(JSON.parse(localStorage.getItem(key)!).fields).toEqual(
    [["title", "Título seguro"], ["lesson_ids", "aula-1"], ["status", "draft"]],
  );
});

it("draft={false} não guarda nada", () => {
  show({ excluded: true });
  typeTitle("Texto reservado");
  tick();
  expect(localStorage.length).toBe(0);
});

it("sem DraftOwner não guarda nada", () => {
  show({ owner: null });
  typeTitle("Tela pública");
  tick();
  expect(localStorage.length).toBe(0);
});

it("rascunho com mais de 7 dias é ignorado e apagado", () => {
  seed([["title", "Rascunho vencido"]], Date.now() - 7 * 86400000 - 1);
  show();
  expect(screen.queryByRole("button", { name: "Recuperar rascunho" })).not.toBeInTheDocument();
  expect(localStorage.getItem(key)).toBeNull();
});

it("localStorage que lança erro não quebra o formulário", async () => {
  const blocked = () => { throw new DOMException("Bloqueado", "SecurityError"); };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
  const { onSave } = show();
  typeTitle("Pode salvar");
  tick();
  await save();
  expect(onSave).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Recuperar rascunho" })).not.toBeInTheDocument();
});

it("SIGNED_OUT apaga todos os rascunhos do Icarus", () => {
  const auth = vi.spyOn(client().auth, "onAuthStateChange").mockReturnValue({
    data: { subscription: { id: "auth-test", callback: vi.fn(), unsubscribe: vi.fn() } },
  });
  render(<AuthProvider><p>Autenticação</p></AuthProvider>);
  show();
  typeTitle("Rascunho com gravação pendente");
  seed([["title", "Rascunho privado"]]);
  localStorage.setItem("icarus:draft:outra-conta:outro-rascunho", "{}");
  localStorage.setItem("outro-site:rascunho", "Manter");
  act(() => { void auth.mock.calls[0][0]("SIGNED_OUT", null); });
  tick();
  expect(Object.keys(localStorage)).toEqual(["outro-site:rascunho"]);
});

it("a demo aceita o POST sem corpo que encerra a sessão do Supabase", async () => {
  const response = await transport(`${demoUrl}/auth/v1/logout?scope=global`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
  });
  expect(response.status).toBe(204);
});

it("recupera radio, seleção múltipla e campos controlados no estado do React", async () => {
  seed([["title", "Recuperado"], ["status", "published"], ["check", "on"],
    ["license", "paid"], ["tags", "a"], ["tags", "c"]]);
  const onSave = vi.fn().mockResolvedValue(undefined);
  function Controlled() {
    const [title, setTitle] = useState("Publicado");
    const [status, setStatus] = useState("draft");
    const [check, setCheck] = useState(false);
    return <ui.Form onSave={onSave}>
      <input name="title" aria-label="Título" value={title} onChange={(event) => setTitle(event.target.value)} />
      <select name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="draft">Rascunho</option>
        <option value="published">Publicado</option>
      </select>
      <input name="check" type="checkbox" checked={check} onChange={(event) => setCheck(event.target.checked)} />
      <input name="license" type="radio" value="free" defaultChecked />
      <input name="license" type="radio" value="paid" />
      <select name="tags" multiple defaultValue={["b"]}>
        <option value="a">A</option>
        <option value="b">B</option>
        <option value="c">C</option>
      </select>
    </ui.Form>;
  }
  render(<MemoryRouter initialEntries={[route]}><ui.DraftOwner.Provider value={owner}>
    <Controlled />
  </ui.DraftOwner.Provider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Recuperar rascunho" }));
  await save();
  expect([...onSave.mock.calls[0][0]]).toEqual([
    ["title", "Recuperado"], ["status", "published"], ["check", "on"],
    ["license", "paid"], ["tags", "a"], ["tags", "c"],
  ]);
});

it("reabre somente o rascunho do dono e do registro atuais", () => {
  const recordKey = `${key}material-1`;
  localStorage.setItem(recordKey, JSON.stringify({ savedAt: Date.now(), fields: [["title", "Primeiro"]] }));
  const form = (actor: string, record: string) => <MemoryRouter initialEntries={[route]}>
    <ui.DraftOwner.Provider value={actor}>
      <ui.Form draft={record} onSave={vi.fn()}><input name="title" /></ui.Form>
    </ui.DraftOwner.Provider>
  </MemoryRouter>;
  const { rerender } = render(form(owner, "material-2"));
  expect(screen.queryByRole("button", { name: "Recuperar rascunho" })).toBeNull();
  rerender(form("outra-conta", "material-1"));
  expect(screen.queryByRole("button", { name: "Recuperar rascunho" })).toBeNull();
  rerender(form(owner, "material-1"));
  expect(screen.getByRole("button", { name: "Recuperar rascunho" })).toBeVisible();
});

it("rascunho igual ao formulário não mostra aviso", () => {
  seed([["title", "Publicado"], ["lesson_ids", "aula-1"], ["status", "draft"]]);
  show();
  expect(screen.queryByRole("button", { name: "Recuperar rascunho" })).not.toBeInTheDocument();
});
