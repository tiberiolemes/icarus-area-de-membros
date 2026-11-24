import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { RouteFocus } from "./ui";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderDelayedHeading() {
  const scroll = vi.fn();
  vi.stubGlobal("scrollTo", scroll);
  function Fixture() {
    const [ready, setReady] = useState(false);
    return (
      <MemoryRouter>
        <button onClick={() => setReady(true)}>Concluir carregamento</button>
        <input aria-label="Outro controle" />
        <main id="main">
          <RouteFocus />
          <Routes>
            <Route path="/" element={<><h1 tabIndex={-1}>Histórico</h1><Link to="/aula">Abrir aula</Link></>} />
            <Route path="/aula" element={ready ? <h1 tabIndex={-1}>Aula carregada</h1> : <p>Carregando aula</p>} />
          </Routes>
        </main>
      </MemoryRouter>
    );
  }
  render(<Fixture />);
  fireEvent.click(screen.getByRole("link", { name: "Abrir aula" }));
  expect(screen.getByText("Carregando aula")).toBeVisible();
  scroll.mockClear();
  return scroll;
}

it("foca o H1 que monta depois da navegação sem restaurar a rolagem novamente", async () => {
  const scroll = renderDelayedHeading();
  fireEvent.click(screen.getByRole("button", { name: "Concluir carregamento" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Aula carregada" })).toHaveFocus());
  expect(scroll).not.toHaveBeenCalled();
});

it("abandona o foco tardio se a pessoa já seguiu para outro controle", async () => {
  renderDelayedHeading();
  const input = screen.getByRole("textbox", { name: "Outro controle" });
  input.focus();
  fireEvent.change(input, { target: { value: "Continuo escrevendo" } });
  fireEvent.click(screen.getByRole("button", { name: "Concluir carregamento" }));
  expect(await screen.findByRole("heading", { name: "Aula carregada" })).toBeVisible();
  expect(input).toHaveFocus();
  expect(input).toHaveValue("Continuo escrevendo");
});
