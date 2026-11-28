import { createClient } from "@supabase/supabase-js";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { clearAllDrafts } from "./draft";

const demo = import.meta.env.MODE === "demo" ? await import("../demo/transport") : null;
export const demoAccounts = demo?.demoAccounts;
const connectionUrl = demo?.url ?? (import.meta.env.MODE === "demo" ? undefined : import.meta.env.VITE_SUPABASE_URL);
const connectionKey = demo?.key ?? (import.meta.env.MODE === "demo" ? undefined : import.meta.env.VITE_SUPABASE_ANON_KEY);
export const isRecoveryLink =
  new URLSearchParams(location.hash.slice(1)).get("type") === "recovery";
const configured = (() => {
  try {
    if (!connectionUrl || !connectionKey)
      throw new Error();
    const url = new URL(connectionUrl);
    if (
      url.username ||
      url.password ||
      !["https:", "http:"].includes(url.protocol)
    )
      throw new Error();
    return createClient(url.href, connectionKey, {
      global: demo ? { fetch: demo.transport } : undefined,
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: !demo,
        ...(demo ? { storage: sessionStorage, storageKey: "icarus-static-demo-auth" } : {}),
      },
    });
  } catch {
    return null;
  }
})();
export const supabase = configured;
export const configurationError = configured
  ? null
  : "Conexão não configurada. Defina uma URL válida e a chave pública do Supabase para esta instalação.";
