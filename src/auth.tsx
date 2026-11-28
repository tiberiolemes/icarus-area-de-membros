import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  cache,
  client,
  configurationError,
  errorMessage,
  rpc,
  supabase,
  signOut,
} from "./api";
import type { Bootstrap } from "./api";
import { Action, Heading, Loading, Notice } from "./ui";
import { PasswordSetup, PublicFrame } from "./pages/access";
import { clearAllDrafts } from "./draft";
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
}>({ session: null, loading: true });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    actor = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let alive = true;
    const set = (next: Session | null) => {
      if (!alive) return;
      const id = next?.user.id ?? null;
      if (actor.current !== id) {
        cache.clear();
        document.documentElement.dataset.theme = "light";
        actor.current = id;
      }
      setSession(next);
      setLoading(false);
    };
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      if (event === "SIGNED_OUT" || (actor.current && actor.current !== next?.user.id)) clearAllDrafts();
      set(next);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function useBootstrap() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["bootstrap", session?.user.id],
    queryFn: () => rpc<Bootstrap>("app_bootstrap"),
    enabled: !!session,
    staleTime: 0,
  });
}
export function Gate({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: string[];
}) {
  const { session, loading } = useAuth(),
    boot = useBootstrap(),
    location = useLocation();
  if (configurationError) return <Notice error>{configurationError}</Notice>;
  if (loading) return <Loading />;
  if (!session)
    return (
      <Navigate
        to={
          "/entrar?returnTo=" +
          encodeURIComponent(location.pathname + location.search)
        }
        replace
      />
    );
  if (boot.isPending) return <Loading />;
  if (boot.error) {
    // actor() recusa conta suspensa ou sem perfil com esta frase; nos dois casos não adianta tentar de novo.
    const unavailable = (boot.error as { message?: string }).message === "Acesso indisponível.";
    return (
      <Blocked title={unavailable ? "Acesso indisponível" : "Não foi possível abrir sua área"}
        retry={unavailable ? undefined : async () => { await boot.refetch(); }}>
        {unavailable ? suspendedText : errorMessage(boot.error)}
      </Blocked>
    );
  }
  if (!boot.data) return null;
  if (boot.data.profile.suspended)
    return <Blocked title="Acesso indisponível">{suspendedText}</Blocked>;
  if (boot.data.profile.password_setup_required) return <PasswordSetup />;
  if (roles && !roles.includes(boot.data.profile.role))
    return (
      <PublicFrame>
        <div className="access">
          <Restricted role={boot.data.profile.role} />
        </div>
      </PublicFrame>
    );
  if (
    !boot.data.profile.onboarding_complete &&
    location.pathname != "/onboarding"
  )
    return (
      <Navigate
        to={
          "/onboarding?returnTo=" +
          encodeURIComponent(location.pathname + location.search)
        }
        replace
      />
    );
  return (
    <SessionGate>
      <AccountAssurance>
        {children}
      </AccountAssurance>
    </SessionGate>
  );
}
export function RoleGate({
  roles,
  children,
}: {
  roles: string[];
  children: ReactNode;
}) {
  const boot = useBootstrap();
  if (boot.isPending) return <Loading />;
  if (boot.error) return <Notice error>{errorMessage(boot.error)}</Notice>;
  return boot.data && roles.includes(boot.data.profile.role) ? (
    <>{children}</>
  ) : (
    <Restricted role={boot.data?.profile.role} />
  );
}
const suspendedText = "Sua conta está suspensa ou sem acesso à área de membros. Para entender o motivo ou pedir a revisão, fale com a equipe responsável pela plataforma.";
/** Bloqueio antes da moldura da área: título, explicação e sempre a saída para outra conta. */
function Blocked({ title, children, retry }: { title: string; children: ReactNode; retry?: () => Promise<void> }) {
  return (
    <PublicFrame>
      <div className="access">
        <Heading title={title}>{children}</Heading>
        {retry && <Action run={retry}>Tentar novamente</Action>}
        <Action run={signOut}>Sair e usar outra conta</Action>
      </div>
    </PublicFrame>
  );
}
/** Primeira área do painel de cada papel da equipe; membro não tem painel. */
export const staffHome = (role?: string): string | undefined =>
  ({ admin: "/admin/dashboard", instructor: "/admin/cursos", moderator: "/admin/comunidade", support: "/admin/suporte" } as Record<string, string>)[role ?? ""];
