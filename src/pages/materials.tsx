import { ArrowRight, Folder, FolderOpen, LayoutGrid, List, LockKeyhole } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useRpc } from "../api";
import type { Material, Page } from "../api";
import { Heading, Pager, QueryState, Search } from "../ui";
import { MaterialList } from "./learning";
import "./student-resources.css";

export function Materials() {
  const { pasta } = useParams();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const page = Number(params.get("page") || 1);
  const filesOnly = params.get("vista") === "arquivos";
  const query = useRpc<Page<Material> & {
    folders: { id: string; name: string; count?: number }[];
  }>("app_materials", {
    p_folder_id: pasta ?? null,
    p_query: q,
    p_page: page,
  });
  const hasRestrictedFiles = query.data?.items.some((file) => !file.can_access);

  function updateParams(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  }

  return (
    <div className="student-materials">
      <Heading
        title="Materiais & Acervo"
        action={
          <div className="materials-toolbar">
            <Search
              initial={q}
              onSearch={(q) => updateParams({ q, page: "" })}
              label="Buscar arquivos"
              placeholder="Buscar arquivos…"
              variant="stitch"
            />
            <div className="materials-view" role="group" aria-label="Visualização do acervo">
              <button type="button" aria-pressed={!filesOnly} aria-label="Pastas e arquivos" onClick={() => updateParams({ vista: "" })}>
                <LayoutGrid size={18} aria-hidden="true" />
              </button>
              <button type="button" aria-pressed={filesOnly} aria-label="Apenas arquivos da seção" onClick={() => updateParams({ vista: "arquivos" })}>
                <List size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        }
      >
        Encontre os arquivos e recursos disponíveis para seu aprendizado.
      </Heading>
      <QueryState query={query}>
        {query.data && (
          <div className="resource-sections" data-tour="materials">
            {!filesOnly && query.data.folders.length > 0 && (
              <section aria-labelledby="materials-folders">
                <div className="resource-section-heading">
                  <h2 id="materials-folders">Pastas</h2>
                  <span>{query.data.folders.length} {query.data.folders.length === 1 ? "pasta" : "pastas"}</span>
                </div>
                <ul className="materials-folders">
                  {query.data.folders.map((folder) => (
                    <li key={folder.id}>
                      <Link to={"/app/materiais/" + folder.id}>
                        <span className="resource-icon"><FolderOpen size={20} aria-hidden="true" /></span>
                        <strong>{folder.name}</strong>
                        <span className="materials-folder-footer">
                          <span>{folder.count === undefined ? "Abrir pasta" : `${folder.count} ${folder.count === 1 ? "arquivo" : "arquivos"}`}</span>
                          <ArrowRight size={18} aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section aria-labelledby="materials-files">
              <div className="materials-files-bar">
                <div>
                  {pasta && (
                    <nav aria-label="Navegação de materiais">
                      <Link className="text-action" to="/app/materiais">Todas as pastas</Link>
                    </nav>
                  )}
                  <h2 id="materials-files"><Folder size={18} aria-hidden="true" />{pasta ? "Arquivos da pasta" : "Arquivos"}</h2>
                </div>
                <span>{query.data.total} {query.data.total === 1 ? "arquivo" : "arquivos"}</span>
              </div>
              <div className="materials-files">
                {query.data.items.length > 0 && (
                  <div className="materials-files-head" aria-hidden="true">
                    <span>Material</span><span>Ação</span>
                  </div>
                )}
                <MaterialList materials={query.data.items} />
              </div>
            </section>
            {query.data.total > query.data.page_size || page > 1 ? (
              <Pager page={page} total={query.data.total} onChange={(page) => updateParams({ page: String(page) })} />
            ) : null}
            {hasRestrictedFiles && (
              <section className="materials-access" aria-labelledby="materials-access">
                <div>
                  <h2 id="materials-access"><LockKeyhole size={20} aria-hidden="true" /> Materiais com acesso restrito</h2>
                  <p>Consulte sua assinatura para saber quais materiais estão disponíveis para sua conta.</p>
                </div>
                <Link className="button primary" to="/app/configuracoes?aba=assinatura">Consultar assinatura</Link>
              </section>
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}
