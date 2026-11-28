const origin = "https://www.youtube-nocookie.com";

// Escuta o fim do vídeo pela API de mensagens do iframe, sem carregar o script do YouTube.
export function watchYouTubeEnded(iframe: HTMLIFrameElement, onEnded: () => void) {
  // Sem o addEventListener, o player só manda infoDelivery (conferido no player real em 28/nov/2026).
  const listen = () => {
    iframe.contentWindow?.postMessage(JSON.stringify({ event: "listening" }), origin);
    iframe.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"] }), origin);
  };
  const receive = (event: MessageEvent) => {
    if (event.origin !== origin || event.source !== iframe.contentWindow) return;
    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data?.event === "onStateChange" && data.info === 0) onEnded();
    } catch {
      // Mensagem que não é JSON não vem do player.
    }
  };
  iframe.addEventListener("load", listen);
  window.addEventListener("message", receive);
  return () => {
    iframe.removeEventListener("load", listen);
    window.removeEventListener("message", receive);
  };
}
