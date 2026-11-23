import { safeUrl, downloadBlob } from "./api";
import type { Certificate } from "./api";

export async function certificateCanvas(certificate: Certificate) {
  if (certificate.revoked_at)
    throw new Error(
      "Este certificado foi revogado e não pode ser exportado como válido.",
    );
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1120;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error(
      "Seu navegador não permite gerar o arquivo. Tente outro navegador.",
    );
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, 1600, 1120);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 56, 1488, 1008);
  const logo = new Image();
  logo.src = "/brand/icarus-horizontal-preto.svg";
  await logo.decode();
  ctx.drawImage(logo, 100, 96, 305, 80);
  ctx.fillStyle = "#000000";
  ctx.font = "500 24px Inter";
  ctx.fillText(
    certificate.demo
      ? "DEMONSTRAÇÃO · SEM VALIDADE ACADÊMICA"
      : "CERTIFICADO DE CONCLUSÃO",
    100,
    248,
  );
  ctx.font = "600 44px Inter";
  wrap(ctx, certificate.student_name, 100, 350, 1370, 54);
  ctx.font = "400 26px Inter";
  ctx.fillText("Concluiu o curso", 100, 490);
  ctx.font = "600 40px Inter";
  wrap(ctx, certificate.course_title, 100, 560, 1370, 54);
  ctx.font = "400 24px Inter";
  ctx.fillText(
    `Carga horária: ${certificate.duration_minutes} minutos`,
    100,
    760,
  );
  ctx.fillText(
    `Emitido em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(certificate.issued_at))}`,
    100,
    804,
  );
  if (certificate.signature_url) {
    const url = safeUrl(certificate.signature_url);
    if (!url)
      throw new Error(
        "A assinatura do certificado tem um endereço inválido. Consulte a academia.",
      );
    const signature = new Image();
    signature.crossOrigin = "anonymous";
    signature.src = url;
    try {
      await signature.decode();
      const ratio = Math.min(220 / signature.width, 70 / signature.height);
      ctx.drawImage(
        signature,
        100,
        840,
        signature.width * ratio,
        signature.height * ratio,
      );
    } catch {
      throw new Error(
        "Não foi possível carregar a assinatura para exportar o certificado. Tente novamente ou consulte a academia.",
      );
    }
  }
  if (certificate.signer_name) {
    ctx.font = "600 26px Inter";
    ctx.fillText(certificate.signer_name, 100, 932);
    ctx.font = "400 22px Inter";
    ctx.fillText(certificate.signer_title ?? "", 100, 966);
  }
  ctx.font = "400 18px Inter";
  ctx.fillText(`Código de verificação: ${certificate.code}`, 100, 1002);
  ctx.fillText(
    `${location.origin}/verificar/${encodeURIComponent(certificate.code)}`,
    100,
    1036,
  );
  return canvas;
}
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
) {
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? line + " " + word : word;
    if (ctx.measureText(candidate).width > width && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else line = candidate;
  }
  ctx.fillText(line, x, y);
}
export function pdfWithImage(
  jpeg: Uint8Array,
  width: number,
  height: number,
): Blob {
  const encoder = new TextEncoder(),
    parts: Uint8Array[] = [],
    offsets = [0];
  let size = 0;
  const append = (text: string | Uint8Array) => {
    const bytes = typeof text === "string" ? encoder.encode(text) : text;
    parts.push(bytes);
    size += bytes.length;
  };
  append("%PDF-1.4\n");
  const object = (id: number, body: string) => {
    offsets[id] = size;
    append(`${id} 0 obj\n${body}\nendobj\n`);
  };
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 560] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  offsets[4] = size;
  append(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  append(jpeg);
  append("\nendstream\nendobj\n");
  const commands = "q 800 0 0 560 0 0 cm /Im0 Do Q";
  object(
    5,
    `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}\nendstream`,
  );
  const xref = size;
  append("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++)
    append(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}
export async function exportCertificate(
  certificate: Certificate,
  format: "png" | "pdf",
) {
  const canvas = await certificateCanvas(certificate);
  if (format === "png") {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Não foi possível gerar o PNG.")),
        "image/png",
      ),
    );
    downloadBlob(blob, `certificado-${certificate.code}.png`);
  } else {
    const encoded = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
    const binary = atob(encoded),
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    downloadBlob(
      pdfWithImage(bytes, canvas.width, canvas.height),
      `certificado-${certificate.code}.pdf`,
    );
  }
}
