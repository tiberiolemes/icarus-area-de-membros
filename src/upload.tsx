import { useEffect, useRef, useState } from "react";
import { client, edge, errorMessage, uploadStorage } from "./api";
import { Dropzone } from "./dropzone";
import { finalLimit, limits, optimizeFile, overLimit } from "./optimize";
import { Field, Notice, Unsaved } from "./ui";

export type UploadKind = "course-cover" | "material" | "post-image" | "ticket-attachment" | "avatar";

// O recorte reencoda em JPEG, então só aqui dá para conferir o conteúdo real do arquivo escolhido.
const avatarSignatures: Record<string, number[]> = {
  "image/jpeg": [255, 216, 255],
  "image/png": [137, 80, 78, 71, 13, 10, 26, 10],
};

export const hints: Record<UploadKind, string> = {
  "course-cover": "PNG, JPG ou WebP · até 500 KB depois de otimizada · ideal 1600\u00a0×\u00a0900\u00a0px",
  material: "PDF, imagem, ZIP, TXT ou MP3 · PDF até 5 MB e imagem até 500 KB depois de otimizados · ZIP, TXT e MP3 até 500 MB",
  "post-image": "PNG, JPG ou WebP · até 500 KB depois de otimizada",
  "ticket-attachment": "Imagem, PDF, ZIP, TXT ou MP3 · imagem até 500 KB e PDF até 5 MB depois de otimizados · demais até 20 MB",
  avatar: "JPG ou PNG · até 20 MB",
};

/** Otimiza, envia (reserva e confirmação no material, multipart nos demais) e devolve o arquivo que subiu. */
export async function sendFile(kind: UploadKind, resourceId: string, file: File, signal: AbortSignal, onState: (text: string) => void): Promise<File> {
  // Só o arquivo otimizado sobe, e é nele que o limite de 500 KB ou 5 MB é conferido.
  if (kind !== "avatar") {
    onState("Otimizando arquivo…");
    file = await optimizeFile(file);
    if (signal.aborted) throw new Error("Envio cancelado.");
    const refused = finalLimit(file);
    if (refused) throw new Error(refused);
  }
  onState("Enviando arquivo…");
  if (kind === "material") {
    const reserved = await edge<{
      upload_id: string;
      bucket: string;
      path: string;
      expires_at: string;
    }>("upload", {
      action: "reserve",
      kind,
      resource_id: resourceId,
      file_name: file.name,
      content_type: file.type,
      size_bytes: file.size,
    });
    if (
      reserved.bucket !== "icarus-private" ||
      !reserved.path ||
      !reserved.upload_id
    )
      throw new Error("Reserva de arquivo inválida.");
    if (signal.aborted) throw new Error("Envio cancelado.");
    const { error } = await uploadStorage(signal)
      .from(reserved.bucket)
      .upload(reserved.path, file, {
        contentType: file.type,
        upsert: false,
      });
    if (error) throw error;
    if (signal.aborted) throw new Error("Envio cancelado.");
    onState("Confirmando o arquivo no servidor…");
    await edge("upload", {
      action: "finalize",
      upload_id: reserved.upload_id,
    });
  } else {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    form.append("resource_id", resourceId);
    form.append("file_name", file.name);
    form.append("content_type", file.type);
    form.append("size_bytes", String(file.size));
    const { error } = await client().functions.invoke("upload", {
      body: form,
      signal,
    });
    if (error) throw error;
  }
  // A confirmação não recebe o sinal: cancelado nesse meio, o envio não conta como concluído para quem chamou.
  if (signal.aborted) throw new Error("Envio cancelado.");
  return file;
}

