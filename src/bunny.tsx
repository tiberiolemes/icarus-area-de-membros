import { useEffect, useRef, useState } from "react";
import { Notice } from "./ui";

type Player = {
  on: (event: string, callback: (data: unknown) => void) => void;
  off: (event: string, callback: (data: unknown) => void) => void;
  receive: (event: MessageEvent) => unknown;
  setCurrentTime: (seconds: number) => void;
  getCurrentTime: (callback: (seconds: number) => void) => void;
  elem: HTMLIFrameElement | null;
};
declare global {
  interface Window {
    playerjs?: {
      Player: new (element: HTMLIFrameElement) => Player;
      log: (...args: unknown[]) => void;
    };
  }
}
let loaded: Promise<void> | null = null;
function loadPlayer() {
  if (window.playerjs) return Promise.resolve();
  if (!loaded)
    loaded = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/playerjs/player-0.1.0.min.js";
      script.integrity = "sha256-SMT5kSicbUhP39YhtiLSMxeHqhWkOqJ6CBzahjZP2J4=";
      script.onload = () => {
        if (window.playerjs) {
          window.playerjs.log = () => {};
          resolve();
        } else reject(new Error("Player indisponível."));
      };
      script.onerror = () => {
        loaded = null;
        script.remove();
        reject(new Error("Não foi possível carregar o controle do player."));
      };
      document.head.append(script);
    });
  return loaded;
}
export function acceptsPlayerMessage(
  event: MessageEvent,
  iframe: HTMLIFrameElement,
  origin: string,
) {
  return event.origin === origin && event.source === iframe.contentWindow;
}
export function playerSeconds(value: unknown): number | null {
  try {
    const data = typeof value === "string" ? JSON.parse(value) : value;
    const seconds =
      typeof data === "number"
        ? data
        : (data as { seconds?: unknown })?.seconds;
    return typeof seconds === "number" &&
      Number.isFinite(seconds) &&
      seconds >= 0 &&
      seconds <= 86400
      ? seconds
      : null;
  } catch {
    return null;
  }
}
export function BunnyPlayer({
  url,
  title,
  initialPosition,
  onPosition,
  onPause,
  onSeekReady,
}: {
  url: string;
  title: string;
  initialPosition: number;
  onPosition: (seconds: number) => void;
  onPause: () => void;
  onSeekReady?: (seek: ((seconds: number) => void) | null) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    callbacks = useRef({ onPosition, onPause, onSeekReady });
  callbacks.current = { onPosition, onPause, onSeekReady };
  const origin = new URL(url).origin;
  useEffect(() => {
    let active = true;
    loadPlayer()
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active)
          setError(
            "O controle do player não foi carregado. Tente abrir a aula novamente.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const iframe = frame.current;
    if (!ready || !iframe || !window.playerjs) return;
    let active = true;
    const player = new window.playerjs.Player(iframe),
      receive = player.receive.bind(player);
    player.receive = (event) => {
      if (active && acceptsPlayerMessage(event, iframe, origin))
        return receive(event);
      return false;
    };
    const onReady = () => {
        if (!active) return;
        player.setCurrentTime(initialPosition);
        callbacks.current.onSeekReady?.((seconds) => {
          if (active && playerSeconds(seconds) !== null) player.setCurrentTime(seconds);
        });
      },
      onTime = (value: unknown) => {
        const seconds = playerSeconds(value);
        if (active && seconds !== null) callbacks.current.onPosition(seconds);
      },
      onPaused = () => {
        if (active)
          player.getCurrentTime((seconds) => {
            if (!active) return;
            const position = playerSeconds(seconds);
            if (position !== null) callbacks.current.onPosition(position);
            callbacks.current.onPause();
          });
      };
    player.on("ready", onReady);
    player.on("timeupdate", onTime);
    player.on("pause", onPaused);
    return () => {
      active = false;
      player.off("ready", onReady);
      player.off("timeupdate", onTime);
      player.off("pause", onPaused);
      player.receive = () => false;
      iframe.onload = null;
      player.elem = null;
      callbacks.current.onSeekReady?.(null);
    };
  }, [ready, url, origin]);
  if (error) return <Notice error>{error}</Notice>;
  return ready ? (
    <iframe
      ref={frame}
      src={url}
      title={title}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  ) : (
    <p role="status">Preparando controles do player…</p>
  );
}
