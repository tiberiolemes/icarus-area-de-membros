// O checkout aceita até 12x; arredondar para cima evita prometer parcela menor do que a cobrada.
export function installmentOffer(priceCents: number): { count: 12; installmentCents: number } | null {
  return priceCents > 0 ? { count: 12, installmentCents: Math.ceil(priceCents / 12) } : null;
}
