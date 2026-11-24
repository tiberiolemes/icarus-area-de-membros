import { useId, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { errorMessage, rpc } from "../api";
import { useAuth } from "../auth";
import { QueryState } from "../ui";

type Launch = {
  key: string;
  title: string;
  summary: string;
  planned_on: string | null;
  subscribed: boolean;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" });
const queryName = "app_catalog_launches";

function LaunchSubscription({ item, subscribe }: { item: Launch; subscribe: () => Promise<void> }) {
  const lock = useRef(false);
  const mutation = useMutation({
    mutationFn: subscribe,
    networkMode: "always",
    onSettled: () => { lock.current = false; },
  });
  return (
    <span className="action">
      <button type="button" disabled={item.subscribed} aria-disabled={mutation.isPending || undefined}
        onClick={() => {
          if (item.subscribed || lock.current || mutation.isPending) return;
          lock.current = true;
          mutation.mutate();
        }}>
        {mutation.isPending ? "Aguarde…" : <>
          {item.subscribed ? <Check size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
          {item.subscribed ? "Aviso ativado " : "Quero ser avisado "}
          <span className="sr-only">sobre {item.title}</span>
        </>}
      </button>
      {mutation.isError && <span role="alert">{errorMessage(mutation.error)}</span>}
    </span>
  );
}

export function CatalogLaunches({ courseSlug }: { courseSlug?: string }) {
  const id = useId();
  const { session } = useAuth();
  const cache = useQueryClient();
  const args = { p_course_slug: courseSlug ?? null };
  const queryKey = [queryName, session?.user.id, args];
  const query = useQuery({
    queryKey,
    queryFn: () => rpc<Launch[]>(queryName, args),
    enabled: Boolean(session),
  });
  const items = query.data ?? [];
  if (!session || (!query.error && !items.length)) return null;

  return (
    <section className={courseSlug ? "catalog-launches" : "catalog-launches catalog-course-launches"} aria-labelledby={id}>
      <h2 id={id}>{courseSlug ? "Próximos módulos" : "Lançamento em breve"}</h2>
      <QueryState query={query}>
        <ul className="catalog-launch-grid">
          {items.map(item => (
            <li className="catalog-launch-card" key={item.key}>
              <div className="catalog-launch-copy">
                <div className="catalog-launch-head">
                  {item.planned_on && <p className="catalog-launch-date">Previsão: <time dateTime={item.planned_on}>
                    {dateFormat.format(new Date(item.planned_on + "T00:00:00Z"))}
                  </time></p>}
                  <h3>{item.title}</h3>
                </div>
                <p>{item.summary}</p>
              </div>
              <footer>
                <LaunchSubscription item={item} subscribe={async () => {
                  try {
                    await rpc("app_subscribe_catalog_launch", { p_key: item.key });
                    cache.setQueryData<Launch[]>(queryKey, old =>
                      old?.map(launch => launch.key === item.key ? { ...launch, subscribed: true } : launch));
                  } finally {
                    void query.refetch();
                  }
                }} />
                <span role="status" className="sr-only">
                  {item.subscribed ? `Aviso ativado sobre ${item.title}.` : ""}
                </span>
              </footer>
            </li>
          ))}
        </ul>
      </QueryState>
    </section>
  );
}
