import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { StitchIcon } from "./stitch-icon";
import "./lesson-video-controls.css";

type Video = HTMLVideoElement & {
  webkitDisplayingFullscreen?: boolean;
  webkitSupportsFullscreen?: boolean;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};

export type LessonVideoControlsProps = {
  /** Pass the video via a callback ref. The positioned player frame must contain both siblings. */
  video: HTMLVideoElement | null;
};

const icons = {
  play: "M8 5v14l11-7z",
  playOutline: "M8 5v14l11-7zm2 3.65L15.25 12 10 15.35z",
  pause: "M6 5h4v14H6zm8 0h4v14h-4z",
  forward: "M18 13a6 6 0 1 1-6-6v3l4-4-4-4v3a8 8 0 1 0 8 8zM9 11h1v5H9v-4H8v-1zm4 0h2a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1zm0 1v3h2v-3z",
  volume: "M3 9v6h4l5 5V4L7 9zm11 0v6a3.35 3.35 0 0 0 0-6zm0-5v2a6.25 6.25 0 0 1 0 12v2a8.2 8.2 0 0 0 0-16z",
  mute: "M3 9v6h4l5 5V4L7 9zm12.4-.4L14 10l2 2-2 2 1.4 1.4 2-2 2 2 1.4-1.4-2-2 2-2-1.4-1.4-2 2z",
  subtitles: "M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v12h16V6zm2 5h2v2H6zm4 0h8v2h-8zm-4 4h8v2H6zm10 0h2v2h-2z",
  picture: "M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v12h16V6zm7 5h8v6h-8zm2 2v2h4v-2z",
  fullscreen: "M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z",
  exitFullscreen: "M9 5h2v6H5V9h4zm4 0h2v4h4v2h-6zM5 13h6v6H9v-4H5zm8 0h6v2h-4v4h-2z",
};

function Icon({ name }: { name: keyof typeof icons }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" fillRule="evenodd" d={icons[name]} /></svg>;
}

const rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const mediaEvents = [
  "loadstart", "loadedmetadata", "loadeddata", "durationchange", "timeupdate",
  "play", "pause", "ended", "progress", "seeking", "seeked", "volumechange",
  "ratechange", "emptied", "error", "load", "resize", "enterpictureinpicture",
  "leavepictureinpicture", "webkitbeginfullscreen", "webkitendfullscreen",
];
const trackEvents = ["addtrack", "removetrack", "change"];

function readVideo(video: Video, frame: HTMLElement) {
  const document = video.ownerDocument;
  const elements = Array.from(video.querySelectorAll("track"));
  const tracks = Array.from(video.textTracks).filter((track) => {
    if (track.kind !== "captions" && track.kind !== "subtitles") return false;
    const element = elements.find((item) => item.track === track);
    return !element || (!!element.getAttribute("src")?.trim() && element.readyState !== element.ERROR);
  });
  return {
    video,
    source: video.currentSrc,
    ready: video.readyState >= 1 && video.videoWidth > 0 && !video.error && !video.webkitDisplayingFullscreen,
    paused: video.paused || video.ended,
    time: video.currentTime,
    duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0,
    canSeek: video.seekable.length > 0,
    width: video.videoWidth,
    height: video.videoHeight,
    volume: video.muted ? 0 : video.volume,
    rate: video.playbackRate,
    tracks,
    caption: tracks.findIndex((track) => track.mode === "showing"),
    fullscreen: document.fullscreenElement === frame,
    canFullscreen: Boolean((document.fullscreenEnabled && typeof frame.requestFullscreen === "function") ||
      (video.webkitSupportsFullscreen && video.webkitEnterFullscreen)),
    picture: document.pictureInPictureElement === video,
    canPicture: Boolean(document.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function" &&
      !video.disablePictureInPicture),
  };
}

