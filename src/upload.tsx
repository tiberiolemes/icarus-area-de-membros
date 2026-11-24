import { useEffect, useRef, useState } from "react";
import { client, edge, errorMessage, uploadStorage } from "./api";
import { Field, Notice } from "./ui";

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
      ctx.clearRect(0, 0, 512, 512);
      ctx.drawImage(image, x, y, size, size, 0, 0, 512, 512);
    };
    image.src = preview;
    return () => {
      image.onload = null;
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
    setState("Enviando arquivo…");
    controller.current = new AbortController();
    try {
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
      setState("Arquivo enviado e associado ao registro.");
      if (file.current) file.current.value = "";
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
  return (
    <section className="upload" aria-busy={busy}>
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
          kind === "lesson"
            ? "MP4 até 500 MiB no armazenamento da academia."
            : kind === "material"
            ? "Até 500 MiB, conforme o tipo permitido pelo servidor. O andamento abaixo não estima percentual."
            : "Imagem raster até 5 MiB; anexos até 20 MiB, conforme o tipo permitido."
        }
      >
        <input
          ref={file}
          type="file"
          disabled={busy}
          accept={
            kind.includes("image") ||
            kind === "course-cover" ||
            kind === "avatar"
              ? "image/png,image/jpeg,image/webp"
              : kind === "lesson"
                ? "video/mp4"
                : undefined
          }
          onChange={(e) => {
            setError("");
            setState("");
            const selected = e.target.files?.[0];
            if (kind === "avatar" && selected) {
              if (
                !["image/jpeg", "image/png", "image/webp"].includes(
                  selected.type,
                ) ||
                selected.size > 5 * 1024 ** 2
              ) {
                setError("Escolha uma imagem PNG, JPG ou WebP de até 5 MiB.");
                e.target.value = "";
                return;
              }
              setPreview(URL.createObjectURL(selected));
              setCrop(50);
            }
          }}
        />
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
        <button type="button" disabled={busy} onClick={upload}>
          Enviar arquivo
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
