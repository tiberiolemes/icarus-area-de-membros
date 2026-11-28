import { MessageSquarePlus } from "lucide-react";
import { useRef, useState } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { client, errorMessage, rpc } from "../api";
import { Dropzone } from "../dropzone";
import { finalLimit, limits, optimizeFile } from "../optimize";
import { Field, Form, Modal, Unsaved, value } from "../ui";

export const feedbackTypes = { suggestion: "Sugestão", bug: "Bug/Problema", other: "Outro" };

const memberPaths = [
  "/app", "/app/cursos", "/app/cursos/:curso", "/app/cursos/:curso/:modulo", "/app/cursos/:curso/:modulo/:aula",
  "/app/materiais", "/app/materiais/:pasta", "/app/podcasts", "/app/certificados", "/app/encontros-ao-vivo",
  "/app/notificacoes", "/app/configuracoes", "/app/comunidade", "/app/comunidade/novo", "/app/comunidade/:post",
  "/app/comunidade/:post/editar", "/app/suporte", "/app/suporte/novo", "/app/suporte/:ticket",
];

function browserFamily(userAgent: string) {
  if (/Edg(?:e|A|iOS)?\//i.test(userAgent)) return "Edge";
  if (/OPR\/|OPiOS\//i.test(userAgent)) return "Opera";
  if (/Firefox\/|FxiOS\//i.test(userAgent)) return "Firefox";
  if (/Chrome\/|CriOS\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Outro";
}

type Attempt = {
  key: string;
  kind: string;
  description: string;
  file: File | null;
  // Otimizado uma vez: a nova tentativa manda os mesmos bytes que a reserva do print já conhece.
  upload?: File;
  fileKey: string | null;
  printId: string | null;
  pagePath: string | null;
  browser: string;
};

function FeedbackForm({ pagePath }: { pagePath: string | null }) {
  const attempt = useRef<Attempt | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File>();
  const [pending, setPending] = useState(false);
  const [draftPreserved, setDraftPreserved] = useState(false);
  return (
    <Form label={pending ? "Confirmar envio anterior" : draftPreserved ? "Enviar rascunho como novo feedback" : "Enviar feedback"}
      successMessage={draftPreserved ? "Feedback anterior confirmado. Seu rascunho continua aqui." : "Feedback enviado."}
      onSave={async (data, form) => {
      const kind = value(data, "kind");
      const description = String(data.get("description") ?? "");
      const file = fileInput.current?.files?.[0] ?? null;
      if (!attempt.current) {
        if (!description.trim()) throw new Error("Escreva uma descrição para o feedback.");
        if (file && (!/^.+\.(png|jpe?g|webp)$/i.test(file.name) || !["image/png", "image/jpeg", "image/webp"].includes(file.type) || !file.size || file.size > limits.original)) {
          throw new Error("Escolha um print PNG, JPG ou WebP de até 20 MB.");
        }
        attempt.current = { key: crypto.randomUUID(), kind, description, file,
          fileKey: file ? crypto.randomUUID() : null, printId: null, pagePath, browser: browserFamily(navigator.userAgent) };
      }
      const original = attempt.current;
      try {
        if (original.file && original.fileKey && !original.printId) {
          const upload = new FormData();
          upload.set("kind", "feedback-screenshot");
          upload.set("resource_id", original.fileKey);
          original.upload ??= await optimizeFile(original.file, limits.screenshot);
          const refused = finalLimit(original.upload, true);
          // Nada foi reservado: a próxima tentativa pode trazer outro print.
          if (refused) { attempt.current = null; throw new Error(refused); }
          upload.set("file", original.upload);
          const { data: uploaded, error } = await client().functions.invoke<{ id: string }>("upload", { body: upload });
          if (error) {
            const response = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
            if (["INVALID_FILE", "INVALID_INPUT", "TOO_LARGE"].includes(response?.error?.code)) attempt.current = null;
            throw new Error(response?.error?.message || errorMessage(error));
          }
          if (!uploaded?.id) throw new Error("O servidor não confirmou o print. Tente novamente.");
          original.printId = uploaded.id;
        }
        const confirmed = await rpc<{ id: string }>("app_submit_feedback", {
          p_attempt_key: original.key, p_kind: original.kind, p_body: original.description.trim(),
          p_screenshot_id: original.printId, p_page_path: original.pagePath, p_browser_family: original.browser,
        });
        if (!confirmed?.id) throw new Error("O servidor ainda não confirmou o feedback.");
      } catch (error) {
        setPending(attempt.current !== null);
        throw error;
      }
      const edited = kind !== original.kind || description !== original.description || file !== original.file;
      attempt.current = null;
      setPending(false);
      setDraftPreserved(edited);
      if (!edited) {
        form.reset();
        setChosen(undefined);
      }
    }}>
      <Unsaved dirty={draftPreserved} />
      {pending && <p>Confirme o envio anterior antes de enviar as alterações do rascunho.</p>}
      <Field label="Tipo">
        <select name="kind" required={!pending} defaultValue="">
          <option value="" disabled>Selecione o tipo</option>
          {Object.entries(feedbackTypes).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </select>
      </Field>
      <Field label="Descrição"><textarea name="description" rows={5} required={!pending} maxLength={4000} /></Field>
      <Dropzone label="Print (opcional)" hint="PNG, JPG ou WebP · até 20 MB, e até 5 MB depois de otimizado · confira se o print contém dados pessoais antes de enviar"
        name="screenshot" accept="image/png,image/jpeg,image/webp" inputRef={fileInput}
        fileName={chosen?.name} fileSize={chosen?.size} onFile={setChosen} />
    </Form>
  );
}

export function FeedbackButton() {
  const { pathname } = useLocation();
  const pagePath = memberPaths.find((path) => matchPath(path, pathname)) ?? null;
  return (
    <Modal title="Envie seu feedback"
      description="O envio inclui a seção da plataforma e a família do navegador."
      trigger={<button type="button" className="icon-button" title="Enviar feedback" aria-label="Enviar feedback" data-tour="send-feedback">
        <MessageSquarePlus size={20} aria-hidden="true" />
      </button>}>
      <FeedbackForm pagePath={pagePath} />
    </Modal>
  );
}