export const cache = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false, networkMode: demo ? "always" : "online" },
    mutations: { retry: false, networkMode: demo ? "always" : "online" },
  },
});
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export function client() {
  if (!supabase) throw new AppError(configurationError!);
  return supabase;
}
export async function signOut() {
  const { error } = await client().auth.signOut();
  if (error)
    throw new AppError(
      "Não foi possível encerrar sua sessão no servidor. Tente novamente.",
    );
  clearAllDrafts();
  cache.clear();
}
export function uploadStorage(signal: AbortSignal) {
  return createClient(connectionUrl, connectionKey, {
    accessToken: async () => {
      const { data, error } = await client().auth.getSession();
      if (error) throw error;
      return data.session?.access_token ?? null;
    },
    global: { fetch: (input, init) => (demo?.transport ?? fetch)(input, { ...init, signal }) },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }).storage;
}
export function errorMessage(error: unknown): string {
  const e = error as {
    message?: string;
    code?: string;
    status?: number;
    name?: string;
  };
  if (!navigator.onLine || /fetch|network/i.test(e?.message ?? ""))
    return "Sem conexão com o servidor. Seu texto continua nesta tela. Reconecte e tente novamente.";
  // Códigos do Auth antes dos ramos por status: otp_expired, por exemplo, chega com 403.
  if (e?.code && authMessages[e.code]) return authMessages[e.code];
  if (e?.status === 401 || ["PGRST301", "PGRST303"].includes(e?.code ?? ""))
    return "Sua sessão expirou. Entre novamente para continuar.";
  if (
    /^Functions(Http|Relay|Fetch)Error$/.test(e?.name ?? "") ||
    /Edge Function returned a non-2xx status code|Relay Error invoking/i.test(
      e?.message ?? "",
    )
  )
    return "Serviço indisponível nesta instalação. Tente novamente ou procure o suporte.";
  if (e?.code === "42501" || e?.status === 403)
    return "Você não tem permissão para esta ação ou seu acesso expirou.";
  if (e?.code === "23505")
    return "Já existe um registro com esses dados. Revise e tente novamente.";
  if (/Invalid login credentials/i.test(e?.message ?? ""))
    return "Email ou senha inválidos.";
  if (/rate limit|too many/i.test(e?.message ?? ""))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (e?.name === "AuthSessionMissingError")
    return "Sua sessão não foi encontrada. Abra o link mais recente enviado por email ou entre novamente.";
  // PGRST000 a PGRST003: o PostgREST não alcançou o banco; é queda passageira, não recurso ausente.
  if (/^PGRST00[0-3]$/.test(e?.code ?? ""))
    return "O servidor não respondeu agora. Tente novamente em instantes.";
  if (
    e?.code?.startsWith("PGRST") ||
    /relation |column |SQL|syntax|function public\./i.test(e?.message ?? "")
  )
    return "Esta operação está indisponível nesta instalação. Tente novamente ou procure o suporte.";
  // O Auth responde em inglês: sem tradução conhecida, uma frase neutra em português.
  if (e?.name?.startsWith("Auth"))
    return "Não foi possível concluir o acesso. Tente novamente.";
  return e?.message || "Não foi possível concluir. Tente novamente.";
}
const authMessages: Record<string, string> = {
  weak_password: "A senha não atende aos requisitos de segurança. Use uma senha mais longa, com letras maiúsculas, minúsculas, números e símbolos.",
  same_password: "A nova senha precisa ser diferente da atual.",
  mfa_verification_failed: "Código inválido. Confira o aplicativo autenticador e tente de novo.",
  otp_expired: "O link ou código expirou. Peça um novo.",
  captcha_failed: "Não foi possível confirmar a verificação anti-spam. Recarregue a página e tente de novo.",
  email_address_invalid: "Confira o endereço de email.",
};
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export async function edge<T>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await client().functions.invoke(name, {
    body: body ?? {},
  });
  if (error) {
    let message = "", code: string | undefined;
    try {
      const parsed = await error.context?.json();
      message =
        parsed?.message ?? parsed?.error?.message ?? parsed?.error ?? "";
      code = parsed?.code ?? parsed?.error?.code;
    } catch {
      /* Response may not be JSON. */
    }
    throw new AppError(
      typeof message === "string" && message && !/^[A-Z0-9_]+$/.test(message)
        ? message
        : errorMessage(error),
      typeof code === "string" ? code : undefined,
    );
  }
  return data as T;
}
export function useRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [name, args],
    queryFn: () => rpc<T>(name, args),
    enabled,
  });
}
export function internalPath(value: string | null, fallback = "/app/cursos") {
  if (
    !value ||
    !/^\/((app|admin)(\/|\?|$)|pedido\/)/.test(value) ||
    /[\\\u0000-\u001f]/.test(value)
  )
    return fallback;
  try {
    const url = new URL(value, location.origin);
    if (
      url.origin !== location.origin ||
      (!/^\/(app|admin)(\/|$)/.test(url.pathname) &&
        !/^\/pedido\/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(url.pathname))
    )
      return fallback;
    if (url.pathname.startsWith("/pedido/")) return url.pathname;
    for (const key of [...url.searchParams.keys()])
      if (/token|password|senha|document|cpf|cnpj|secret/i.test(key))
        url.searchParams.delete(key);
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return;
  try {
    const url = new URL(value, location.origin);
    if (
      url.protocol === "https:" ||
      (demo && url.protocol === "blob:" && url.origin === location.origin) ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname))
    )
      return url.href;
  } catch {
    return;
  }
}
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export const roleLabels = {
  member: "Membro",
  instructor: "Instrutor",
  moderator: "Moderador",
  support: "Suporte",
  admin: "Administrador",
} as const;
export const roleLabel = (role?: string) =>
  roleLabels[role as keyof typeof roleLabels] ?? "Papel não informado";
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value))
    : "Não informado";
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};
export type Profile = {
  id: string;
  full_name: string;
  email?: string;
  avatar_id?: string;
  password_setup_required?: boolean;
  phone: string;
  bio: string;
  company: Record<string, unknown>;
  role: string;
  theme: "light" | "dark";
  plan_name: string;
  current_plan_id?: string | null;
  access_ends_at: string | null;
  suspended: boolean;
  onboarding_complete: boolean;
  auto_advance?: boolean;
  gravatar_checked_at?: string | null;
};
export type Plan = {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  access_months: number;
  benefits: string[];
  active: boolean;
  interest_free?: boolean;
};
export type Bootstrap = {
  profile: Profile;
  plans: Plan[];
  settings: Record<string, unknown>;
};
export type Course = {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover_url: string | null;
  status: string;
  access_mode: string;
  plan_ids: string[];
  certificate_enabled: boolean;
  required_lessons: number;
  total_lessons: number;
  completed_lessons: number;
  progress_percent: number;
  duration_seconds: number;
  can_access: boolean;
};
export type Lesson = {
  id: string;
  slug: string;
  title: string;
  duration_seconds: number;
  type: string;
  order_index: number;
  can_access: boolean;
  completed: boolean;
  position_seconds?: number;
  last_activity_at?: string | null;
  body?: string;
  video_id?: string;
  storage_path?: string;
};
export type Section = {
  id: string;
  title: string;
  order_index: number;
  is_bonus: boolean;
  /** Seção criada sozinha para as aulas postas direto no módulo; não mostra cabeçalho. */
  is_default?: boolean;
  lessons: Lesson[];
};
export type Module = {
  id: string;
  slug: string;
  title: string;
  order_index: number;
  can_access: boolean;
  sections: Section[];
};
export type Material = {
  id: string;
  name: string;
  description: string;
  file_type: string;
  size_bytes: number;
  folder_id: string;
  lesson_ids?: string[];
  can_access: boolean;
};
export type Post = {
  id: string;
  space_id?: string;
  author_name: string;
  author_id: string;
  author_role: string;
  plan_name: string;
  title?: string;
  body: string;
  status: string;
  created_at: string;
  vote_count: number;
  voted: boolean;
  reply_count?: number;
  can_edit: boolean;
  can_archive?: boolean;
  can_restore?: boolean;
  image_path?: string;
  image_id?: string;
};
export type Space = {
  id: string;
  name: string;
  description?: string;
  can_post?: boolean;
};
export type Ticket = {
  id: string;
  subject: string;
  priority: string;
  status: string;
  created_at: string;
  attachments?: { id: string; name: string }[];
  messages: {
    id: string;
    author_name: string;
    author_id?: string;
    body: string;
    created_at: string;
    attachments: { id: string; name: string }[];
  }[];
};
export type Certificate = {
  id: string;
  code: string;
  student_name: string;
  course_title: string;
  duration_minutes: number;
  issued_at: string;
  revoked_at: string | null;
  demo: boolean;
  signer_name?: string;
  signer_title?: string;
  signature_url?: string;
  signature_path?: string | null;
};
