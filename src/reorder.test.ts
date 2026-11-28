import { expect, it } from "vitest";
import { moveItem } from "./reorder";

it("leva o item para a nova posição e devolve uma cópia", () => {
  const items = ["a", "b", "c"];
  expect(moveItem(items, 2, 0)).toEqual(["c", "a", "b"]);
  expect(moveItem(items, 0, 2)).toEqual(["b", "c", "a"]);
  expect(items).toEqual(["a", "b", "c"]);
});

it("mesma posição ou índice fora da lista mantém a ordem", () => {
  const items = ["a", "b", "c"];
  expect(moveItem(items, 1, 1)).toEqual(items);
  expect(moveItem(items, 5, 0)).toEqual(items);
  expect(moveItem(items, 0, -1)).toEqual(items);
  expect(moveItem(items, 1, 1)).not.toBe(items);
});
