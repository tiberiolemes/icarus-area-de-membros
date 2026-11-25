import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { cache } from "./api";
import { AdminPodcasts, parseChapters, parseSpotify, parseYouTube } from "./pages/admin-podcasts";
import { Podcasts } from "./pages/podcasts";

vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});

const episode = {
  id: "22000000-0000-4000-8000-000000000001",
  youtube_id: "00000000001",
  kind: "podcast",
  title: "Demonstração de catálogo",
  description: "<iframe>Descrição literal</iframe>",
  published_at: "2026-11-24T03:00:00Z",
  status: "published",
  is_featured: true,
  chapters: [{ seconds: 540, title: "Dados da demonstração" }],
  spotify_url: null,
};

function mount(path: string, fixture: (name: string, args: Record<string, unknown>) => unknown) {
  const requests: { name: string; args: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split("/").at(-1)!;
    const args = JSON.parse(String(init?.body));
    requests.push({ name, args });
    const body = fixture(name, args);
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  }));
  render(<QueryClientProvider client={cache}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/podcasts" element={<Podcasts />} />
        <Route path="/admin/podcasts/:episodio" element={<AdminPodcasts />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>);
  return requests;
}

afterEach(() => { cache.clear(); vi.unstubAllGlobals(); });

it("abre o modal com origem fixa, capítulos clicáveis e assistido persistido por RPC", async () => {
  let watched = false;
  const requests = mount("/app/podcasts", (name, args) => {
    switch (name) {
      case "app_podcasts": return { items: [{ ...episode, watched }], featured_id: episode.id, page: 1, page_size: 20, total: 1 };
      case "app_podcast": return { ...episode, watched };
      case "app_podcast_watch": watched = args.p_watched === true; return { watched };
      default: throw new Error(name);
    }
  });
  const trigger = await screen.findByRole("button", { name: "Assistir episódio" });
  expect(screen.queryByTitle(/Vídeo do YouTube/)).toBeNull();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  const player = await within(dialog).findByTitle(/Vídeo do YouTube/);
  expect(within(dialog).getByRole("button", { name: "Fechar" })).toHaveFocus();
  expect(player).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/00000000001?start=0&autoplay=0");
  expect(within(dialog).getByText(episode.description)).toBeVisible();
  expect(within(dialog).queryByRole("link", { name: /Spotify/ })).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: /09:00 Dados/ }));
  expect(within(dialog).getByTitle(/Vídeo do YouTube/)).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/00000000001?start=540&autoplay=1");
  fireEvent.click(within(dialog).getByRole("button", { name: "Marcar como assistido" }));
  expect(await within(dialog).findByRole("button", { name: "Desmarcar como assistido" })).toBeVisible();
  expect(requests).toContainEqual({ name: "app_podcast_watch", args: { p_id: episode.id, p_watched: true } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.getByRole("button", { name: /Assistir Demonstração de catálogo · Assistido/ })).toBeVisible();
});

it("envia o cadastro por AJAX com campos normalizados e abre a edição após sucesso", async () => {
  const requests = mount("/admin/podcasts/novo", (name) => {
    if (name === "app_admin_save_podcast") return { id: episode.id };
    if (name === "app_podcast") return { ...episode, status: "draft", watched: false };
    throw new Error(name);
  });
  fireEvent.input(screen.getByLabelText("URL do vídeo no YouTube"), { target: { value: "https://youtu.be/00000000001?si=not-saved" } });
  fireEvent.input(screen.getByLabelText("Título"), { target: { value: "  Demonstração  " } });
  fireEvent.input(screen.getByLabelText("Data do episódio"), { target: { value: "2026-11-24" } });
  fireEvent.input(screen.getByLabelText("Capítulos"), { target: { value: "09:00 Dados" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar episódio" }));
  expect(await screen.findByRole("heading", { name: "Editar episódio" })).toBeVisible();
  expect(await screen.findByText("Episódio cadastrado.")).toBeVisible();
  expect(requests[0]).toMatchObject({
    name: "app_admin_save_podcast",
    args: { p_youtube_id: "00000000001", p_title: "Demonstração", p_published_at: "2026-11-24T00:00:00-03:00",
      p_status: "draft", p_is_featured: false, p_chapters: [{ seconds: 540, title: "Dados" }] },
  });
});

it("rejeita origens, credenciais, embeds e timestamps inválidos", () => {
  expect(parseYouTube("https://www.youtube.com/watch?v=00000000001")).toBe("00000000001");
  expect(parseYouTube("https://www.youtube.com/live/00000000001")).toBe("00000000001");
  for (const input of [
    "https://www.youtube.com.evil.test/watch?v=00000000001",
    "https://user@youtu.be/00000000001",
    "https://www.youtube.com/embed/00000000001",
    "https://www.youtube.com/watch?v=00000000001&v=00000000002",
    '<iframe src="https://youtube.com/embed/00000000001">',
  ]) expect(parseYouTube(input)).toBeNull();
  expect(parseSpotify("https://open.spotify.com/episode/0000000000000000000001?si=x")).toBe("https://open.spotify.com/episode/0000000000000000000001");
  expect(parseSpotify("https://open.spotify.com.evil.test/episode/0000000000000000000001")).toBeNull();
  expect(() => parseChapters("00:45 A\n00:30 B")).toThrow("Confira o capítulo 2");
  expect(() => parseChapters("09:60 A")).toThrow("Confira o capítulo 1");
});
