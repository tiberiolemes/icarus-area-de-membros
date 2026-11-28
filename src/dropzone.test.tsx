import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Dropzone } from "./dropzone";

const hint = "PDF ou Markdown · máximo 5 MB";
const pdf = new File(["%PDF-1.7"], "apostila.pdf", { type: "application/pdf" });
const png = new File([new Uint8Array([137, 80, 78, 71])], "foto.png", { type: "image/png" });

afterEach(() => vi.unstubAllGlobals());

function mount(props: Partial<Parameters<typeof Dropzone>[0]> = {}) {
  const onFile = vi.fn();
  render(<Dropzone label="Arquivo do material" hint={hint} onFile={onFile} {...props} />);
  return { onFile, zone: screen.getByRole("group", { name: "Arquivo do material" }) };
}

it("mostra o modelo com título, ou, Selecionar arquivo e a dica", () => {
  mount();
  expect(screen.getByText("Arraste o arquivo aqui")).toBeInTheDocument();
  expect(screen.getByText("ou")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Selecionar arquivo" })).toHaveAccessibleDescription(hint);
  expect(screen.getByLabelText("Arquivo do material", { selector: "input" })).toHaveAttribute("type", "file");
});

it("soltar um arquivo chama onFile com ele", () => {
  const { onFile, zone } = mount();
  fireEvent.drop(zone, { dataTransfer: { files: [pdf] } });
  expect(onFile).toHaveBeenCalledExactlyOnceWith(pdf);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("soltar dois arquivos usa o primeiro e avisa", () => {
  // O jsdom não tem DataTransfer; o falso guarda o que entra, e o espião mostra o que o campo do formulário recebe.
  vi.stubGlobal("DataTransfer", class { files: File[] = []; items = { add: (file: File) => this.files.push(file) }; });
  const { onFile, zone } = mount({ name: "file" });
  const received = vi.fn();
  Object.defineProperty(screen.getByLabelText("Arquivo do material", { selector: "input" }), "files", { set: received, configurable: true });
  fireEvent.drop(zone, { dataTransfer: { files: [pdf, png] } });
  expect(onFile).toHaveBeenCalledExactlyOnceWith(pdf);
  expect(received).toHaveBeenCalledExactlyOnceWith([pdf]);
  expect(screen.getByText("Envie um arquivo por vez.")).toBeInTheDocument();
});

it("tipo fora do accept é recusado", () => {
  const { onFile, zone } = mount({ accept: "application/pdf" });
  fireEvent.drop(zone, { dataTransfer: { files: [png] } });
  expect(onFile).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Tipo de arquivo não aceito aqui.");
});

it("accept por extensão aceita o .md e recusa outra extensão", () => {
  const { onFile, zone } = mount({ accept: ".md" });
  const notes = new File(["# Roteiro"], "Roteiro.MD", { type: "text/markdown" });
  fireEvent.drop(zone, { dataTransfer: { files: [notes] } });
  expect(onFile).toHaveBeenCalledExactlyOnceWith(notes);
  fireEvent.drop(zone, { dataTransfer: { files: [new File(["texto"], "roteiro.txt", { type: "text/plain" })] } });
  expect(onFile).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toHaveTextContent("Tipo de arquivo não aceito aqui.");
});

it("accept com curinga aceita qualquer imagem e recusa PDF", () => {
  const { onFile, zone } = mount({ accept: "image/*" });
  fireEvent.drop(zone, { dataTransfer: { files: [png] } });
  expect(onFile).toHaveBeenCalledExactlyOnceWith(png);
  fireEvent.drop(zone, { dataTransfer: { files: [pdf] } });
  expect(onFile).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toHaveTextContent("Tipo de arquivo não aceito aqui.");
});

it("desabilitado ignora o arquivo solto", () => {
  const { onFile, zone } = mount({ disabled: true });
  fireEvent.drop(zone, { dataTransfer: { files: [pdf] } });
  expect(onFile).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Selecionar arquivo" })).toBeDisabled();
});

it("arrastar por cima marca a zona e sair desmarca", () => {
  const { zone } = mount();
  fireEvent.dragOver(zone);
  expect(zone).toHaveClass("is-dragging");
  fireEvent.dragLeave(zone);
  expect(zone).not.toHaveClass("is-dragging");
});

it("arquivo escolhido mostra o nome, o tamanho e troca o botão para Trocar arquivo", () => {
  mount({ fileName: "apostila.pdf", fileSize: 1_572_864 });
  expect(screen.getByText("apostila.pdf").parentElement).toHaveTextContent("apostila.pdf · 1,5 MB");
  expect(screen.getByRole("button", { name: "Trocar arquivo" })).toBeInTheDocument();
});
