import { useEffect, useRef, useState, type ComponentProps } from "react";
import { client, edge, errorMessage, uploadStorage } from "./api";
import { optimizeFile, overLimit } from "./optimize";
import { Field, Notice, Unsaved } from "./ui";

// O recorte reencoda em JPEG, então só aqui dá para conferir o conteúdo real do arquivo escolhido.
const avatarSignatures: Record<string, number[]> = {
  "image/jpeg": [255, 216, 255],
  "image/png": [137, 80, 78, 71, 13, 10, 26, 10],
};

function FilePicker({ fileName, ...input }: ComponentProps<"input"> & { fileName: string }) {
  return (
    <span className="upload-picker">
      <span className="button" aria-hidden="true">Escolher arquivo</span>
      <span>{fileName || "Nenhum arquivo selecionado"}</span>
      <input {...input} type="file" />
    </span>
  );
}

export function Upload({
  kind,
  resourceId,
  onUploaded,
  onBusyChange,
}: {
  kind:
    | "course-cover"
    | "lesson"
    | "material"
    | "post-image"
    | "ticket-attachment"
    | "avatar";
  resourceId: string;
  onUploaded?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [state, setState] = useState(""),
    [error, setError] = useState(""),
    [fileName, setFileName] = useState(""),
    [busy, setBusy] = useState(false),
    controller = useRef<AbortController | null>(null),
    file = useRef<HTMLInputElement>(null),
    [preview, setPreview] = useState(""),
    [crop, setCrop] = useState(50),
    cropCanvas = useRef<HTMLCanvasElement>(null),
    lock = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!preview || !cropCanvas.current) return;
    const image = new Image();
    image.onload = () => {
      const canvas = cropCanvas.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const size = Math.min(image.width, image.height),
        x = ((image.width - size) * crop) / 100,
        y = ((image.height - size) * crop) / 100;
      // O recorte sai em JPEG, que não guarda transparência: sem fundo, ela viraria preto.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(image, x, y, size, size, 0, 0, 512, 512);
    };
    image.onerror = () => {
      setPreview("");
      setState("");
      setError("Não foi possível ler esta foto. Escolha outro JPG ou PNG.");
      if (file.current) file.current.value = "";
      setFileName("");
    };
    image.src = preview;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [preview, crop]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function upload() {
    let selected = file.current?.files?.[0];
    if (!selected || lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    controller.current = new AbortController();
    const before = selected.size;
    try {
      // Material de imagem é baixado pelo aluno: segue no formato que o admin escolheu.
      if (kind !== "avatar" && kind !== "lesson" && (kind !== "material" || selected.type === "application/pdf")) {
        setState("Otimizando arquivo…");
        selected = await optimizeFile(selected);
        if (controller.current.signal.aborted) throw new Error("Envio cancelado.");
      }
      setState("Enviando arquivo…");
      if (kind === "avatar" && cropCanvas.current) {
        const blob = await new Promise<Blob>((resolve, reject) =>
          cropCanvas.current!.toBlob(
            (b) =>
              b
                ? resolve(b)
                : reject(new Error("Não foi possível recortar a foto.")),
            "image/jpeg",
            0.9,
          ),
        );
        selected = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      }
      if (kind === "material" || kind === "lesson") {
        const reserved = await edge<{
          upload_id: string;
          bucket: string;
          path: string;
          expires_at: string;
        }>("upload", {
          action: "reserve",
          kind,
          resource_id: resourceId,
          file_name: selected.name,
          content_type: selected.type,
          size_bytes: selected.size,
        });
        if (
          reserved.bucket !== "icarus-private" ||
          !reserved.path ||
          !reserved.upload_id
        )
          throw new Error("Reserva de arquivo inválida.");
        if (controller.current.signal.aborted)
          throw new Error("Envio cancelado.");
        const { error } = await uploadStorage(controller.current.signal)
          .from(reserved.bucket)
          .upload(reserved.path, selected, {
            contentType: selected.type,
            upsert: false,
          });
        if (error) throw error;
        if (controller.current.signal.aborted)
          throw new Error("Envio cancelado.");
        setState("Confirmando o arquivo no servidor…");
        await edge("upload", {
          action: "finalize",
          upload_id: reserved.upload_id,
        });
      } else {
        const form = new FormData();
        form.append("file", selected);
        form.append("kind", kind);
        form.append("resource_id", resourceId);
        form.append("file_name", selected.name);
        form.append("content_type", selected.type);
        form.append("size_bytes", String(selected.size));
        const { error } = await client().functions.invoke("upload", {
          body: form,
          signal: controller.current.signal,
        });
        if (error) throw error;
      }
      const kb = (bytes: number) => Math.round(bytes / 1024);
      setState(
        kind === "avatar"
          ? "Foto salva."
          : kind !== "lesson" && kb(selected.size) < kb(before)
            ? `Arquivo otimizado de ${kb(before)} KB para ${kb(selected.size)} KB e enviado.`
            : "Arquivo enviado e associado ao registro.",
      );
      if (file.current) file.current.value = "";
      setFileName("");
      setPreview("");
      onUploaded?.();
    } catch (err) {
      setState("");
      setError(
        controller.current?.signal.aborted
          ? "Envio cancelado. A confirmação do servidor continua necessária antes de o arquivo ficar disponível."
          : errorMessage(err),
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
      controller.current = null;
    }
  }
  const input = (
    <FilePicker
      ref={file}
      fileName={fileName}
      disabled={busy}
      accept={
        kind === "avatar"
          ? "image/jpeg,image/png"
          : kind.includes("image") || kind === "course-cover"
          ? "image/png,image/jpeg,image/webp"
          : kind === "lesson"
            ? "video/mp4"
            : undefined
      }
      onChange={async (e) => {
        const input = e.currentTarget,
          selected = input.files?.[0];
        setFileName(selected?.name ?? "");
        setError("");
        setState("");
        const refused = kind !== "avatar" && selected ? overLimit(selected) : null;
        if (refused) {
          setError(refused);
          input.value = "";
          setFileName("");
          return;
        }
        if (kind !== "avatar") return;
        setPreview("");
        if (!selected) return;
        const head = new Uint8Array(
          await selected.slice(0, 8).arrayBuffer().catch(() => new ArrayBuffer(0)),
        );
        // Outra escolha chegou durante a leitura: ela decide a prévia.
        if (input.files?.[0] !== selected) return;
        const tooBig = selected.size > 500 * 1024;
        if (tooBig || !avatarSignatures[selected.type]?.every((byte, i) => head[i] === byte)) {
          setError(
            tooBig
              ? "Esta foto passa de 500 KB. Escolha uma menor, em JPG ou PNG."
              : "Escolha uma foto JPG ou PNG de até 500 KB.",
          );
          input.value = "";
          setFileName("");
          return;
        }
        setPreview(URL.createObjectURL(selected));
        setCrop(50);
        setState("Foto escolhida, ainda não salva. Ajuste o recorte e clique em Salvar foto.");
      }}
    />
  );
  return (
    <section className="upload" aria-busy={busy}>
      <Unsaved dirty={!!preview} />
      <Field
        label={
          kind === "ticket-attachment"
            ? "Anexar arquivo à conversa"
            : kind === "lesson"
              ? "Arquivo de vídeo"
            : kind === "avatar"
              ? "Foto do perfil"
              : "Enviar arquivo"
        }
        hint={
          kind === "avatar"
            ? "JPG ou PNG de até 500 KB."
            : kind === "lesson"
            ? "MP4 de até 500 MiB no armazenamento da plataforma."
            : kind === "material"
            ? "PDF até 5 MB, otimizado automaticamente. Imagem até 500 KB. ZIP, TXT, MP4 e MP3 até 500 MiB. O andamento abaixo não estima percentual."
            : kind === "course-cover"
            ? "PNG, JPG ou WebP de até 500 KB, otimizado automaticamente. O ideal é 1600\u00a0×\u00a0900\u00a0px."
            : "Imagem PNG, JPG ou WebP até 500 KB e PDF até 5 MB, otimizados automaticamente. Outros anexos até 20 MiB."
        }
      >
        {input}
      </Field>
      {kind === "avatar" && preview && (
        <div>
          <canvas
            ref={cropCanvas}
            width={512}
            height={512}
            className="avatar-preview"
            aria-label="Prévia do recorte quadrado da foto"
          />
          <Field label="Posição do recorte">
            <input
              type="range"
              min="0"
              max="100"
              value={crop}
              onChange={(e) => setCrop(Number(e.target.value))}
            />
          </Field>
        </div>
      )}
      <div className="actions">
        <button
          type="button"
          className={kind === "avatar" ? "primary" : undefined}
          disabled={busy || !fileName || (kind === "avatar" && !preview)}
          onClick={upload}
        >
          {kind === "avatar" ? "Salvar foto" : "Enviar arquivo"}
        </button>
        {busy && (
          <button type="button" onClick={() => controller.current?.abort()}>
            Cancelar envio
          </button>
        )}
      </div>
      {busy && (
        <progress aria-label="Envio em andamento, sem estimativa percentual" />
      )}
      {state && <p role="status">{state}</p>}
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}
