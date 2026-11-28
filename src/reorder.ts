/** Tira o item da posição `from` e o põe em `to`, numa cópia. Índice igual ou fora da lista mantém a ordem. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
