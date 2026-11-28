import { FolderOpen } from "lucide-react";
import { useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Notice } from "./ui";
import "./dropzone.css";

const video = "A plataforma não recebe vídeo. Use o Bunny Stream ou o YouTube.";
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const size = (bytes: number) =>
  bytes >= 1_048_576 ? `${number.format(bytes / 1_048_576)} MB` : bytes >= 1024 ? `${number.format(bytes / 1024)} KB` : `${number.format(bytes)} B`;

// Arquivo sem tipo informado segue para a conferência pelo conteúdo, feita por quem recebe e pelo servidor.
const accepts = (accept: string | undefined, file: File) =>
  !accept || !file.type || accept.split(",").some((rule) => {
    rule = rule.trim().toLowerCase();
    return rule.startsWith(".") ? file.name.toLowerCase().endsWith(rule)
      : rule.endsWith("/*") ? file.type.startsWith(rule.slice(0, -1))
      : file.type === rule;
  });

/** Área de arraste do Icarus. O input real fica escondido para o FormData dos formulários; o botão é o controle. */
export function Dropzone({ label, hint, accept, name, disabled, fileName, fileSize, inputRef, onFile }: {
  label: string;
  hint: string;
  accept?: string;
  name?: string;
  disabled?: boolean;
  fileName?: string;
  fileSize?: number;
  inputRef?: Ref<HTMLInputElement>;
  onFile: (file: File | undefined) => void;
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false), [message, setMessage] = useState<{ text: string; error: boolean }>();
  useImperativeHandle(inputRef, () => input.current!, []);
  // Desabilitado pela prop ou pelo fieldset do formulário durante o envio.
  const off = () => disabled || !!input.current?.matches(":disabled");

  function drop(files: FileList) {
    setMessage(undefined);
    const file = files[0];
    if (!file || off()) return;
    if (file.type.startsWith("video/")) return setMessage({ text: video, error: true });
    if (!accepts(accept, file)) return setMessage({ text: "Tipo de arquivo não aceito aqui.", error: true });
    try {
      // Só o primeiro vai para o campo, que não é múltiplo: o FormData não leva arquivo sem conferência.
      const first = new DataTransfer();
      first.items.add(file);
      input.current!.files = first.files;
      // Mesmo aviso de uma escolha pelo seletor: o formulário passa a ter alteração.
      input.current!.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {
      /* Navegador sem atribuição de files: quem usa o arquivo o recebe por onFile. */
    }
    if (files.length > 1) setMessage({ text: "Envie um arquivo por vez.", error: false });
    onFile(file);
  }

  return (
    <div className="field dropzone">
      <span id={`${id}-label`}>{label}</span>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className={`dropzone-area${dragging ? " is-dragging" : ""}`}
        // Sem preventDefault, o navegador abre o arquivo solto no lugar da página.
        onDragOver={(event) => { event.preventDefault(); if (!off()) setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); drop(event.dataTransfer.files); }}
      >
        <FolderOpen size={40} strokeWidth={1.5} aria-hidden="true" />
        <strong className="dropzone-drag">Arraste o arquivo aqui</strong>
        <span className="dropzone-or">ou</span>
        {fileName && <span className="dropzone-file"><strong>{fileName}</strong>{fileSize !== undefined && ` · ${size(fileSize)}`}</span>}
        <button type="button" disabled={disabled} aria-describedby={`${id}-hint`} onClick={() => input.current?.click()}>
          {fileName ? "Trocar arquivo" : "Selecionar arquivo"}
        </button>
        <small id={`${id}-hint`}>{hint}</small>
        <input
          ref={input}
          type="file"
          name={name}
          accept={accept}
          disabled={disabled}
          hidden
          aria-labelledby={`${id}-label`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setMessage(undefined);
            if (!file?.type.startsWith("video/")) return onFile(file);
            // O vídeo nunca chega a quem envia; o campo fica vazio, como numa escolha cancelada.
            event.currentTarget.value = "";
            setMessage({ text: video, error: true });
            onFile(undefined);
          }}
        />
      </div>
      {message && <Notice error={message.error}>{message.text}</Notice>}
    </div>
  );
}
