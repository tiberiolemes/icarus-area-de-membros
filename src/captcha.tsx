import { useEffect, useRef, useState } from "react";
import { Notice } from "./ui";

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: Turnstile }
}

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
// Sem chave configurada (local, testes, demonstração) o formulário segue sem desafio; o Auth só exige o token se o CAPTCHA estiver ligado no projeto.
export const captchaEnabled = !!siteKey && import.meta.env.MODE !== "demo";
const field = "captcha_token";
const widgets = new Set<string>();
let loader: Promise<void> | undefined;

function load() {
  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = undefined;
      script.remove();
      reject(new Error("turnstile"));
    };
    document.head.append(script);
  });
  return loader;
}

export function Captcha() {
  const box = useRef<HTMLDivElement>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!captchaEnabled) return;
    let id: string | undefined, active = true;
    load().then(() => {
      if (!active || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, {
        sitekey: siteKey,
        language: "pt-br",
        theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
        "response-field-name": field,
      });
      widgets.add(id);
    }).catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (id) {
        widgets.delete(id);
        window.turnstile?.remove(id);
      }
    };
  }, []);
  if (!captchaEnabled) return null;
  return failed
    ? <Notice error>Não foi possível carregar a verificação de segurança. Confira sua conexão e recarregue a página.</Notice>
    : <div ref={box} className="captcha" />;
}

/** Token do desafio para o Supabase Auth; recusa o envio antes da rede quando o desafio ainda não foi resolvido. */
export function captchaToken(data: FormData) {
  if (!captchaEnabled) return undefined;
  const token = String(data.get(field) ?? "");
  if (!token) throw new Error("Conclua a verificação de segurança e tente novamente. Se ela não aparecer, recarregue a página.");
  return token;
}

/** O token vale uma vez: renova o desafio depois de cada tentativa. */
export function resetCaptcha() {
  widgets.forEach((id) => window.turnstile?.reset(id));
}
