import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("captcha", () => {
  it("fica desligado sem chave do site", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    const { captchaEnabled, captchaToken } = await import("./captcha");
    expect(captchaEnabled).toBe(false);
    expect(captchaToken(new FormData())).toBeUndefined();
  });

  it("exige o token do desafio quando a chave existe", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "0x4AAAAAAA-teste");
    const { captchaEnabled, captchaToken } = await import("./captcha");
    expect(captchaEnabled).toBe(true);
    expect(() => captchaToken(new FormData())).toThrow("verificação de segurança");
    const data = new FormData();
    data.set("captcha_token", "token-do-desafio");
    expect(captchaToken(data)).toBe("token-do-desafio");
  });
});
