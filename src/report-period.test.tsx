import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { periodArgs, ReportPeriodPicker, type ReportPeriod } from "./report-period";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2024-03-01T02:30:00Z")); // Ainda é 29/02 em Brasília.
  const changed = vi.fn();
  function Filter() {
    const [value, setValue] = useState<ReportPeriod>({ id: "current" });
    return <ReportPeriodPicker tour="fixture" value={value} onChange={next => {
      changed(periodArgs(next));
      setValue(next);
    }} />;
  }
  render(<Filter />);
  return changed;
}

it("aplica atalhos na hora e conta sete dias civis no fim de fevereiro bissexto", () => {
  const changed = mount();
  fireEvent.click(screen.getByRole("button", { name: "Período: Mês atual" }));
  expect(screen.getByRole("status")).toHaveTextContent("01/02/2024 a 29/02/2024 · 29 dias");
  fireEvent.click(screen.getByRole("button", { name: "Últimos 7 dias" }));
  expect(changed).toHaveBeenCalledExactlyOnceWith({ p_period: "7d" });
  fireEvent.click(screen.getByRole("button", { name: "Período: Últimos 7 dias" }));
  expect(screen.getByRole("status")).toHaveTextContent("23/02/2024 a 29/02/2024 · 7 dias");
  expect(screen.getByRole("button", { name: "Ir ao próximo mês" })).toBeDisabled();
});

it("seleção por dia aguarda duas pontas, aceita a ordem inversa e descarta o rascunho cancelado", () => {
  const changed = mount();
  const trigger = screen.getByRole("button", { name: "Período: Mês atual" });
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  const pickDay = (iso: string, label: string) => {
    const button = dialog.querySelector(`button[data-day="${iso}"]`);
    expect(button).toHaveAccessibleName(label);
    fireEvent.click(button!);
  };
  const apply = within(dialog).getByRole("button", { name: "Aplicar" });
  pickDay("2024-02-15", "15/02/2024");
  expect(apply).toBeDisabled();
  pickDay("2024-02-12", "12/02/2024");
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(apply);
  expect(changed).toHaveBeenCalledExactlyOnceWith({ p_period: "custom", p_from: "2024-02-12", p_through: "2024-02-15" });
  expect(trigger).toHaveAccessibleName("Período: 12/02/2024 a 15/02/2024");
  const open = () => fireEvent.click(trigger);
  open();
  fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "29022024" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  open();
  expect(screen.getByLabelText("Data final")).toHaveValue("15/02/2024");
  expect(changed).toHaveBeenCalledTimes(1);
});

it("recusa datas futuras, inexistentes e invertidas e permite um único dia digitado", () => {
  const changed = mount();
  fireEvent.click(screen.getByRole("button", { name: "Período: Mês atual" }));
  const dialog = within(screen.getByRole("dialog"));
  const end = dialog.getByLabelText("Data final"), apply = dialog.getByRole("button", { name: "Aplicar" });
  for (const value of ["31022024", "01032024", "31012024", "2"]) {
    fireEvent.change(end, { target: { value } });
    expect(apply).toBeDisabled();
  }
  fireEvent.change(end, { target: { value: "01022024" } });
  expect(dialog.getByRole("status")).toHaveTextContent("· 1 dia");
  fireEvent.click(apply);
  expect(changed).toHaveBeenCalledExactlyOnceWith({ p_period: "custom", p_from: "2024-02-01", p_through: "2024-02-01" });
});
