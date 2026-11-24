import { act, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BunnyPlayer } from "./bunny";

it("expõe o retorno ao ponto da anotação após o player estar pronto e invalida na desmontagem", async () => {
  const listeners = new Map<string, () => void>();
  const setCurrentTime = vi.fn();
  const onSeekReady = vi.fn<(seek: ((seconds: number) => void) | null) => void>();
  vi.stubGlobal("playerjs", {
    Player: class {
      on = (event: string, handler: () => void) => listeners.set(event, handler);
      off = (event: string) => listeners.delete(event);
      receive = vi.fn();
      setCurrentTime = setCurrentTime;
    },
  });
  try {
    const { unmount } = render(
      <BunnyPlayer
        url="https://player.mediadelivery.net/embed/1/video"
        title="Aula de teste"
        initialPosition={14}
        onPosition={vi.fn()}
        onPause={vi.fn()}
        onSeekReady={onSeekReady}
      />,
    );
    await screen.findByTitle("Aula de teste");
    await waitFor(() => expect(listeners.has("ready")).toBe(true));
    expect(onSeekReady).not.toHaveBeenCalled();
    act(() => listeners.get("ready")?.());
    expect(setCurrentTime).toHaveBeenCalledWith(14);
    const seek = onSeekReady.mock.calls[0][0]!;
    seek(Infinity);
    seek(37.5);
    expect(setCurrentTime.mock.calls).toEqual([[14], [37.5]]);
    unmount();
    expect(onSeekReady).toHaveBeenLastCalledWith(null);
    seek(22);
    expect(setCurrentTime).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
