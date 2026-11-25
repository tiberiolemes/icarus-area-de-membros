import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, useLocation } from "react-router-dom";
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
import { Action, Loading, Notice } from "./ui";
import { PasswordSetup } from "./pages/access";
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
        if (actor.current || !id)
          for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith("icarus:draft:")) sessionStorage.removeItem(key);
          }
        actor.current = id;
      }
      setSession(next);
      setLoading(false);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      set(next),
    );
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
  if (boot.error)
    return (
      <>
        <Notice error>{errorMessage(boot.error)}</Notice>
        <Action
          run={async () => {
            await boot.refetch();
          }}
        >
          Tentar novamente
        </Action>
        <Action
          run={async () => {
            await signOut();
          }}
        >
          Sair
        </Action>
      </>
    );
  if (!boot.data) return null;
  if (boot.data.profile.suspended)
    return (
      <Notice error>
        Seu acesso está suspenso. Entre em contato com o suporte.
      </Notice>
    );
  if (boot.data.profile.password_setup_required) return <PasswordSetup />;
  if (roles && !roles.includes(boot.data.profile.role))
    return (
      <Notice error>
        Acesso restrito. Você não tem permissão para abrir esta área.
      </Notice>
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
    <Notice error>Você não tem permissão para esta área.</Notice>
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
