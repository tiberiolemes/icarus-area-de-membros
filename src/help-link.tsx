import { useState, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link, createSearchParams } from "react-router-dom";
import { useAuth } from "./auth";
import { Loading, Modal, Notice } from "./ui";

type HelpRenderer = typeof import("./pages/help-article").HelpContent;

function regularClick(event: MouseEvent<HTMLAnchorElement>) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}

export function HelpLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const { session } = useAuth();
  const member = !!session;
  const base = member ? "/app/ajuda" : "/ajuda";
  const start = member ? "/app" + to : to;
  const [history, setHistory] = useState<string[]>([]);
  const [Renderer, setRenderer] = useState<HelpRenderer | null>();
  const current = history.at(-1) ?? start;
  const [path, query] = current.split("?");

  function open() {
    setHistory([start]);
    if (!Renderer) {
      setRenderer(undefined);
      void import("./pages/help-article").then(({ HelpContent }) => setRenderer(() => HelpContent), () => setRenderer(null));
    }
  }

  function push(next: string) {
    setHistory((entries) => entries.at(-1) === next ? entries : [...entries, next]);
  }

  return (
    <Modal
      title="Central de ajuda"
      description="Consulte a ajuda sem sair da tela."
      contentClass="dialog-help"
      open={history.length > 0}
      onOpenChange={(open) => { if (!open) setHistory([]); }}
      trigger={<Link to={to} className={className} onClick={(event) => {
        if (!regularClick(event)) return;
        event.preventDefault();
        open();
      }}>{children}</Link>}
    >
      <Link
        className="button icon-button help-window"
        to={current}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir em uma nova janela"
        aria-label="Abrir em uma nova janela"
      >
        <ExternalLink size={20} aria-hidden="true" />
      </Link>
      {history.length > 1 && <button type="button" className="help-return" onClick={() => setHistory((entries) => entries.slice(0, -1))}>
        <ArrowLeft size={16} aria-hidden="true" /> Voltar
      </button>}
      {Renderer ? (
        <Renderer
          member={member}
          artigo={path.slice(base.length + 1) || undefined}
          params={new URLSearchParams(query)}
          setParams={(params) => push(params.q ? base + "?" + createSearchParams(params) : base)}
          onFollow={(event, next) => {
            if (!regularClick(event)) return;
            if (next === base || next.startsWith(base + "/") || next.startsWith(base + "?")) {
              event.preventDefault();
              push(next);
            } else {
              setHistory([]);
            }
          }}
        />
      ) : Renderer === null ? <Notice error>Não foi possível carregar a ajuda. Use o botão para abrir em uma nova janela.</Notice> : <Loading />}
    </Modal>
  );
}
