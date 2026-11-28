import { useState } from "react";
import { rpc, useRpc } from "../api";
import { Field, Form, QueryState, value } from "../ui";

type EditorialLaunch = {
  title: string;
  summary: string;
  planned_on: string | null;
  enabled: boolean;
};
type Target = { entity: "courses" | "modules"; id: string };

export function AdminCatalogLaunch(props: Target) {
  const [visited, setVisited] = useState(false);
  return (
    <details onToggle={event => { if (event.currentTarget.open) setVisited(true); }}>
      <summary>Anúncio de lançamento</summary>
      {visited && <EditorialLaunchForm key={props.id} {...props} />}
    </details>
  );
}

function EditorialLaunchForm({ entity, id }: Target) {
  const args = { p_entity: entity, p_id: id };
  const query = useRpc<EditorialLaunch | null>("app_admin_catalog_launch", args);
  const announcement = query.data;
  return (
    <QueryState query={query}>
      <p>Use somente informações que os alunos podem ver antes da publicação. A previsão não publica o conteúdo. Na publicação, o aviso aparece no sino para quem se inscreveu e tem direito de recebê-lo.</p>
      <Form draft={`${entity}:${id}`} label="Salvar anúncio" onSave={async data => {
        await rpc("app_admin_save_catalog_launch", {
          ...args,
          p_title: value(data, "launch_title"),
          p_summary: value(data, "launch_summary"),
          p_planned_on: value(data, "launch_date") || null,
          p_enabled: data.has("launch_enabled"),
        });
        await query.refetch({ throwOnError: true });
      }}>
        <Field label="Título do anúncio">
          <input name="launch_title" required maxLength={160} defaultValue={announcement?.title} />
        </Field>
        <Field label="Resumo aprovado para os alunos">
          <textarea name="launch_summary" required maxLength={500} defaultValue={announcement?.summary} />
        </Field>
        <Field label="Previsão de lançamento (opcional)">
          <input name="launch_date" type="date" min="0001-01-01" max="9999-12-31" defaultValue={announcement?.planned_on ?? ""} />
        </Field>
        <label className="check">
          <input name="launch_enabled" type="checkbox" defaultChecked={announcement?.enabled ?? false} />
          Exibir anúncio para alunos elegíveis
        </label>
      </Form>
    </QueryState>
  );
}
