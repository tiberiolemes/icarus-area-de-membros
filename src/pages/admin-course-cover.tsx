import { useRef, useState } from "react";
import { errorMessage, rpc, safeUrl } from "../api";
import { usePrivateImageQuery } from "../media";
import { Field, Notice, Unsaved } from "../ui";

type Focus = [number, number];
type CoverCourse = { id: string; cover_url?: unknown; cover_focus?: unknown };

const parse = (focus: unknown): Focus => {
  const found = /^(\d{1,3})% (\d{1,3})%$/.exec(String(focus ?? ""));
  return found ? [Number(found[1]), Number(found[2])] : [50, 50];
};
const css = ([x, y]: Focus) => `${x}% ${y}%`;
const percent = (offset: number, size: number) => Math.min(100, Math.max(0, Math.round((offset / size) * 100)));

/** Prévia da capa nas proporções em que ela aparece e escolha do ponto que nunca sai do recorte. */
export function CoverFocus({ course, onSaved }: { course: CoverCourse; onSaved: () => unknown }) {
  return course.cover_url ? (
    // A chave troca com a capa, para a prévia buscar a imagem nova.
    <CoverFocusEditor key={String(course.cover_url)} course={course} onSaved={onSaved} />
  ) : (
    <p className="cover-focus-empty">Envie uma imagem para ver a prévia e ajustar o foco do corte.</p>
  );
}

function CoverFocusEditor({ course, onSaved }: { course: CoverCourse; onSaved: () => unknown }) {
  const cover = usePrivateImageQuery("course-cover", course.id),
    url = safeUrl(cover.data?.url),
    saved = css(parse(course.cover_focus)),
    [focus, setFocus] = useState<Focus>(() => parse(course.cover_focus)),
    [busy, setBusy] = useState(false),
    [state, setState] = useState(""),
    [error, setError] = useState(""),
    lock = useRef(false),
    retried = useRef(false),
    value = css(focus),
    dirty = value !== saved;
  function move(next: Focus) {
    setFocus(next);
    setState("");
    setError("");
  }
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setState("");
    setError("");
    try {
      await rpc("app_admin_course_cover_focus", { p_id: course.id, p_focus: value });
      await onSaved();
      setState("Foco salvo.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (cover.isPending) return <p role="status">Carregando a capa…</p>;
  if (cover.error || !url)
    return (
      <span className="media-error">
        {cover.error ? errorMessage(cover.error) : "A capa não pôde ser carregada."}{" "}
        <button type="button" onClick={() => cover.refetch()}>Carregar imagem</button>
      </span>
    );
  return (
    <div className="cover-focus" aria-busy={busy}>
      <Unsaved dirty={dirty} />
      <h3>Como a capa aparece</h3>
      <div className="cover-previews">
        {[
          ["wide", "Lista de cursos e aula"],
          ["page", "Página do curso"],
          ["strip", "Página do curso no tablet"],
        ].map(([shape, caption]) => (
          <figure key={shape}>
            <img className={`cover-preview cover-preview-${shape}`} src={url} alt="" referrerPolicy="no-referrer" style={{ objectPosition: value }} />
            <figcaption>{caption}</figcaption>
          </figure>
        ))}
      </div>
      <h3>Foco do corte</h3>
      <p>
        A capa é recortada para caber em cada tela. Clique no ponto da imagem que deve aparecer sempre, ou ajuste
        pelos controles.
      </p>
      {/* O clique é um atalho para quem usa mouse ou toque. Os controles abaixo fazem o mesmo pelo teclado. */}
      <div
        className="cover-focus-picker"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          if (!busy && box.width && box.height)
            move([percent(event.clientX - box.left, box.width), percent(event.clientY - box.top, box.height)]);
        }}
      >
        <img
          src={url}
          alt="Capa completa do curso"
          referrerPolicy="no-referrer"
          onError={() => {
            // O endereço da imagem vence em dois minutos. Uma nova busca resolve.
            if (!retried.current) {
              retried.current = true;
              void cover.refetch();
            }
          }}
        />
        <span className="cover-focus-point" style={{ left: `${focus[0]}%`, top: `${focus[1]}%` }} aria-hidden="true" />
      </div>
      <Field label="Foco horizontal" hint="0 é a borda esquerda e 100 é a direita.">
        <input type="range" min="0" max="100" value={focus[0]} disabled={busy} onChange={(event) => move([Number(event.target.value), focus[1]])} />
      </Field>
      <Field label="Foco vertical" hint="0 é o topo e 100 é a base.">
        <input type="range" min="0" max="100" value={focus[1]} disabled={busy} onChange={(event) => move([focus[0], Number(event.target.value)])} />
      </Field>
      <div className="actions">
        <button type="button" className="primary" disabled={busy || !dirty} onClick={save}>
          Salvar foco
        </button>
      </div>
      {state && <p role="status">{state}</p>}
      {error && <Notice error>{error}</Notice>}
    </div>
  );
}