function clock(seconds: number) {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const suffix = String(whole % 60).padStart(2, "0");
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${suffix}`
    : `${String(minutes).padStart(2, "0")}:${suffix}`;
}

function seek(video: HTMLVideoElement, seconds: number) {
  const ranges = video.seekable;
  let closest = video.currentTime;
  let distance = Infinity;
  for (let index = 0; index < ranges.length; index++) {
    const candidate = Math.max(ranges.start(index), Math.min(seconds, ranges.end(index)));
    if (Math.abs(seconds - candidate) < distance) {
      closest = candidate;
      distance = Math.abs(seconds - candidate);
    }
  }
  if (distance < Infinity) video.currentTime = closest;
}

function fill(ratio: number): CSSProperties {
  return { "--lesson-video-fill": `${ratio * 100}%` } as CSSProperties;
}

export function LessonVideoControls({ video }: LessonVideoControlsProps) {
  const centerPlay = useRef<HTMLButtonElement>(null);
  const barPlay = useRef<HTMLButtonElement>(null);
  const restorePlayFocus = useRef(false);
  const [view, setView] = useState<ReturnType<typeof readVideo> | null>(null);
  const [failure, setFailure] = useState<{ video: Video; source: string; message: string } | null>(null);

  useEffect(() => {
    const frame = video?.parentElement;
    if (!video || !frame) return;
    const nativeControls = video.controls;
    const sync = (event?: Event) => {
      if (event?.type === "loadstart" && event.target === video) setFailure(null);
      const next = readVideo(video, frame);
      const focused = video.ownerDocument.activeElement;
      if (next.ready && (next.paused ? focused === barPlay.current : focused === centerPlay.current)) {
        restorePlayFocus.current = true;
      }
      video.controls = !next.ready;
      setView(next);
    };
    sync();
    for (const event of mediaEvents) video.addEventListener(event, sync, true);
    for (const event of trackEvents) video.textTracks.addEventListener(event, sync);
    video.ownerDocument.addEventListener("fullscreenchange", sync);
    return () => {
      for (const event of mediaEvents) video.removeEventListener(event, sync, true);
      for (const event of trackEvents) video.textTracks.removeEventListener(event, sync);
      video.ownerDocument.removeEventListener("fullscreenchange", sync);
      video.controls = nativeControls;
    };
  }, [video]);

  useLayoutEffect(() => {
    if (!restorePlayFocus.current) return;
    restorePlayFocus.current = false;
    const button = barPlay.current;
    if (!button) return;
    if (button.ownerDocument.defaultView?.getComputedStyle(button).display === "none") {
      centerPlay.current?.focus();
    } else {
      button.focus();
    }
  }, [view]);

  if (!video || view?.video !== video || !view.ready) return null;

  const media: Video = video;
  const document = media.ownerDocument;
  const frame = media.parentElement!;
  const canSeek = view.duration > 0 && view.canSeek;
  const time = view.duration ? Math.min(view.time, view.duration) : view.time;
  const playLabel = view.paused ? "Reproduzir vídeo" : "Pausar vídeo";
  const muteLabel = view.volume ? "Silenciar vídeo" : "Ativar som do vídeo";
  const fullLabel = view.fullscreen ? "Sair da tela cheia" : "Tela cheia";
  const pictureLabel = view.picture ? "Sair do Picture-in-Picture" : "Picture-in-Picture";
  const rateLabel = `${Number(view.rate.toFixed(2))}x`;
  const error = failure?.video === media && failure?.source === view.source ? failure.message : "";

  async function attempt(message: string, action: () => unknown) {
    setFailure(null);
    const source = media.currentSrc;
    try {
      await action();
    } catch {
      setFailure({ video: media, source, message });
    }
  }

  function togglePlay() {
    void attempt("Não foi possível reproduzir o vídeo. Tente novamente.", () =>
      media.paused || media.ended ? media.play() : media.pause()
    );
  }

  function toggleFullscreen() {
    void attempt("Não foi possível alternar a tela cheia.", () => {
      if (document.fullscreenElement === frame) return document.exitFullscreen();
      if (document.fullscreenEnabled && typeof frame.requestFullscreen === "function") return frame.requestFullscreen();
      if (media.webkitDisplayingFullscreen) return media.webkitExitFullscreen?.();
      return media.webkitEnterFullscreen?.();
    });
  }

  return (
    <div className="lesson-video-controls" role="group" aria-label="Controles do vídeo">
      <span className="stitch-lesson-mobile lesson-video-controls__source">
        VÍDEO {view.height > 0 && <>• {view.height}p{view.height >= 720 ? " HD" : ""}</>}
      </span>
      {view.paused && (
        <div className="lesson-video-controls__ambient">
          <button ref={centerPlay} type="button" aria-label={playLabel} onClick={togglePlay}>
            <Icon name="play" />
          </button>
        </div>
      )}
      <div className="lesson-video-controls__bar">
        <span className="stitch-lesson-mobile lesson-video-controls__mobile-clock" aria-hidden="true">
          <span>{clock(time)}</span>
          <span className="stitch-lesson-dark-label">/</span>
          <span>{view.duration ? clock(view.duration) : "—"}</span>
        </span>
        <div className="lesson-video-controls__timeline" style={fill(view.duration ? time / view.duration : 0)}>
          <span className="lesson-video-controls__track" aria-hidden="true" />
          <input type="range" min={0} max={view.duration} step="any" value={view.duration ? time : 0}
            disabled={!canSeek} aria-label="Posição do vídeo"
            aria-valuetext={view.duration ? `${clock(time)} de ${clock(view.duration)}` : undefined}
            onChange={(event) => seek(media, event.currentTarget.valueAsNumber)} />
        </div>
        <div className="lesson-video-controls__row">
          <div className="lesson-video-controls__left">
            <button ref={barPlay} type="button" aria-label={playLabel} onClick={togglePlay}>
              <Icon name={view.paused ? "playOutline" : "pause"} />
            </button>
            <button type="button" aria-label="Avançar 10 segundos" title="Avançar 10 segundos" disabled={!canSeek}
              onClick={() => seek(media, media.currentTime + 10)}>
              <StitchIcon name="forward_10" fallback={<Icon name="forward" />} />
            </button>
            <div className="lesson-video-controls__volume">
              <button type="button" aria-label={muteLabel} title={muteLabel} onClick={(event) => {
                event.currentTarget.focus();
                media.muted = view.volume > 0;
                if (!media.muted && media.volume === 0) media.volume = 1;
              }}>
                <Icon name={view.volume ? "volume" : "mute"} />
              </button>
              <div className="lesson-video-controls__volume-range" style={fill(view.volume)}>
                <span className="lesson-video-controls__track" aria-hidden="true" />
                <input type="range" aria-label="Volume do vídeo" min={0} max={1} step={0.05}
                  value={view.volume} aria-valuetext={`${Math.round(view.volume * 100)}%`}
                  onChange={(event) => {
                    media.volume = event.currentTarget.valueAsNumber;
                    media.muted = false;
                  }} />
              </div>
            </div>
            <span className="lesson-video-controls__time">
              <span>{clock(time)} /</span>{" "}<span>{view.duration ? clock(view.duration) : "—"}</span>
            </span>
          </div>
          <div className="lesson-video-controls__right">
            <label className="lesson-video-controls__select lesson-video-controls__rate">
              <span aria-hidden="true">{rateLabel}</span>
              <select aria-label="Velocidade de reprodução" value={view.rate}
                onChange={(event) => {
                  const rate = Number(event.currentTarget.value);
                  void attempt("Esta velocidade de reprodução está indisponível.", () => {
                    media.playbackRate = rate;
                  });
                }}>
                {!rates.includes(view.rate) && <option value={view.rate}>{rateLabel}</option>}
                {rates.map((rate) => <option key={rate} value={rate}>{rate}x</option>)}
              </select>
            </label>
            {view.width > 0 && view.height > 0 && (
              <span className="lesson-video-controls__resolution"
                title={`Resolução do vídeo: ${view.width} × ${view.height} pixels`}>
                {view.height}p
              </span>
            )}
            {view.tracks.length > 0 && (
              <label className="lesson-video-controls__select lesson-video-controls__captions"
                data-active={view.caption >= 0}>
                <Icon name="subtitles" />
                <select aria-label="Legendas" value={view.caption} onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  view.tracks.forEach((track, index) => {
                    track.mode = index === next ? "showing" : "disabled";
                  });
                }}>
                  <option value={-1}>Desativadas</option>
                  {view.tracks.map((track, index) => (
                    <option key={index} value={index}>
                      {track.label || track.language || `Faixa ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {view.canPicture && (
              <button type="button" aria-label={pictureLabel} title={pictureLabel} onClick={() => {
                void attempt("Não foi possível alternar o Picture-in-Picture.", () =>
                  document.pictureInPictureElement === media
                    ? document.exitPictureInPicture()
                    : media.requestPictureInPicture()
                );
              }}><Icon name="picture" /></button>
            )}
            {view.canFullscreen && (
              <button type="button" aria-label={fullLabel} title={fullLabel} onClick={toggleFullscreen}>
                <Icon name={view.fullscreen ? "exitFullscreen" : "fullscreen"} />
              </button>
            )}
          </div>
        </div>
        <span className="lesson-video-controls__feedback" role="status">{error}</span>
      </div>
    </div>
  );
}
