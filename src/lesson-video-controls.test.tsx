import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LessonVideoControls } from "./lesson-video-controls";

function media() {
  const frame = document.createElement("div");
  const video = document.createElement("video");
  frame.append(video);
  document.body.append(frame);
  video.controls = true;
  const tracks = Object.assign(new EventTarget(), { length: 0 }) as TextTrackList;
  const fake = {
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    time: 0,
    duration: NaN,
    paused: true,
    seekable: [] as [number, number][],
    error: null as MediaError | null,
  };
  Object.defineProperties(video, {
    readyState: { get: () => fake.readyState },
    videoWidth: { get: () => fake.videoWidth },
    videoHeight: { get: () => fake.videoHeight },
    currentTime: { get: () => fake.time, set: (time) => { fake.time = time; } },
    duration: { get: () => fake.duration },
    paused: { get: () => fake.paused },
    seekable: { get: () => ({
      length: fake.seekable.length,
      start: (index: number) => fake.seekable[index][0],
      end: (index: number) => fake.seekable[index][1],
    }) },
    textTracks: { value: tracks },
    error: { get: () => fake.error },
  });
  const notify = (event: string) => fireEvent(video, new Event(event));
  const load = () => {
    Object.assign(fake, { readyState: 1, videoWidth: 640, videoHeight: 360, duration: 125.5, seekable: [[0, 125.5]] });
    notify("loadedmetadata");
  };
  const play = vi.spyOn(video, "play").mockImplementation(async () => {
    fake.paused = false;
    notify("play");
  });
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {
    fake.paused = true;
    notify("pause");
  });
  return { video, frame, fake, tracks, play, pause, load, notify };
}

