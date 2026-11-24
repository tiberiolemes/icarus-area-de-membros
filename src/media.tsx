import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { edge, errorMessage, safeUrl } from "./api";

type ImageKind = "post-image" | "course-cover" | "avatar" | "feedback-screenshot";

export function usePrivateImageQuery(kind: ImageKind, id: string) {
  return useQuery({
    queryKey: ["media", kind, id],
    queryFn: () =>
      edge<{ url: string; expires_at: string }>("media", { kind, id }),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
}

export function PrivateImage({
  kind,
  id,
  alt = "",
  className = "",
}: {
  kind: ImageKind;
  id: string;
  alt?: string;
  className?: string;
}) {
  const retried = useRef(false),
    query = usePrivateImageQuery(kind, id);
  return query.isPending ? (
    <div className={className} role="status" aria-label="Carregando imagem" />
  ) : query.error ? (
    <span className="media-error">
      {errorMessage(query.error)}{" "}
      <button onClick={() => query.refetch()}>Carregar imagem</button>
    </span>
  ) : safeUrl(query.data?.url) ? (
    <img
      className={className}
      src={safeUrl(query.data?.url)}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!retried.current) {
          retried.current = true;
          void query.refetch();
        }
      }}
    />
  ) : null;
}
