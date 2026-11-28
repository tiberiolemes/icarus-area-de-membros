import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { edge } from "../api";
import { Empty, Modal, Pager, QueryState, Search } from "../ui";

type BunnyVideo = { id: string; title: string; length: number; ready: boolean };
const two = (part: number) => String(part).padStart(2, "0");
/** 754 segundos viram 12:34; com uma hora ou mais, as horas vêm na frente. */
const clock = (seconds: number) => {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), rest = seconds % 60;
  return hours ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`;
};

export function BunnyPicker({ onPick }: { onPick: (video: { id: string; length: number }) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const videos = useQuery({
    queryKey: ["bunny-videos", query, page],
    queryFn: () => edge<{ items: BunnyVideo[]; total: number; page: number }>("capabilities", { action: "bunny-videos", query, page }),
    enabled: open,
  });
  return (
    <Modal
      title="Buscar vídeo no Bunny"
      description="Busque pelo título e escolha o vídeo desta aula."
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button">
          <SearchIcon size={18} aria-hidden="true" />
          Buscar no Bunny
        </button>
      }
    >
      {/* No React o modal fica dentro do formulário da aula: a busca não pode salvar a aula nem marcar alteração. */}
      <div onSubmit={(event) => event.stopPropagation()} onInput={(event) => event.stopPropagation()}>
        <Search
          variant="stitch"
          label="Buscar vídeo pelo título"
          placeholder="Título do vídeo"
          initial={query}
          onSearch={(text) => {
            setQuery(text);
            setPage(1);
          }}
        />
        <QueryState query={videos}>
          {videos.data &&
            (videos.data.items.length ? (
              // Mesmo desenho de linha dos materiais da aula: título, detalhe e ação.
              <ul className="lesson-materials-list">
                {videos.data.items.map((video) => (
                  <li key={video.id}>
                    <div>
                      <strong>{video.title || "Vídeo sem título"}</strong>
                      <span>
                        {[video.length > 0 && clock(video.length), !video.ready && "Processando"].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onPick({ id: video.id, length: video.length });
                        setOpen(false);
                      }}
                    >
                      Usar este vídeo <span className="sr-only">{video.title || "Vídeo sem título"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{query ? "Nenhum vídeo encontrado para essa busca." : "Nenhum vídeo encontrado na biblioteca."}</Empty>
            ))}
          {videos.data && (videos.data.total > 20 || page > 1) && (
            <Pager label="Páginas de vídeos" page={page} total={videos.data.total} onChange={setPage} />
          )}
        </QueryState>
      </div>
    </Modal>
  );
}