function Restricted({ role }: { role?: string }) {
  const home = staffHome(role);
  return (
    <>
      <Heading title="Acesso restrito" />
      <Notice error>Você não tem permissão para esta área.</Notice>
      <Link className="button" to={home ?? "/app/cursos"}>
        {home ? "Voltar ao painel" : "Voltar aos cursos"}
      </Link>
    </>
  );
}
export function AccountAssurance({ children }: { children: ReactNode }) {
  const { session } = useAuth(), location = useLocation();
  const [assurance, setAssurance] = useState<"verified" | "challenge" | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setAssurance(null);
    setError("");
    client().auth.mfa.getAuthenticatorAssuranceLevel().then(
      ({ data, error }) => {
        if (!active) return;
        if (error) setError(errorMessage(error));
        else if (data.currentLevel === "aal2") setAssurance("verified");
        else if (data.currentLevel === "aal1" && data.nextLevel === "aal1") {
          setAssurance("verified");
        } else setAssurance("challenge");
      },
    );
    return () => {
      active = false;
    };
  }, [session?.access_token]);
  if (error) return <Notice error>{error}</Notice>;
  if (assurance === null) return <Loading />;
  return assurance === "verified"
    ? <>{children}</>
    : (
      <Navigate
        to={"/entrar?returnTo=" +
          encodeURIComponent(location.pathname + location.search)}
        replace
      />
    );
}

function SessionGate({ children }: { children: ReactNode }) {
  const notRemembered = (useLocation().state as { notRemembered?: boolean } | null)?.notRemembered;
  const [expiry, setExpiry] = useState<number | null>(null),
    [seconds, setSeconds] = useState<number | null>(null),
    [remembered, setRemembered] = useState(false),
    [failure, setFailure] = useState("");
  const last = useRef(0),
    inFlight = useRef(false);
  useEffect(() => {
    let alive = true;
    async function touch(active = false) {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const data = await rpc<{ expires_at: string; warning_seconds: number; remembered?: boolean }>(
          "app_touch_session",
          { p_activity: active },
        );
        if (alive) {
          setExpiry(new Date(data.expires_at).getTime());
          setRemembered(!!data.remembered);
          setFailure("");
        }
      } catch (err) {
        if (alive) {
          cache.clear();
          setFailure(errorMessage(err));
        }
      } finally {
        inFlight.current = false;
      }
    }
    function act() {
      if (Date.now() - last.current > 60_000) {
        last.current = Date.now();
        void touch(true);
      }
    }
    void touch(false);
    window.addEventListener("pointerdown", act);
    window.addEventListener("keydown", act);
    return () => {
      alive = false;
      window.removeEventListener("pointerdown", act);
      window.removeEventListener("keydown", act);
    };
  }, []);
  useEffect(() => {
    if (!expiry) return;
    const tick = () => {
      const remaining = Math.ceil((expiry - Date.now()) / 1000);
      setSeconds(remaining);
      if (remaining <= 0) {
        cache.clear();
        void client().auth.signOut({ scope: "local" });
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiry]);
  if (failure)
    return (
      <>
        <Notice error>{failure}</Notice>
        <Action
          run={async () => {
            await signOut();
          }}
        >
          Entrar novamente
        </Action>
      </>
    );
  return (
    <>
      {notRemembered && (
        <Notice>
          Você entrou, mas este navegador não ficou lembrado por 15 dias. No próximo acesso, o código será pedido normalmente.
        </Notice>
      )}
      {seconds !== null && seconds > 0 && seconds <= 60 && (
        <div className="session-warning" role="alert">
          {remembered
            ? <>Os 15 dias desta sessão terminam em {seconds}s. Depois, entre novamente.</>
            : (
              <>
                Sua sessão termina em {seconds}s por inatividade.{" "}
                <Action
                  run={async () => {
                    const data = await rpc<{ expires_at: string }>(
                      "app_touch_session",
                      { p_activity: true },
                    );
                    setExpiry(new Date(data.expires_at).getTime());
                  }}
                >
                  Continuar conectado
                </Action>
              </>
            )}
        </div>
      )}
      {children}
    </>
  );
}