describe("LessonVideoControls", () => {
  it("keeps the forward icon visible during font loading and treats the local glyph as decorative", async () => {
    const { video, frame, load } = media();
    let finishLoading!: (faces: unknown[]) => void;
    const loadFont = vi.fn(() => new Promise((resolve) => { finishLoading = resolve; }));
    const previous = Object.getOwnPropertyDescriptor(document, "fonts");
    Object.defineProperty(document, "fonts", { configurable: true, value: { load: loadFont } });
    const view = render(<LessonVideoControls video={video} />);
    try {
      load();
      const forward = screen.getByRole("button", { name: "Avançar 10 segundos" });
      expect(forward.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(loadFont).toHaveBeenCalledWith('400 20px "Material Symbols Outlined"', "\ue056");

      await act(async () => { finishLoading([{}]); });
      expect(forward.querySelector("svg")).toBeNull();
      expect(forward.querySelector(".stitch-icon")).toHaveAttribute("aria-hidden", "true");
      expect(forward).toHaveAccessibleName("Avançar 10 segundos");
      fireEvent.click(forward);
      expect(video.currentTime).toBe(10);
    } finally {
      view.unmount();
      if (previous) Object.defineProperty(document, "fonts", previous);
      else Reflect.deleteProperty(document, "fonts");
      frame.remove();
    }
  });

  it("keeps native controls until metadata, then hands off focus and follows playback events", () => {
    const { video, frame, fake, load, notify, play, pause } = media();
    const view = render(<LessonVideoControls video={video} />);
    expect(video.controls).toBe(true);
    expect(screen.queryByRole("group", { name: "Controles do vídeo" })).toBeNull();

    load();
    expect(video.controls).toBe(false);
    const [center, bar] = screen.getAllByRole("button", { name: "Reproduzir vídeo" });
    center.focus();
    fireEvent.click(center);
    expect(play).toHaveBeenCalledOnce();
    expect(bar).toHaveFocus();
    expect(screen.getByRole("button", { name: "Pausar vídeo" })).toBe(bar);
    fireEvent.click(bar);
    expect(pause).toHaveBeenCalledOnce();

    fake.time = 64;
    notify("timeupdate");
    expect(screen.getByText("01:04 /").parentElement).toHaveTextContent("01:04 / 02:05");
    const seek = screen.getByRole("slider", { name: "Posição do vídeo" });
    expect(seek).toHaveAttribute("aria-valuetext", "01:04 de 02:05");
    fireEvent.change(seek, { target: { value: "118.25" } });
    expect(video.currentTime).toBe(118.25);
    fireEvent.click(screen.getByRole("button", { name: "Avançar 10 segundos" }));
    expect(video.currentTime).toBe(125.5);

    view.unmount();
    expect(video.controls).toBe(true);
    frame.remove();
  });

  it("uses actual seekable ranges and restores native controls after a media error or replacement", () => {
    const first = media();
    const second = media();
    const { rerender, unmount } = render(<LessonVideoControls video={first.video} />);
    first.load();
    first.fake.seekable = [[0, 10], [25, 50]];
    first.fake.time = 8;
    first.notify("progress");
    const seek = screen.getByRole("slider", { name: "Posição do vídeo" });
    fireEvent.change(seek, { target: { value: "20" } });
    expect(first.video.currentTime).toBe(25);
    first.fake.seekable = [];
    first.notify("progress");
    expect(seek).toBeDisabled();

    first.fake.error = { code: 4, message: "Synthetic error" } as MediaError;
    first.notify("error");
    expect(first.video.controls).toBe(true);
    expect(seek).not.toBeInTheDocument();
    rerender(<LessonVideoControls video={second.video} />);
    second.load();
    expect(second.video.controls).toBe(false);
    first.notify("loadedmetadata");
    expect(first.video.controls).toBe(true);
    expect(screen.getByRole("slider", { name: "Posição do vídeo" })).toBeEnabled();
    unmount();
    first.frame.remove();
    second.frame.remove();
  });

  it("updates real volume and speed and exposes only actual caption tracks and capabilities", async () => {
    const { video, frame, tracks, load, notify } = media();
    render(<LessonVideoControls video={video} />);
    load();
    expect(screen.queryByRole("combobox", { name: "Legendas" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tela cheia" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Picture-in-Picture" })).toBeNull();

    video.volume = 0.75;
    notify("volumechange");
    const volume = screen.getByRole("slider", { name: "Volume do vídeo" });
    expect(volume).toHaveAttribute("aria-valuetext", "75%");
    fireEvent.click(screen.getByRole("button", { name: "Silenciar vídeo" }));
    expect(video.muted).toBe(true);
    await waitFor(() => expect(volume).toHaveAttribute("aria-valuetext", "0%"));
    fireEvent.change(volume, { target: { value: "0.4" } });
    expect(video.volume).toBe(0.4);
    expect(video.muted).toBe(false);

    const speed = screen.getByRole("combobox", { name: "Velocidade de reprodução" });
    fireEvent.change(speed, { target: { value: "1.25" } });
    expect(video.playbackRate).toBe(1.25);
    await waitFor(() => expect(speed).toHaveValue("1.25"));

    const captions = { kind: "captions", label: "Português", mode: "disabled" };
    const chapters = { kind: "chapters", label: "Capítulos", mode: "disabled" };
    const missing = { kind: "subtitles", label: "Sem arquivo", mode: "disabled" };
    const invalidTrack = document.createElement("track");
    Object.defineProperty(invalidTrack, "track", { value: missing });
    video.append(invalidTrack);
    Object.assign(tracks, { 0: captions, 1: chapters, 2: missing, length: 3 });
    act(() => { tracks.dispatchEvent(new Event("addtrack")); });
    const subtitles = screen.getByRole("combobox", { name: "Legendas" });
    expect(screen.getByRole("option", { name: "Português" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Capítulos" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Sem arquivo" })).toBeNull();
    fireEvent.change(subtitles, { target: { value: "0" } });
    expect(captions.mode).toBe("showing");
    act(() => { tracks.dispatchEvent(new Event("change")); });
    fireEvent.change(subtitles, { target: { value: "-1" } });
    expect(captions.mode).toBe("disabled");
    frame.remove();
  });

  it("reports rejected playback and preserves the paused state", async () => {
    const { video, frame, play, load } = media();
    render(<LessonVideoControls video={video} />);
    load();
    play.mockRejectedValueOnce(new DOMException("Synthetic refusal", "NotAllowedError"));
    fireEvent.click(screen.getAllByRole("button", { name: "Reproduzir vídeo" })[0]);
    expect(await screen.findByText("Não foi possível reproduzir o vídeo. Tente novamente.")).toHaveAttribute("role", "status");
    expect(screen.getAllByRole("button", { name: "Reproduzir vídeo" })).toHaveLength(2);
    frame.remove();
  });

  it("shows only the decoded resolution and updates it when the video changes size", () => {
    const { video, frame, fake, load, notify } = media();
    render(<LessonVideoControls video={video} />);
    expect(screen.queryByText(/\d+p/)).toBeNull();
    load();
    expect(screen.getByText("360p")).toHaveAttribute("title", "Resolução do vídeo: 640 × 360 pixels");
    expect(screen.queryByRole("combobox", { name: /qualidade|resolução/i })).toBeNull();
    Object.assign(fake, { videoWidth: 1920, videoHeight: 1080 });
    notify("resize");
    expect(screen.getByText("1080p")).toHaveAttribute("title", "Resolução do vídeo: 1920 × 1080 pixels");
    expect(screen.queryByText("360p")).toBeNull();
    frame.remove();
  });
});