export function Upload({
  kind,
  resourceId,
  onUploaded,
}: {
  kind: UploadKind;
  resourceId: string;
  onUploaded?: (file: File) => void;
}) {
  const [state, setState] = useState(""),
    [error, setError] = useState(""),
    [chosen, setChosen] = useState<File>(),
    [busy, setBusy] = useState(false),
    controller = useRef<AbortController | null>(null),
    file = useRef<HTMLInputElement>(null),
    [preview, setPreview] = useState(""),
    [crop, setCrop] = useState(50),
    cropCanvas = useRef<HTMLCanvasElement>(null),
    picked = useRef<File>(undefined),
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
      setChosen(undefined);
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
  async function upload(selected: File) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    const before = selected.size;
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
      selected = await sendFile(kind, resourceId, selected, controller.current.signal, setState);
      // Cancelado ou desmontado (a desmontagem cancela), quem usa o envio não recebe a conclusão.
      if (controller.current?.signal.aborted) throw new Error("Envio cancelado.");
      const kb = (bytes: number) => Math.round(bytes / 1024);
      setState(
        kind === "avatar"
          ? "Foto salva."
          : kb(selected.size) < kb(before)
            ? `Arquivo otimizado de ${kb(before)} KB para ${kb(selected.size)} KB e enviado.`
            : "Arquivo enviado e associado ao registro.",
      );
      if (file.current) file.current.value = "";
      setChosen(undefined);
      setPreview("");
      onUploaded?.(selected);
    } catch (err) {
      setState("");
      setError(
        controller.current?.signal.aborted
          ? "Envio cancelado. A confirmação do servidor continua necessária antes de o arquivo ficar disponível."
          : errorMessage(err),
      );
      // Sem o botão de reenviar, o arquivo sai do campo: escolher o mesmo de novo volta a disparar o envio.
      if (kind !== "avatar") {
        if (file.current) file.current.value = "";
        setChosen(undefined);
      }
    } finally {
      lock.current = false;
      setBusy(false);
      controller.current = null;
    }
  }
  async function choose(selected: File | undefined) {
    picked.current = selected;
    setChosen(selected);
    setError("");
    setState("");
    if (kind !== "avatar") {
      const refused = selected ? overLimit(selected) : null;
      if (refused) {
        setError(refused);
        if (file.current) file.current.value = "";
        setChosen(undefined);
      } else if (selected) void upload(selected);
      return;
    }
    setPreview("");
    if (!selected) return;
    const head = new Uint8Array(
      await selected.slice(0, 8).arrayBuffer().catch(() => new ArrayBuffer(0)),
    );
    // Outra escolha chegou durante a leitura: ela decide a prévia.
    if (picked.current !== selected) return;
    const tooBig = selected.size > limits.original;
    if (tooBig || !avatarSignatures[selected.type]?.every((byte, i) => head[i] === byte)) {
      setError(
        tooBig
          ? "Esta foto passa de 20 MB. Escolha uma menor, em JPG ou PNG."
          : "Escolha uma foto JPG ou PNG de até 20 MB.",
      );
      if (file.current) file.current.value = "";
      setChosen(undefined);
      return;
    }
    setPreview(URL.createObjectURL(selected));
    setCrop(50);
    setState("Foto escolhida, ainda não salva. Ajuste o recorte e clique em Salvar foto.");
  }
  return (
    <section className="upload" aria-busy={busy}>
      <Unsaved dirty={!!preview} />
      <Dropzone
        label={
          kind === "ticket-attachment"
            ? "Anexar arquivo à conversa"
            : kind === "avatar"
              ? "Foto do perfil"
              : "Enviar arquivo"
        }
        hint={hints[kind]}
        accept={
          kind === "avatar"
            ? "image/jpeg,image/png"
            : kind.includes("image") || kind === "course-cover"
            ? "image/png,image/jpeg,image/webp"
            : undefined
        }
        disabled={busy}
        fileName={chosen?.name}
        fileSize={chosen?.size}
        inputRef={file}
        onFile={(selected) => void choose(selected)}
      />
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
        {kind === "avatar" && (
          <button
            type="button"
            className="primary"
            disabled={busy || !preview}
            onClick={() => picked.current && void upload(picked.current)}
          >
            Salvar foto
          </button>
        )}
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
