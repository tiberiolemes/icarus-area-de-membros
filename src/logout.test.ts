import { afterEach, expect, it, vi } from "vitest";
vi.hoisted(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58521");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-public-key");
});
import { client, signOut } from "./api";
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("não anuncia logout nem descarta a sessão quando a revogação global nativa retorna 500", async () => {
  const id = "00000000-0000-4000-8000-000000000005",
    user = {
      id,
      aud: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
    token = [
      btoa('{"alg":"HS256"}'),
      btoa(
        JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }),
      ),
      btoa("signature"),
    ]
      .map((s) => s.replace(/=/g, ""))
      .join(".");
  const requested: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      return new Response(
        JSON.stringify(
          url.endsWith("/user") ? user : { message: "Internal Server Error" },
        ),
        {
          status: url.includes("/logout") ? 500 : 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }),
  );
  expect(
    (
      await client().auth.setSession({
        access_token: token,
        refresh_token: "synthetic-refresh",
      })
    ).error,
  ).toBeNull();
  await expect(signOut()).rejects.toThrow(
    "Não foi possível encerrar sua sessão no servidor. Tente novamente.",
  );
  expect(requested.some((url) => url.includes("/logout?scope=global"))).toBe(
    true,
  );
  expect((await client().auth.getSession()).data.session?.user.id).toBe(id);
});
