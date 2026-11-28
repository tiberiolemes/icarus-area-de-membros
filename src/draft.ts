type Fields = [string, string][];
export type SavedDraft = { savedAt: number; fields: Fields };

export const draftPrefix = "icarus:draft:";
export const draftStorageKey = (owner: string, scope: string) => `${draftPrefix}${owner}:${scope}`;
const lifetime = 7 * 86_400_000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function readDraft(key: string): SavedDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const draft = JSON.parse(raw);
    if (!draft || !Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > lifetime ||
      !Array.isArray(draft.fields) || !draft.fields.every((pair: unknown) =>
        Array.isArray(pair) && pair.length === 2 && pair.every((value) => typeof value === "string"))) {
      clearDraft(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, fields: Fields): void {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), fields }));
  } catch { /* A edição continua disponível no formulário. */ }
}

export function cancelDraftWrite(key: string): void {
  clearTimeout(timers.get(key));
  timers.delete(key);
}

export function scheduleDraftWrite(key: string, read: () => Fields, onWrite: () => void): void {
  cancelDraftWrite(key);
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    writeDraft(key, read());
    onWrite();
  }, 500));
}

export function clearDraft(key: string): void {
  cancelDraftWrite(key);
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      window[storageName].removeItem(key);
    } catch { /* O armazenamento pode estar bloqueado. */ }
  }
}

export function clearAllDrafts(): void {
  for (const key of timers.keys()) cancelDraftWrite(key);
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[storageName];
      for (const key of Object.keys(storage)) {
        if (key.startsWith(draftPrefix)) storage.removeItem(key);
      }
    } catch { /* O armazenamento pode estar bloqueado. */ }
  }
}

type DraftField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function isDraftField(field: EventTarget | null): field is DraftField {
  return (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) &&
    !!field.name && !field.matches(":disabled") && !field.closest("[data-sensitive], [data-no-draft]") &&
    !["file", "password", "button", "reset", "submit", "image"].includes(field.type);
}

function choices(field: DraftField): field is HTMLInputElement & { type: "checkbox" | "radio" } {
  return field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio");
}

export function draftFields(form: HTMLFormElement): Fields {
  return Array.from(form.elements).filter(isDraftField).flatMap((field): Fields => {
    if (choices(field) && !field.checked) return [];
    if (field instanceof HTMLSelectElement)
      return Array.from(field.selectedOptions, (option) => [field.name, option.value]);
    return [[field.name, field.value]];
  });
}

export function restoreDraft(form: HTMLFormElement, fields: Fields): void {
  const values = new Map<string, string[]>();
  for (const [name, value] of fields) {
    const group = values.get(name);
    if (group) group.push(value);
    else values.set(name, [value]);
  }
  for (const field of Array.from(form.elements).filter(isDraftField)) {
    if (field instanceof HTMLInputElement && field.type === "hidden" && field.readOnly) continue;
    const stored = values.get(field.name) ?? [];
    if (choices(field)) {
      const checked = stored.includes(field.value);
      if (field.checked !== checked) {
        // O clique também atualiza checkboxes e rádios controlados pelo React.
        if (field.type === "checkbox" || checked) field.click();
        else field.checked = false;
      }
    } else if (field instanceof HTMLSelectElement) {
      if (field.multiple) {
        for (const option of field.options) option.selected = stored.includes(option.value);
      } else if (stored.length && Array.from(field.options).some((option) => option.value === stored[0])) {
        field.value = stored[0];
      } else continue;
      field.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const value = stored.shift();
      if (value === undefined) continue;
      const prototype = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      // O setter nativo permite que o onChange do React detecte o preenchimento.
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
    }
    field.dispatchEvent(new CustomEvent("draftrestore", { detail: field.value }));
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function draftDate(savedAt: number): string {
  const date = new Date(savedAt);
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `de hoje às ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `de ontem às ${time}`;
  return `de ${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${time}`;
}
