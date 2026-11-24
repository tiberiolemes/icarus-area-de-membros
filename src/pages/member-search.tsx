import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, CirclePlay, Layers, Search } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { client, type Page } from "../api";
import { Pager } from "../ui";
import "./member-search.css";

type MemberSearchHit = { kind: "course" | "module" | "lesson"; title: string; path: string };
const kinds = {
  course: { label: "Curso", icon: BookOpen, segments: 3 },
  module: { label: "Módulo", icon: Layers, segments: 4 },
  lesson: { label: "Aula", icon: CirclePlay, segments: 5 },
} as const;
const coursePath = /^\/app\/cursos(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){1,3}$/;
const lessonPath = /^\/app\/cursos(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){2}\/~[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const maxLength = 200;

export function MemberSearch({ actorId, drawerOpen = false }: { actorId: string; drawerOpen?: boolean }) {
  const location = useLocation();
  const catalogTerm = location.pathname === "/app/cursos" ? new URLSearchParams(location.search).get("q") ?? "" : "";
  return (
    <QuickSearch
      key={JSON.stringify([actorId, location.key])}
      actorId={actorId}
      drawerOpen={drawerOpen}
      initial={catalogTerm.slice(0, maxLength)}
    />
  );
}

function QuickSearch({ actorId, drawerOpen, initial }: { actorId: string; drawerOpen: boolean; initial: string }) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const panel = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [request, setRequest] = useState({ term: "", page: 1 });
  const term = draft.trim();
  const canSearch = Array.from(term).length >= 2;
  const visible = open && !drawerOpen;
  const queryTerm = visible && canSearch && request.term === term ? term : "";
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl+K";
  const query = useQuery({
    queryKey: ["app_member_search", actorId, queryTerm, request.page],
    enabled: Boolean(queryTerm),
    networkMode: "always",
    gcTime: 0,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const { data, error } = await client().rpc("app_member_search", {
        p_query: queryTerm,
        p_page: request.page,
      }).retry(false).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(8000)]));
      if (error) throw error;
      return data as Page<MemberSearchHit>;
    },
  });

  useEffect(() => {
    if (!visible || !canSearch || request.term === term) return;
    const timer = window.setTimeout(() => setRequest({ term, page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [canSearch, request.term, term, visible]);

  useEffect(() => {
    if (drawerOpen) {
      setOpen(false);
      return;
    }
    function onShortcut(event: KeyboardEvent) {
      const target = event.target;
      if (event.defaultPrevented || event.isComposing || event.key.toLowerCase() !== "k" ||
          !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey ||
          (target instanceof Element && target.closest('[role="dialog"], .tour-panel, [contenteditable]'))) return;
      event.preventDefault();
      setOpen(true);
      input.current?.focus();
      input.current?.select();
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [drawerOpen]);

  useEffect(() => {
    if (!visible) return;
    function onOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onOutsidePress);
    return () => document.removeEventListener("pointerdown", onOutsidePress);
  }, [visible]);

  const data = queryTerm && !query.isFetching && !query.isError ? query.data : undefined;
  const hits = data?.items.filter(({ kind, path }) =>
    typeof path === "string" && (kind === "lesson" && lessonPath.test(path) ||
      coursePath.test(path) && path.slice(1).split("/").length === kinds[kind]?.segments),
  ) ?? [];
  const pending = canSearch && (!queryTerm || query.isPending || query.isFetching);
  const failure = Boolean(queryTerm) && query.isError && !query.isFetching;
  const error = query.error;
  const errorText = error?.message === "Muitas solicitações. Aguarde um minuto."
    ? error.message
    : "Não foi possível concluir a busca.";
  const catalogPath = term ? `/app/cursos?${new URLSearchParams({ q: term, page: "1" })}` : "/app/cursos";

  return (
    <div
      ref={root}
      className="member-search"
      data-tour="member-search"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (!visible || event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          input.current?.focus();
          setOpen(false);
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const links = Array.from(list.current?.querySelectorAll("a") ?? []);
        const index = links.findIndex((link) => link === event.target);
        if (event.target !== input.current && index < 0) return;
        if (links.length === 0) return;
        event.preventDefault();
        const next = event.key === "ArrowDown" ? index + 1 : index < 0 ? links.length - 1 : index - 1;
        (links[next] ?? input.current)?.focus();
      }}
    >
      <form
        className="member-search-field"
        role="search"
        aria-label="Busca rápida de conteúdos"
        onSubmit={(event) => {
          event.preventDefault();
          setOpen(true);
          input.current?.focus();
          if (request.term !== term || request.page !== 1) setRequest({ term, page: 1 });
          else if (failure) void query.refetch();
        }}
      >
        <button type="submit" className="icon-button" aria-label="Buscar conteúdos"
          aria-expanded={visible} aria-controls={visible ? panel : undefined}>
          <Search size={18} aria-hidden="true" />
        </button>
        <input
          ref={input}
          type="search"
          aria-label="Busca rápida em aulas e módulos"
          aria-keyshortcuts="Control+K Meta+K"
          placeholder="Busca rápida em aulas e módulos…"
          autoComplete="off"
          maxLength={maxLength}
          value={draft}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            const value = event.target.value;
            if (value.trim() !== term) setRequest({ term: "", page: 1 });
            setDraft(value);
            setOpen(true);
          }}
        />
        <span className="member-search-mobile-hint" aria-hidden="true">Buscar…</span>
        <kbd aria-hidden="true">{shortcut}</kbd>
      </form>
      {visible && (
        <div className="member-search-panel" id={panel}>
          <Link className="member-search-catalog" to={catalogPath}>
            {term ? "Buscar no catálogo" : "Abrir catálogo"} <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <p className="member-search-status" role="status" aria-atomic="true">
            {!canSearch ? "Digite pelo menos 2 caracteres." : pending ? "Buscando conteúdos…" :
              data && (hits.length > 0
                ? `${data.total} ${data.total === 1 ? "resultado" : "resultados"} · página ${data.page} de ${Math.ceil(data.total / data.page_size)}`
                : data.page > 1 ? "Nenhum resultado nesta página." : "Nenhum conteúdo disponível encontrado.")}
          </p>
          {failure && (
            <div className="member-search-error">
              <p role="alert">{errorText}</p>
              <button type="button" onClick={() => {
                input.current?.focus();
                void query.refetch();
              }}>Tentar novamente</button>
            </div>
          )}
          {hits.length > 0 && (
            <ul className="member-search-results" aria-label="Resultados da busca" ref={list}>
              {hits.map(({ kind, title, path }) => {
                const { icon: Icon, label } = kinds[kind];
                return (
                  <li key={path}>
                    <Link to={path}>
                      <Icon size={18} aria-hidden="true" />
                      <span><strong>{title}</strong>{" "}<small>{label}</small></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {data && (data.total > data.page_size || data.page > 1) && (
            <Pager page={data.page} total={data.total} onChange={(page) => {
              input.current?.focus();
              setRequest({ term, page });
            }} />
          )}
        </div>
      )}
    </div>
  );
}
