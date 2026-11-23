import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";
import { Link, useLocation, useNavigationType } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, X } from "lucide-react";
import { errorMessage } from "./api";

export function Heading({
  title,
  children,
  action,
  level = 1,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  level?: 1 | 2;
}) {
  const Title = level === 1 ? "h1" : "h2";
  return (
    <header className="page-heading">
      <div>
        <Title tabIndex={-1}>{title}</Title>
        {children && <p>{children}</p>}
      </div>
      {action}
    </header>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div className="notice" role={error ? "alert" : "status"}>
      <AlertCircle size={20} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="skeleton" role="status" aria-label="Carregando conteúdo">
      <span />
      <span />
      <span />
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function QueryState({
  query,
  children,
}: {
  query: { isPending: boolean; error: unknown; refetch: () => unknown };
  children: ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <>
        <Notice error>{errorMessage(query.error)}</Notice>
        <button onClick={() => query.refetch()}>Tentar novamente</button>
      </>
    );
  return <>{children}</>;
}
const FormErrors = createContext<Record<string, string>>({});
const FormBusy = createContext(false);
export const useFormBusy = () => useContext(FormBusy);
export function Password({
  label,
  hint,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false),
    busy = useFormBusy();
  return (
    <div className="password-field">
      <Field label={label} hint={hint}>
        <input
          {...props}
          type={visible ? "text" : "password"}
          data-sensitive="password"
          disabled={busy || props.disabled}
        />
      </Field>
      <button
        type="button"
        className="password-toggle"
        disabled={busy || props.disabled}
        aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLocaleLowerCase("pt-BR")}`}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
  );
}
function validationMessage(input: HTMLInputElement) {
  const v = input.validity;
  if (v.valueMissing) return "Preencha este campo.";
  if (v.typeMismatch)
    return input.type === "email"
      ? "Informe um email válido."
      : "Informe um endereço válido.";
  if (v.tooShort) return `Use pelo menos ${input.minLength} caracteres.`;
  if (v.tooLong) return `Use no máximo ${input.maxLength} caracteres.`;
  if (v.rangeUnderflow) return `Informe um valor a partir de ${input.min}.`;
  if (v.rangeOverflow) return `Informe um valor até ${input.max}.`;
  if (v.stepMismatch || v.badInput) return "Informe um número válido.";
  return "Confira o formato deste campo.";
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId(),
    errors = useContext(FormErrors),
    input = isValidElement<{
      name?: string;
      id?: string;
      "aria-invalid"?: boolean;
      "aria-describedby"?: string;
      "aria-labelledby"?: string;
    }>(children)
      ? children
      : null,
    name = input?.props.name,
    error = name ? errors[name] : undefined;
  return (
    <label className="field">
      <span id={id + "-label"}>{label}</span>
      {input
        ? cloneElement(input, {
            id: input.props.id ?? id,
            "aria-labelledby": id + "-label",
            "aria-invalid": !!error,
            "aria-describedby": error
              ? id + "-error"
              : hint
                ? id + "-hint"
                : undefined,
          })
        : children}
      {hint && <small id={id + "-hint"}>{hint}</small>}
      {error && (
        <small className="field-error" id={id + "-error"}>
          {error}
        </small>
      )}
    </label>
  );
}
export function Form({
  children,
  onSave,
  label = "Salvar",
  className = "",
  onDone,
  successMessage = "Salvo com sucesso.",
  disabled = false,
  secondaryAction,
}: {
  children: ReactNode;
  onSave: (data: FormData, form: HTMLFormElement) => Promise<unknown>;
  label?: string;
  className?: string;
  onDone?: () => void;
  successMessage?: string;
  disabled?: boolean;
  secondaryAction?: ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [fields, setFields] = useState<Record<string, string>>({}),
    [dirty, setDirty] = useState(false);
  const lock = useRef(false),
    summary = useRef<HTMLDivElement>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current || disabled) return;
    const form = e.currentTarget;
    setFields({});
    if (!form.checkValidity()) {
      setError("Confira os campos indicados antes de enviar.");
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await onSave(new FormData(form), form);
      setDirty(false);
      setSaved(true);
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
      requestAnimationFrame(() => summary.current?.focus());
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <FormErrors.Provider value={fields}>
      <FormBusy.Provider value={busy}>
        <Unsaved dirty={dirty} />
        <form
          className={`form ${className}`}
          noValidate
          onInput={() => {
            setDirty(true);
            setSaved(false);
          }}
          onInvalidCapture={(event) => {
            event.preventDefault();
            const input = event.target as HTMLInputElement;
            if (input.name)
              setFields((old) => ({
                ...old,
                [input.name]: validationMessage(input),
              }));
          }}
          onSubmit={submit}
          aria-busy={busy}
        >
          {error && (
            <div className="notice" role="alert" tabIndex={-1} ref={summary}>
              <AlertCircle size={20} />
              <div>
                <strong>Revise o envio</strong>
                <p>{error}</p>
              </div>
            </div>
          )}
          <fieldset disabled={busy || disabled}>
            {children}
            <div className="form-actions">
              <button className="primary" type="submit" disabled={busy || disabled}>
                {busy ? "Enviando…" : label}
              </button>
              {secondaryAction}
              {saved && successMessage && (
                <span role="status">
                  <Check size={18} aria-hidden="true" /> {successMessage}
                </span>
              )}
            </div>
          </fieldset>
        </form>
      </FormBusy.Provider>
    </FormErrors.Provider>
  );
}
export const value = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
export const nullable = (data: FormData, key: string) =>
  value(data, key) || null;
export function Back({ to, label = "Voltar" }: { to: string; label?: string }) {
  return (
    <Link className="back" to={to} state={{ restoreScroll: true }}>
      <ArrowLeft size={18} />
      {label}
    </Link>
  );
}
export function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Paginação">
      <span>
        {total} registro{total === 1 ? "" : "s"} · página {page} de{" "}
        {Math.max(1, Math.ceil(total / 20))}
      </span>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </button>
      <button disabled={page * 20 >= total} onClick={() => onChange(page + 1)}>
        Próxima
      </button>
    </nav>
  );
}
export function Search({
  initial = "",
  onSearch,
}: {
  initial?: string;
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState(initial);
  useEffect(() => setQuery(initial), [initial]);
  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value(new FormData(e.currentTarget), "q"));
      }}
    >
      <label className="sr-only" htmlFor="search">
        Buscar
      </label>
      <input
        id="search"
        name="q"
        placeholder="Buscar…"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <button>Buscar</button>
    </form>
  );
}
export function Modal({
  title,
  trigger,
  children,
  description,
}: {
  title: string;
  trigger: ReactNode;
  children: ReactNode;
  description?: string;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>
            {description ?? "Revise os dados antes de confirmar."}
          </Dialog.Description>
          {children}
          <Dialog.Close className="icon-button close" aria-label="Fechar">
            <X />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Action({
  children,
  run,
  confirm,
  disabled = false,
  primary = false,
}: {
  children: ReactNode;
  run: () => Promise<unknown>;
  confirm?: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  return (
    <span className="action">
      <button
        className={primary ? "primary" : undefined}
        disabled={busy || disabled}
        onClick={async () => {
          if (lock.current || (confirm && !window.confirm(confirm))) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await run();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "Aguarde…" : children}
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
const scrollPositions = new Map<string, number>();
export function RouteFocus() {
  const { pathname, search, key, state } = useLocation(),
    navigation = useNavigationType();
  const previousPath = useRef(pathname);
  useEffect(() => {
    const searching = previousPath.current === pathname && navigation !== "POP" &&
      document.activeElement?.closest('form[role="search"]');
    previousPath.current = pathname;
    if (!searching) {
      document.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      window.scrollTo(
      0,
      navigation === "POP"
        ? (scrollPositions.get(key) ?? 0)
        : state?.restoreScroll
          ? (scrollPositions.get(pathname + search) ?? 0)
          : 0,
      );
    }
    return () => {
      scrollPositions.set(key, window.scrollY);
      scrollPositions.set(pathname + search, window.scrollY);
    };
  }, [pathname, key]);
  return null;
}
export function Unsaved({ dirty }: { dirty: boolean }) {
  useEffect(() => {
    if (!dirty) return;
    const fn = (event: BeforeUnloadEvent) => {
        event.preventDefault();
      },
      navigate = (event: MouseEvent) => {
        const target = (event.target as HTMLElement).closest("a[href]");
        if (!target) return;
        const href = target.getAttribute("href");
        if (
          !href ||
          href.startsWith("#") ||
          target.getAttribute("target") === "_blank"
        )
          return;
        if (
          !window.confirm(
            "Você tem alterações não salvas. Deseja sair desta edição?",
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
    window.addEventListener("beforeunload", fn);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", fn);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);
  return null;
}
export function Progress({
  value: percent,
  done,
  total,
}: {
  value: number;
  done?: number;
  total?: number;
}) {
  return (
    <div className="progress">
      <progress
        value={percent}
        max={100}
        aria-label={`${percent}% concluído`}
      />
      <span>
        {done !== undefined ? `${done}/${total} aulas · ` : ""}
        {percent}%
      </span>
    </div>
  );
}
