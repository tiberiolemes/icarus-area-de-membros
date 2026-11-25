import { expect, it, vi } from "vitest";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { errorMessage } from "./api";

it.each([
  [{ code: "PGRST000", message: "Could not connect with the database" }, "O servidor não respondeu agora. Tente novamente em instantes."],
  [{ code: "PGRST003", message: "Timed out acquiring connection" }, "O servidor não respondeu agora. Tente novamente em instantes."],
  [{ name: "AuthSessionMissingError", message: "Auth session missing!" }, "Sua sessão não foi encontrada. Abra o link mais recente enviado por email ou entre novamente."],
  [{ name: "AuthWeakPasswordError", code: "weak_password", message: "Password is known to be weak" }, "A senha não atende aos requisitos de segurança. Use uma senha mais longa, com letras maiúsculas, minúsculas, números e símbolos."],
  [{ name: "AuthApiError", code: "same_password", message: "New password should be different" }, "A nova senha precisa ser diferente da atual."],
  [{ name: "AuthApiError", code: "mfa_verification_failed", message: "Invalid TOTP code entered" }, "Código inválido. Confira o aplicativo autenticador e tente de novo."],
  [{ name: "AuthApiError", code: "otp_expired", message: "Token has expired or is invalid" }, "O link ou código expirou. Peça um novo."],
  [{ name: "AuthApiError", status: 403, code: "otp_expired", message: "Email link is invalid or has expired" }, "O link ou código expirou. Peça um novo."],
  [{ name: "AuthApiError", code: "captcha_failed", message: "captcha protection: request disallowed" }, "Não foi possível confirmar a verificação anti-spam. Recarregue a página e tente de novo."],
  [{ name: "AuthApiError", code: "email_address_invalid", message: "Email address is invalid" }, "Confira o endereço de email."],
  [{ name: "AuthApiError", message: "Something unexpected in English" }, "Não foi possível concluir o acesso. Tente novamente."],
  [{ code: "P0001", message: "Busca inválida." }, "Busca inválida."],
])("traduz %o", (error, expected) => {
  expect(errorMessage(error)).toBe(expected);
});
