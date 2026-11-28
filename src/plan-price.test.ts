import { expect, it } from "vitest";
import { installmentOffer } from "./plan-price";

it("divide o preço em 12 e arredonda para cima no centavo", () => {
  expect(installmentOffer(58800)).toEqual({ count: 12, installmentCents: 4900 });
  expect(installmentOffer(10000)).toEqual({ count: 12, installmentCents: 834 });
});

it("plano gratuito não tem parcela", () => {
  expect(installmentOffer(0)).toBeNull();
});
