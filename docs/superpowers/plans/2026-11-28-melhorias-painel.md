# Melhorias do painel e da área do aluno (2.13.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar os 17 ajustes pedidos por Tibério em 28/nov/2026 (vínculos de material, exclusão definitiva, uploads, ajuda em popup, rascunho local, barra lateral, arraste, polimentos do DS, tela de sucesso do cadastro e avanço automático de aula) na versão 2.13.0 do Icarus.

**Architecture:** Regras de acesso, exclusão e recusa de vídeo ficam no Postgres (RPCs `security definer` com grants mínimos), com Edge Functions só onde há Storage ou chave de terceiro (`upload` para apagar arquivos, `capabilities` para a API do Bunny). O front em React reaproveita `Form`, `Modal`, `Field`, `Notice` e os tokens do DS; peças novas ficam em arquivos próprios para não inchar `src/pages/admin.tsx` (3.091 linhas).

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, TanStack Query 5, Radix Dialog, lucide-react, Vitest 5 + Testing Library (jsdom), Supabase Postgres e Edge Functions em Deno 2.

**Spec:** `docs/superpowers/specs/2026-11-28-melhorias-painel-design.md` (aprovado por Tibério em 28/nov/2026). Imagens de referência em `~/ai/projetos/icarus-area-de-membros/imagens/2026-11-28-melhorias-painel/`.

## Global Constraints

- Ler `AGENTS.md`, a skill Ponytail (`/Users/tiberiolemes/.codex/skills/ponytail/SKILL.md`) e `supabase-grants-checklist` antes de tocar banco. Sem dependência nova.
- Português brasileiro em todo texto de tela, artigo e commit. Sem travessão como separador; dois pontos só antes de lista; sentence case.
- DS Icarus: Inter, tokens `--ic-*`/`--stitch-*`, alvo mínimo de 44 px, campo de 16 px, foco de 2 px afastado 3 px, 360 px sem rolagem horizontal, tema claro e escuro.
- Migrations novas com `begin;` na primeira linha e `commit;` na última, em linhas próprias. Toda função nova: `revoke execute ... from public, anon, authenticated, service_role;` e `grant` só ao papel necessário. Função com `p_actor_id` só para `service_role`. Tabela nova com RLS ligado e `revoke all`.
- Recriar função sempre a partir da última migration que a define (conferir com o laço `for f in supabase/migrations/*.sql` abaixo), nunca da primeira.
- `localStorage` sempre em `try/catch`; a tela funciona sem ele.
- A demo (`demo/transport.ts`, `demo/fixtures.ts`) responde a toda RPC e ação nova que a tela chamar, para `npm run build:demo` e o modo demo continuarem abrindo as telas.
- Toda tela alterada atualiza o artigo da Central de ajuda indicado na tarefa (`src/pages/help-articles-*.ts`) e o passo do tour, se citar o que mudou (`src/tour.tsx`).
- Mensagens fixas da spec, literais:
  - "A plataforma não recebe vídeo. Use o Bunny Stream ou o YouTube."
  - "Não dá para desfazer. Certificados já emitidos continuam válidos."
  - "Arraste o arquivo aqui", "ou", "Selecionar arquivo"
  - "Abrir em uma nova janela"
  - "Recuperar rascunho", "Descartar"
  - "Recolher menu", "Expandir menu"
  - "Arraste pela alça ou use Subir e Descer para mudar a ordem."
- Sem commit de `.local/`, `.env` ou artefatos de QA. Commits em Conventional Commits, só com os caminhos da tarefa, sem assinatura do Claude.

### Como rodar as verificações

- Tela: `npx vitest run <arquivo>`; tudo: `npm test`. Tipos: `npm run typecheck`.
- Edge Functions: `node scripts/test-integrations.mjs` (roda `deno test` em `tests/integration/edge_test.ts` e vizinhos).
- Instalador (confere `begin;`/`commit;`): `node --test scripts/clean-install.test.mjs scripts/local.test.mjs`.
- Banco: sem Docker dedicado nesta máquina, usar o banco descartável (memória `reference_banco_descartavel_para_testar_migration_do_icarus`). Uma vez por sessão:
  ```bash
  Q=~/ai/projetos/icarus-area-de-membros/artefatos/qa-2-13; mkdir -p "$Q"; cp -R supabase "$Q/"
  # no config.toml da cópia: project_id = "icarus-melhorias-qa" e portas 5852x -> intervalo livre (ex.: 5873x; conferir com lsof -i :58732)
  SUPABASE_PROFILE=supabase supabase --workdir "$Q" db start > "$Q/start.log" 2>&1
  ```
  Migration nova: `cp supabase/migrations/<nova>.sql "$Q/supabase/migrations/" && SUPABASE_PROFILE=supabase supabase --workdir "$Q" migration up --local`.
  Teste: `docker exec -i supabase_db_icarus-melhorias-qa psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/tests/<arquivo>.sql` (passa quando sai 0 e a última linha é a contagem de asserções). Ao terminar o plano: `SUPABASE_PROFILE=supabase supabase --workdir "$Q" stop --no-backup`.
- Última definição de uma função: `last=""; for f in supabase/migrations/*.sql; do grep -qE "function (public|app_private)\.NOME\(" "$f" && last=$f; done; echo $last`.

## Review Focus

1. Soltar dois arquivos (ou uma pasta) na área de arraste: usa só o primeiro e avisa "Envie um arquivo por vez." (teste na Task 6).
2. `localStorage` indisponível (Safari privado, cota cheia): formulários e barra lateral funcionam, sem aviso de rascunho e sem erro (testes nas Tasks 14 e 15).
3. Clique duplo em "Excluir para sempre" ou item já excluído em outra aba: uma chamada só, e a segunda resposta "Registro indisponível." aparece como erro legível (testes nas Tasks 2 e 8).
4. Bunny fora do ar, chave recusada ou biblioteca vazia: mensagem clara, "Tentar novamente" e estado vazio no seletor (testes nas Tasks 5 e 10).
5. Arrastar e soltar no mesmo lugar, numa lista de um item ou em outra seção: nenhuma gravação (teste na Task 11).

---

### Task 1: Vínculo de material com várias aulas (banco)

**Files:**
- Create: `supabase/migrations/202611280001_material_lessons.sql`
- Create: `supabase/tests/material_lessons.sql`
- Modify: testes SQL que inserem `materials.lesson_id` (`grep -ln "materials" supabase/tests/*.sql` e conferir cada um)
- Modify: `demo/fixtures.ts:54`, `demo/transport.ts` (ramo `app_admin_save` e nova RPC)
- Modify: `docs/CONTRACT.md`, `docs/data-dictionary.md`, `docs/schema-dictionary.sql`

**Interfaces:**
- Produces:
  - Tabela `public.material_lessons(material_id uuid not null references public.materials(id) on delete cascade, lesson_id uuid not null references public.lessons(id) on delete cascade, primary key(material_id, lesson_id))`, índice `material_lessons_lesson(lesson_id)`, RLS ligado, `revoke all ... from public, anon, authenticated, service_role`. Coluna `materials.lesson_id` removida; `materials_parent` recriado só sobre `folder_id`.
  - `app_admin_list('materials', ...)`: cada item traz `lesson_ids uuid[]` (ordenado, vazio quando não há vínculo) e não traz `lesson_id`.
  - `app_admin_save('materials', id, data)`: aceita `data.lesson_ids` (array de UUID) e substitui o conjunto inteiro; sem a chave, mantém. Falha "Aula indisponível." para aula inexistente e "Vincule no máximo 200 aulas." acima de 200. Ignora `lesson_id`.
  - `app_admin_unlink_material(p_material_id uuid, p_lesson_id uuid) returns jsonb` → `{id, status}`; `authenticated`; papéis de `app_private.entity_roles('materials')`; apaga o vínculo; se não sobrar nenhum, grava `status='draft'`; audita `unlink`.
  - `app_private.material_json` devolve `lesson_ids` em vez de `lesson_id`.

- [ ] **Step 1: Escrever o teste de banco que falha**

`supabase/tests/material_lessons.sql`, no molde de `supabase/tests/lesson_youtube.sql` (`pg_temp.ok`, `pg_temp.denied`, `pg_temp.id`, sessão `aal1` via `app_touch_session`, `rollback;` no fim). Cenário: curso `members` com aulas A e B em módulos com `access_mode` diferentes (A liberada para o membro, B restrita a um plano que ele não tem), material M vinculado a A e B, material N vinculado só a B. Asserções:
- `app_private.material_access(membro, M)` é verdadeiro ("material em duas aulas abre para quem acessa uma delas").
- `app_private.material_access(membro, N)` é falso.
- `app_lesson` de A lista M; de B (como admin) lista M e N.
- Como admin, `app_admin_save('materials', M, '{"lesson_ids":[B]}')` deixa só B em `material_lessons`.
- `app_admin_save` com aula inexistente falha com "Aula indisponível."; com 201 IDs falha com "Vincule no máximo 200 aulas.".
- `app_admin_unlink_material(N, B)` devolve `status = 'draft'`; `app_admin_unlink_material(M, …)` com outra aula restante mantém `published`.
- Membro: `app_admin_unlink_material` negado.
- `delete from public.lessons where id = B` (como postgres) apaga os vínculos de B.
- `has_table_privilege('authenticated', 'public.material_lessons', 'select')` é falso.

- [ ] **Step 2: Rodar e ver falhar**

Run: o `docker exec ... < supabase/tests/material_lessons.sql` de "Como rodar".
Expected: erro `relation "public.material_lessons" does not exist`.

- [ ] **Step 3: Escrever a migration**

Antes do `drop column`, `insert into public.material_lessons select id, lesson_id from public.materials where lesson_id is not null`. Recriar, a partir da última versão de cada uma: `app_private.material_access` (`202611250004`), `app_private.material_json` e `public.app_lesson` (`202611230002`), `public.app_admin_list` (`202611230009`), `public.app_admin_save` (`202611230012`, ramo `materials` sem a trava de `lesson_id`; a trava continua nos outros ramos) e `public.app_local_demo` (`202611230008`, que insere material com aula). Regra de acesso: material sem vínculo segue como hoje; com vínculos, exige `exists (select 1 from public.material_lessons ml where ml.material_id = m.id and app_private.lesson_access(p_actor, ml.lesson_id))`. Repetir os `revoke`/`grant` de cada função recriada. Fechar com `notify pgrst, 'reload schema';`.

- [ ] **Step 4: Aplicar e rodar o teste**

Run: `migration up` da cópia e o teste. Expected: sai 0 e imprime a contagem.

- [ ] **Step 5: Provar a cópia dos vínculos antigos**

No banco descartável, antes de aplicar a migration numa base recém-resetada sem ela: inserir um material com `lesson_id` (como postgres), aplicar a migration, conferir `select count(*) from public.material_lessons` = 1. Registrar a saída no relatório da tarefa.

- [ ] **Step 6: Ajustar o resto e rodar todos os testes de banco**

Atualizar testes SQL que usam `materials.lesson_id`, a demo (fixture com `lesson_ids: [demoId(301)]`; `app_admin_save` de `materials` grava `lesson_ids`; `app_admin_unlink_material` remove e volta para `draft` quando esvazia) e os três documentos. Run: cada `supabase/tests/*.sql` e `node --test scripts/clean-install.test.mjs scripts/local.test.mjs`. Expected: todos saem 0.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202611280001_material_lessons.sql supabase/tests demo docs/CONTRACT.md docs/data-dictionary.md docs/schema-dictionary.sql
git commit -m "feat: material pode ficar em várias aulas"
```

---

### Task 2: Exclusão definitiva e arquivar sem senha (banco)

**Files:**
- Create: `supabase/migrations/202611280002_content_delete.sql`
- Create: `supabase/tests/content_delete.sql`
- Modify: `supabase/tests/backend.sql:126-156`, `supabase/tests/post_archive.sql:139-157`
- Modify: `docs/CONTRACT.md`

**Interfaces:**
- Consumes: `public.material_lessons` (Task 1).
- Produces:
  - `type DeletableEntity = 'lessons' | 'sections' | 'modules' | 'materials' | 'material_folders'`.
  - `app_admin_delete_preview(p_entity text, p_id uuid) returns jsonb` → `{sections, lessons, materials, folders, students, comments, linked_materials, orphaned_materials}` (inteiros); `authenticated`; papéis de `entity_roles(p_entity)`; outra entidade falha "Esta entidade não pode ser excluída."; registro ausente falha "Registro indisponível.".
  - `app_admin_delete(p_actor_id uuid, p_entity text, p_id uuid) returns jsonb` → `{id, paths text[]}`; só `service_role`; `app_private.service_actor(p_actor_id)`; papel via `is_staff(p_actor_id, entity_roles(p_entity))`; `throttle(p_actor_id, 'content_delete', 20)`; trava as linhas; apaga na ordem das dependências; `paths` = `lessons.storage_path`, `materials.storage_path` e `uploads.path` dos registros apagados; audita `app_private.audit(p_actor_id, 'delete', p_entity, p_id, <título ou nome>)`.
  - `app_admin_archive(p_entity text, p_id uuid, p_archived boolean) returns jsonb` (nova assinatura, sem `p_reauth_token`; a de 4 argumentos é removida com `drop function`); `throttle(u, 'archive', 30)`; o resto igual à versão de `202611230020`.

- [ ] **Step 1: Escrever o teste de banco que falha**

`supabase/tests/content_delete.sql`. Montar curso com certificado, módulo com seção nomeada e aulas L1 (obrigatória) e L2, material Mx vinculado só a L1, My vinculado a L1 e L2, pasta P com subpasta P2 e material Mz (vinculado a L2), e para L1: progresso concluído de dois alunos, favorito, nota, comentário com resposta e denúncia, apresentação com item de checklist marcado, registro em `uploads`; um certificado já emitido do curso. Asserções:
- Preview de L1: `students = 2`, `comments = 2`, `orphaned_materials = 1`.
- `app_admin_delete(admin, 'lessons', L1)` devolve os caminhos de arquivo de L1; somem progresso, favorito, nota, comentários, apresentação, checklist e `uploads` de L1.
- Mx volta para `draft`; My continua `published` e vinculado a L2.
- `courses.required_lesson_ids` não contém L1 e `curriculum_version` não mudou; a linha de `certificates` continua igual, e `public.app_certificate(<código>)` (verificação pública) continua devolvendo o certificado mesmo com L1 apagada de `lessons`.
- Segunda chamada para L1 falha com "Registro indisponível.".
- Excluir a seção e o módulo apaga as aulas dele e a linha de `app_private.catalog_launches` (e inscrições) do módulo.
- Preview de P: `folders = 1`, `materials = 1`, `linked_materials = 1`; excluir P apaga P, P2 e Mz e devolve o caminho de Mz.
- Instrutor exclui conteúdo; moderador e membro são negados; `authenticated` sem `execute` em `app_admin_delete`; `anon` sem `execute` no preview.
- Existe `audit_events` com `action = 'delete'` e o nome do item em `reason`.
- `app_admin_archive('courses', C, true)` sem token arquiva como admin e é negado para membro; `to_regprocedure('public.app_admin_archive(text,uuid,boolean,text)') is null`.

- [ ] **Step 2: Rodar e ver falhar**

Expected: erro `function public.app_admin_delete_preview(...) does not exist`.

- [ ] **Step 3: Escrever a migration**

Descobrir as tabelas que referenciam aula, seção, módulo, comentário de aula, apresentação, pasta e material com `select conrelid::regclass, conname from pg_constraint where confrelid in ('public.lessons'::regclass, ...)` no banco descartável, e cobrir também referências sem chave estrangeira usadas por notificações, denúncias e ranking (conferir `202611230026_notifications.sql`, `202611230001_core.sql:110` e `202611230033_ranking.sql`). Ajuste do certificado: `update public.courses set required_lesson_ids = array(select x from unnest(required_lesson_ids) x where x <> all(<aulas apagadas>))` sem tocar `curriculum_version` (o gatilho `curriculum_changed` só roda em insert e update). Materiais que ficam sem nenhum vínculo depois do `delete` voltam para `draft`.

- [ ] **Step 4: Ajustar os testes de reautenticação**

Em `backend.sql` (linhas 126-156) e `post_archive.sql` (139-157), as chamadas de arquivar passam a 3 argumentos. As asserções de mecanismo ("wrong reauth denied", "reauth single use", "nonce restored after failed critical transaction") passam a usar `public.app_admin_member(p_id, p_data, p_reason, p_reauth_token)`, que continua exigindo senha.

- [ ] **Step 5: Aplicar e rodar**

Run: `migration up`, `content_delete.sql`, `backend.sql`, `post_archive.sql` e o teste do instalador. Expected: todos saem 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202611280002_content_delete.sql supabase/tests docs/CONTRACT.md
git commit -m "feat: exclusão definitiva de conteúdo e arquivar sem senha no banco"
```

---

### Task 3: Ação de exclusão na Edge Function `upload`

**Files:**
- Modify: `supabase/functions/upload/index.ts:8-30` (ramo JSON)
- Modify: `tests/integration/edge_test.ts`
- Modify: `demo/transport.ts` (antes do 501 de `/functions/v1/upload` e no `call()` para o preview)

**Interfaces:**
- Consumes: `app_admin_delete` (Task 2).
- Produces: `POST /functions/v1/upload` com JSON `{action: "delete", entity: DeletableEntity, id: string}` → `{deleted: true, files_removed: number, warning?: string}`. `warning` literal: "O item foi excluído, mas alguns arquivos não foram apagados do armazenamento."

- [ ] **Step 1: Escrever os testes Deno que falham**

Em `edge_test.ts`, com `deps()`:
- `"exclusão chama a RPC com o ator do JWT e remove os arquivos devolvidos"`: rota fake devolve `{id, paths: ["material/<id>/a.pdf"]}` para `app_admin_delete`; conferir corpo `{p_actor_id: id, p_entity: "materials", p_id: other}` e um `DELETE`/`remove` no Storage com esse caminho; resposta `{deleted: true, files_removed: 1}`.
- `"falha do Storage não desfaz a exclusão e avisa"`: Storage responde 500; resposta traz `warning` literal e `deleted: true`.
- `"entidade fora da lista é recusada antes da RPC"`: `entity: "courses"` → 422 e nenhuma chamada a `app_admin_delete`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node scripts/test-integrations.mjs`. Expected: os três testes falham ("Ação de upload inválida.").

- [ ] **Step 3: Implementar o ramo `delete`**

Validar `entity` com `text(body.entity, 32)` contra a lista e `uuid(body.id)`; chamar a RPC com `a.admin`; `a.admin.storage.from("icarus-private").remove(paths)` quando houver caminhos; erro do Storage vai para `console.error` sem o caminho completo e vira `warning`.

- [ ] **Step 4: Demo**

`app_admin_delete_preview` devolve contagens calculadas de `state.records`; a ação `delete` apaga o registro e dependentes de `state.records` e responde `{deleted: true, files_removed: 0}`.

- [ ] **Step 5: Rodar e ver passar**

Run: `node scripts/test-integrations.mjs`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/upload/index.ts tests/integration/edge_test.ts demo/transport.ts
git commit -m "feat: função upload apaga os arquivos do conteúdo excluído"
```

---

### Task 4: A plataforma deixa de receber vídeo

**Files:**
- Create: `supabase/migrations/202611280003_no_video_upload.sql`
- Create: `supabase/tests/no_video_upload.sql`
- Modify: `supabase/functions/_shared/files.ts:6` (remover `mp4` de `formats`), `supabase/functions/upload/index.ts:27-28,41,44`
- Modify: `src/upload.tsx` (tirar `"lesson"` do tipo `kind`, do `accept` e das dicas), `src/pages/admin.tsx:1050-1100` (bloco "Arquivo de vídeo", estado `uploading`, frase "Salve a aula para enviar um arquivo de vídeo", opção `video/mp4` do select de tipo do material, mantida só como rótulo em `materialTypes`)
- Modify: `tests/integration/edge_test.ts` (testes que enviam MP4), `src/upload.test.tsx`
- Modify: artigos `video-da-aula`, `publicar-materiais`, `criar-curso` (`help-articles-team.ts`) e os de suporte do aluno (`help-articles-member.ts`), `docs/operations.md`

**Interfaces:**
- Produces: `app_upload_access` recusa `p_kind = 'lesson'` e `p_content_type = 'video/mp4'` com "A plataforma não recebe vídeo. Use o Bunny Stream ou o YouTube."; a função `upload` recusa o mesmo antes de chamar o banco, com a mesma frase (422 `INVALID_FILE`). `Upload` aceita `kind: "course-cover" | "material" | "post-image" | "ticket-attachment" | "avatar"`.

- [ ] **Step 1: Escrever os testes que falham**

`no_video_upload.sql` (como `service_role`, ator admin e ator membro com chamado): `kind='lesson'` falha com a frase; MP4 como `material` falha; MP4 como `ticket-attachment` falha; ZIP como `material` passa; `app_media_access` de uma aula com `storage_path` já gravado continua devolvendo `provider = 'storage'`. Deno: `"reserva de vídeo da aula e MP4 de material são recusados com a frase do vídeo"`. Vitest em `src/upload.test.tsx`: o campo de material não lista MP4 na dica.

- [ ] **Step 2: Rodar e ver falhar**

Expected: as asserções de recusa falham (hoje passam MP4 e `lesson`).

- [ ] **Step 3: Implementar**

Migration recria `app_upload_access` a partir de `202611270001_upload_limits.sql`, com `revoke`/`grant` iguais. Na função `upload`, o `reserve` aceita só `material`; o multipart tira `lesson` da lista. Editor da aula sem upload de vídeo; o campo "Vídeo do Bunny ou link do YouTube" continua.

- [ ] **Step 4: Rodar banco, Deno e Vitest**

Run: o teste SQL, `node scripts/test-integrations.mjs`, `npx vitest run src/upload.test.tsx src/admin-content.test.tsx`. Expected: PASS.

- [ ] **Step 5: Textos**

Trocar nas dicas, artigos e `docs/operations.md` toda menção a enviar MP4 ou "até 500 MiB" de vídeo pela orientação de usar Bunny Stream ou YouTube. Conferir com `grep -rn "MP4\|500 MiB\|Arquivo de vídeo" src docs`.

- [ ] **Step 6: Commit**

```bash
git add supabase src tests docs
git commit -m "feat: plataforma deixa de receber vídeo e aceita só Bunny e YouTube"
```

---

### Task 5: Busca de vídeos do Bunny (servidor)

**Files:**
- Create: `supabase/migrations/202611280004_bunny_search.sql`
- Create: `supabase/tests/bunny_search.sql`
- Modify: `supabase/functions/capabilities/index.ts:30-40` (novo ramo antes da trava de admin)
- Modify: `tests/integration/edge_test.ts`, `demo/transport.ts` (ramo `capabilities`)

**Interfaces:**
- Produces:
  - `app_staff_bunny_search_throttle(p_actor_id uuid) returns void`; só `service_role`; `service_actor`; `is_staff(p_actor_id, array['admin','instructor'])` ou falha; `throttle(p_actor_id, 'bunny_search', 30)`.
  - `POST /functions/v1/capabilities` com `{action: "bunny-videos", query: string, page: number}` → `{items: {id: string; title: string; length: number; ready: boolean}[]; total: number; page: number}`. `ready = status === 4`. Erros: 403 para membro, moderador, suporte, demo ou `password_setup_required`; 422 para `query` com mais de 100 caracteres ou `page` fora de 1..1000; 409 `BUNNY_NOT_CONFIGURED` "Configure o Bunny Stream em Configurações > Integrações."; 401/403 do Bunny → 502 "A API do Bunny Stream recusou a chave. Confira as credenciais salvas."; outro erro ou tempo esgotado (8 s) → 502 "A API do Bunny Stream está indisponível. Tente novamente.".
  - Chamada ao Bunny: `GET https://video.bunnycdn.com/library/{library_id}/videos?page={page}&itemsPerPage=20&orderBy=date&search={encodeURIComponent(query)}` com cabeçalho `AccessKey`, `redirect: "error"`.

- [ ] **Step 1: Escrever os testes que falham**

Deno:
- `"instrutor busca vídeos do Bunny e recebe só id, título, duração e situação"`: Bunny fake devolve `{totalItems: 1, currentPage: 1, items: [{guid, title, length: 754, status: 4, ...outros}]}`; resposta igual a `{items: [{id: guid, title, length: 754, ready: true}], total: 1, page: 1}`; a chave não aparece em nenhum corpo de resposta.
- `"membro não busca vídeos do Bunny"` → 403, sem chamada ao Bunny.
- `"busca longa é recusada antes do Bunny"` → 422.
- `"chave recusada pelo Bunny vira mensagem clara"` → 502 com a frase da chave.
- `"Bunny sem chave salva responde BUNNY_NOT_CONFIGURED"` → 409.
SQL `bunny_search.sql`: membro negado, instrutor passa, `authenticated` sem `execute`.

- [ ] **Step 2: Rodar e ver falhar**

Expected: "Somente administradores podem consultar as integrações." no lugar dos resultados.

- [ ] **Step 3: Implementar**

Ramo `bunny-videos` usa `actor(req, d)`, a RPC de limite com `a.admin` e `bunnyConfig(d, a.admin, true)`; reaproveitar `validLibrary`. Adicionar `app_staff_bunny_search_throttle` à lista de throttles respondidos por `deps()` em `edge_test.ts`.

- [ ] **Step 4: Demo**

`capabilities` com `action: "bunny-videos"` devolve três vídeos fictícios ("DEMONSTRAÇÃO Boas-vindas", 95 s, pronto; "DEMONSTRAÇÃO Módulo 1", 754 s, pronto; "DEMONSTRAÇÃO Em processamento", 0 s, `ready: false`), filtrando pelo título.

- [ ] **Step 5: Rodar e ver passar; commit**

Run: Deno, SQL e instalador. Expected: PASS.

```bash
git add supabase/migrations/202611280004_bunny_search.sql supabase/tests/bunny_search.sql supabase/functions/capabilities/index.ts tests/integration/edge_test.ts demo/transport.ts
git commit -m "feat: busca de vídeos da biblioteca do Bunny para quem edita aula"
```

---

### Task 6: Área de arraste em todos os uploads

**Files:**
- Create: `src/dropzone.tsx`, `src/dropzone.css`, `src/dropzone.test.tsx`
- Modify: `src/upload.tsx` (troca `FilePicker`, envio automático, extrai `sendFile`), `src/upload.test.tsx`
- Modify: `src/pages/admin-brand.tsx:147`, `src/pages/feedback.tsx:104`, `src/style.css:152-170,1342-1365` (regras de `input[type=file]` e `.upload-picker` que deixam de ser usadas)
- Modify: artigos que citam "Escolher arquivo" ou "Enviar arquivo" (`grep -rn "Escolher arquivo\|Enviar arquivo" src/pages/help-articles-*.ts src/tour.tsx`)

**Interfaces:**
- Produces:
  - `Dropzone(props: { label: string; hint: string; accept?: string; name?: string; disabled?: boolean; fileName?: string; inputRef?: Ref<HTMLInputElement>; onFile: (file: File | undefined) => void }): JSX.Element` em `src/dropzone.tsx`. Renderiza um `<input type="file">` real (com `name` quando passado, para o `FormData` dos formulários de logo e feedback), visualmente escondido e fora da ordem de foco; o botão "Selecionar arquivo" é o controle focável, com `aria-describedby` na dica. Ao soltar, tenta `input.files = event.dataTransfer.files` em `try/catch`.
  - `sendFile(kind: UploadKind, resourceId: string, file: File, signal: AbortSignal, onState: (text: string) => void): Promise<File>` exportada de `src/upload.tsx`: o mesmo pipeline de hoje (otimiza, reserva ou multipart, confirma) e devolve o arquivo enviado. `Upload` passa a usá-la.
  - `type UploadKind = "course-cover" | "material" | "post-image" | "ticket-attachment" | "avatar"` exportado de `src/upload.tsx`.

- [ ] **Step 1: Escrever os testes que falham**

`src/dropzone.test.tsx`:
- `"mostra o modelo com título, ou, Selecionar arquivo e a dica"`: textos "Arraste o arquivo aqui", "ou", botão "Selecionar arquivo" e a dica passada.
- `"soltar um arquivo chama onFile com ele"`: `fireEvent.drop(zona, { dataTransfer: { files: [pdf] } })`.
- `"soltar dois arquivos usa o primeiro e avisa"`: `onFile` com o primeiro e texto "Envie um arquivo por vez.".
- `"tipo fora do accept é recusado"`: `accept="application/pdf"`, solta PNG, `onFile` não chamado, texto "Tipo de arquivo não aceito aqui.".
- `"desabilitado ignora o arquivo solto"`.
- `"arrastar por cima marca a zona e sair desmarca"`: classe `is-dragging` no `dragover` e removida no `dragleave`.
`src/upload.test.tsx`:
- `"material começa o envio ao escolher o arquivo, sem botão Enviar arquivo"`.
- `"foto de perfil espera o recorte e o Salvar foto"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dropzone.test.tsx src/upload.test.tsx`. Expected: FAIL (módulo inexistente; botão Enviar arquivo presente).

- [ ] **Step 3: Implementar `Dropzone` e o CSS**

Visual da imagem `03-modelo-upload.png`: borda tracejada `--ic-border`, fundo `--ic-surface-muted`, raio do cartão, conteúdo centralizado, ícone `FolderOpen` de 40 px em `--ic-text-secondary`, título semibold, botão secundário do DS, dica em `--ic-text-secondary`. `is-dragging`: borda contínua `--ic-action`. `@media (pointer: coarse)` esconde o título de arraste e o "ou". Arquivo escolhido mostra nome e "Trocar arquivo" no botão.

- [ ] **Step 4: Ligar nos campos**

`Upload`: escolher ou soltar chama `sendFile` na hora (exceto `avatar`, que mantém prévia, recorte e "Salvar foto"); "Cancelar envio" e o progresso continuam. Logos (`admin-brand.tsx`) e print (`feedback.tsx`) trocam o `input` por `Dropzone` com o mesmo `name`, `ref` e `accept`, mantendo os fluxos de prévia e envio com o formulário. Dicas, literais:
- capa: "PNG, JPG ou WebP · até 500 KB depois de otimizada · ideal 1600 × 900 px"
- material: "PDF, imagem, ZIP, TXT ou MP3 · PDF até 5 MB e imagem até 500 KB depois de otimizados · ZIP, TXT e MP3 até 500 MB"
- imagem do post: "PNG, JPG ou WebP · até 500 KB depois de otimizada"
- anexo do suporte: "Imagem, PDF, ZIP, TXT ou MP3 · imagem até 500 KB e PDF até 5 MB depois de otimizados · demais até 20 MB"
- foto do perfil: "JPG ou PNG · até 20 MB"
- logos e print: manter o texto de limite atual de cada campo, no formato "tipos · limite".

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/dropzone.test.tsx src/upload.test.tsx src/admin-brand-logo.test.tsx src/feedback.test.tsx src/admin-course-cover.test.tsx src/support.test.tsx src/community-composer.test.tsx src/pages/student-account.test.tsx` e `npm run typecheck`. Expected: PASS.

- [ ] **Step 6: Textos e commit**

Atualizar os artigos encontrados no grep para "Selecionar arquivo" ou arrastar.

```bash
git add src
git commit -m "feat: área de arraste no padrão do Icarus em todos os uploads"
```

---

### Task 7: Aulas vinculadas por checkbox no editor do material

**Files:**
- Create: `src/pages/admin-data.ts` (move `save`, `useAll`, `text` e o tipo `Row` de `src/pages/admin.tsx:109-163`, sem mudar comportamento)
- Create: `src/pages/admin-material-lessons.tsx`, `src/admin-materials.test.tsx`
- Modify: `src/pages/admin.tsx:1172-1364` (`AdminMaterials`)
- Modify: artigo `publicar-materiais`

**Interfaces:**
- Consumes: `lesson_ids` de `app_admin_list`/`app_admin_save` (Task 1).
- Produces:
  - `src/pages/admin-data.ts`: `save(entity: string, id: string | null, data: Record<string, unknown>): Promise<{ id: string }>`, `useAll(entity: string)`, `text(row: Row | undefined, key: string, fallback?: string): string`, `type Row`.
  - `LessonLinks({ selected }: { selected: string[] }): JSX.Element` — fieldset "Aulas vinculadas" com checkboxes `name="lesson_ids"`, agrupados por curso e módulo na ordem de `order_index`, campo "Filtrar aulas" (`data-no-draft`, sem `name`) e contagem "N aulas selecionadas". Aula arquivada só aparece se estiver em `selected`, com o selo "Arquivado".
  - `AdminMaterials` aceita `?editar=<id>` na URL e abre o editor desse material.

- [ ] **Step 1: Escrever os testes que falham**

`src/admin-materials.test.tsx` (molde de `src/admin-default-section.test.tsx`, `fetch` falso com `app_admin_list` por entidade):
- `"editor agrupa as aulas por curso e módulo e marca as vinculadas"`.
- `"filtrar esconde as aulas que não batem e o envio mantém as marcadas escondidas"`: filtra "Revisão", salva, `p_data.lesson_ids` contém a marcada escondida.
- `"salvar envia lesson_ids e não envia lesson_id"`.
- `"aula arquivada aparece só quando já vinculada, com o selo Arquivado"`.
- `"listagem mostra Em 2 aulas"`.
- `"?editar=<id> abre o editor do material"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/admin-materials.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implementar**

Mover os utilitários para `admin-data.ts` e importar de volta em `admin.tsx`. Trocar o select "Aula vinculada" por `<LessonLinks selected={editing?.lesson_ids ?? []} />` e o envio por `lesson_ids: data.getAll("lesson_ids").map(String)`. Filtro usa `hidden` na linha, sem desmarcar.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/admin-materials.test.tsx src/admin-content.test.tsx src/admin-default-section.test.tsx && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Ajuda e commit**

Artigo `publicar-materiais`: vincular a várias aulas, editar o vínculo, acesso por qualquer aula vinculada.

```bash
git add src
git commit -m "feat: editor do material vincula várias aulas por checkbox"
```

---

### Task 8: Zona de perigo e arquivar sem senha (tela)

**Files:**
- Create: `src/pages/admin-delete.tsx`, `src/admin-delete.test.tsx`
- Modify: `src/pages/admin.tsx:398-427` (o `Archive` sai daqui), editores de aula, seção e módulo (`StructureForm`, perto da linha 1150), material e pasta (`AdminMaterials`)
- Modify: `src/pages/admin-settings.css` (estilo `.danger-zone`)
- Modify: artigos `arquivar-conteudo`, `criar-curso`, `publicar-materiais`

**Interfaces:**
- Consumes: `app_admin_delete_preview`, `app_admin_archive` de 3 argumentos (Task 2); ação `delete` da função `upload` (Task 3); `save`, `Row`, `text` de `admin-data.ts` (Task 7).
- Produces:
  - `Archive({ entity, row }: { entity: string; row: Row }): JSX.Element` — confirma num `Modal` ("Arquivar este registro?" ou "Restaurar este registro?") e chama `rpc("app_admin_archive", { p_entity, p_id, p_archived })`, sem `Reauth`.
  - `DangerZone({ entity, row, onDeleted }: { entity: DeletableEntity; row: Row; onDeleted: () => void }): JSX.Element` com `type DeletableEntity = "lessons" | "sections" | "modules" | "materials" | "material_folders"` exportado.

- [ ] **Step 1: Escrever os testes que falham**

`src/admin-delete.test.tsx`:
- `"zona de perigo mostra o resumo do que será apagado"`: preview `{sections: 0, lessons: 1, students: 12, comments: 4, orphaned_materials: 3, ...}` → textos "o progresso de 12 alunos", "4 comentários", "3 materiais ficam sem aula e voltam para rascunho" e "Não dá para desfazer. Certificados já emitidos continuam válidos.".
- `"confirmar exclui sem pedir senha e avisa quem abriu"`: chamada `functions/v1/upload` com `{action: "delete", entity: "lessons", id}`, nenhum campo de senha na tela, `onDeleted` chamado.
- `"clique duplo envia uma exclusão só"`.
- `"erro Registro indisponível aparece no modal"`.
- `"aviso de arquivos não apagados aparece depois da exclusão"`.
- `"pasta avisa quantos materiais estão em aulas"`: `linked_materials: 2` → "2 materiais desta pasta estão em aulas e deixam de aparecer nelas.".
- `"arquivar confirma no modal e chama app_admin_archive sem token"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/admin-delete.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implementar**

Caixa "Zona de perigo" com borda e ícone de erro do DS, texto "Excluir apaga este item e o que depende dele. Não dá para desfazer." e botão "Excluir para sempre". O modal busca o preview ao abrir, monta a frase "Serão apagados: …" só com as contagens maiores que zero, e tem "Cancelar" e "Excluir para sempre" (trava enquanto envia). Depois de excluir: `cache.invalidateQueries({ queryKey: ["app_admin_list"] })`, `onDeleted()`, mensagem "Excluído." e o `warning`, se vier. Ligar abaixo do `Archive` em aula, seção, módulo (fecha o editor da estrutura), material e pasta (fecham o editor).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/admin-delete.test.tsx src/admin-content.test.tsx src/admin-review.test.tsx && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Ajuda e commit**

Artigos: arquivar sem senha; excluir para sempre, o que se perde, o que fica (certificados) e o material que volta para rascunho.

```bash
git add src
git commit -m "feat: zona de perigo exclui aulas, seções, módulos, materiais e pastas"
```

---

### Task 9: Materiais no editor da aula

**Files:**
- Modify: `src/pages/admin-material-lessons.tsx` (novo `LessonMaterials`), `src/admin-materials.test.tsx` (ou `src/admin-lesson-materials.test.tsx`)
- Modify: `src/pages/admin.tsx` (`StructureForm`, depois do formulário da aula)
- Modify: `demo/transport.ts` se faltar resposta para o fluxo
- Modify: artigos `criar-curso` e `publicar-materiais`

**Interfaces:**
- Consumes: `app_admin_unlink_material` (Task 1), `sendFile` e `Dropzone` (Task 6), `save`/`useAll` (Task 7), `?editar=<id>` de `AdminMaterials` (Task 7).
- Produces: `LessonMaterials({ lessonId }: { lessonId: string }): JSX.Element`.

- [ ] **Step 1: Escrever os testes que falham**

Com `vi.mock("../upload", ...)` para `sendFile`:
- `"aula salva lista os materiais vinculados"` (nome, tipo, tamanho, "Editar em Materiais" com `href` `/admin/materiais?editar=<id>`).
- `"soltar arquivo cria material rascunho vinculado à aula, envia e publica"`: primeira `app_admin_save` com `{name: "Roteiro", folder_id: null, lesson_ids: [lessonId], status: "draft", access_mode: "members", plan_ids: [], file_type}` para `roteiro.pdf`; `sendFile("material", novoId, arquivo, …)`; segunda `app_admin_save` com `{status: "published", file_type: <tipo enviado>}`.
- `"falha no envio deixa o material como rascunho Sem arquivo com Reenviar arquivo"`.
- `"Desvincular chama app_admin_unlink_material"`.
- `"aula nova pede para salvar antes"`: texto "Salve a aula para adicionar materiais.".

- [ ] **Step 2: Rodar e ver falhar**

Expected: FAIL.

- [ ] **Step 3: Implementar**

Bloco "Materiais da aula" com a lista (de `useAll("materials")` filtrado por `lesson_ids.includes(lessonId)`) e o `Dropzone` com a dica de material. Nome do material: nome do arquivo sem a extensão, até 200 caracteres. Material sem `storage_path` mostra "Rascunho · Sem arquivo" e "Reenviar arquivo" (um `Upload kind="material"` daquele material, que publica ao concluir). Aula ainda não salva mostra a frase.

- [ ] **Step 4: Rodar e ver passar; ajuda; commit**

Run: `npx vitest run src/admin-materials.test.tsx src/admin-content.test.tsx && npm run typecheck`. Expected: PASS.

```bash
git add src demo
git commit -m "feat: materiais adicionados no editor da aula já nascem vinculados"
```

---

### Task 10: Seletor de vídeos do Bunny no editor da aula

**Files:**
- Create: `src/pages/admin-bunny-picker.tsx`, `src/admin-bunny-picker.test.tsx`
- Modify: `src/pages/admin.tsx` (fieldset "Mídia da aula" do `StructureForm`)
- Modify: artigo `video-da-aula`

**Interfaces:**
- Consumes: ação `bunny-videos` (Task 5); consulta `useQuery({ queryKey: ["capabilities"], queryFn: () => edge<Capabilities>("capabilities") })`, a mesma de `src/pages/checkout.tsx:56`.
- Produces: `BunnyPicker({ onPick }: { onPick: (video: { id: string; length: number }) => void }): JSX.Element` (botão "Buscar no Bunny" e o modal).

- [ ] **Step 1: Escrever os testes que falham**

- `"buscar no Bunny lista título, duração e Processando"`: duração 754 vira "12:34"; item `ready: false` mostra "Processando".
- `"Usar este vídeo preenche o ID e a duração e fecha"`: no editor da aula, o campo `video_id` recebe o `id`, `duration_seconds` recebe `754`, e o formulário fica com alterações não salvas.
- `"biblioteca vazia mostra o vazio"`: "Nenhum vídeo encontrado na biblioteca.".
- `"erro da API mostra a mensagem e Tentar novamente"`.
- `"sem Bunny configurado o botão não aparece e a dica aponta para Integrações"`.

- [ ] **Step 2: Rodar e ver falhar**

Expected: FAIL.

- [ ] **Step 3: Implementar**

Modal do DS com `Search` (variante `stitch`), lista paginada com `Pager` (20 por página), estados de carregamento, vazio e erro. `onPick` no editor grava `input.value` nos campos por `ref` e dispara `new Event("input", { bubbles: true })`, para o `Form` marcar alteração. Duração 0 não sobrescreve o campo. Sem `capabilities.bunny`: a dica do campo ganha "Para buscar na biblioteca, configure o Bunny em Configurações > Integrações." (para instrutor: "Peça a um administrador para configurar o Bunny.").

- [ ] **Step 4: Rodar e ver passar; ajuda; commit**

Run: `npx vitest run src/admin-bunny-picker.test.tsx src/admin-content.test.tsx && npm run typecheck`. Expected: PASS.

```bash
git add src
git commit -m "feat: editor da aula busca vídeos na biblioteca do Bunny"
```

---

### Task 11: Arrastar e soltar na estrutura do curso

**Files:**
- Create: `src/reorder.ts`, `src/reorder.test.ts`, `src/pages/admin-drag.tsx`, `src/admin-reorder.test.tsx`
- Modify: `src/pages/admin.tsx:428-459` (`OrderControl` passa a usar `persistOrder`), `src/pages/admin.tsx:663-985` (linhas de módulo, seção e aula), `src/admin-content.css`
- Modify: artigo `criar-curso`

**Interfaces:**
- Produces:
  - `moveItem<T>(items: readonly T[], from: number, to: number): T[]` em `src/reorder.ts` (devolve cópia; índices fora do intervalo ou iguais devolvem a mesma ordem).
  - `persistOrder(entity: string, ordered: Row[]): Promise<void>` em `src/pages/admin-drag.tsx`: grava `order_index` só de quem mudou (o laço que hoje está em `OrderControl`).
  - `useDragOrder(entity: string, siblings: Row[]): { rowProps: (row: Row) => HTMLAttributes<HTMLElement>; handle: (row: Row) => ReactNode; busy: boolean }`. O item arrastado fica em estado do próprio hook, não no `dataTransfer`, e só aceita queda vinda da mesma lista.

- [ ] **Step 1: Escrever os testes que falham**

`src/reorder.test.ts`: `moveItem(["a","b","c"], 2, 0)` → `["c","a","b"]`; `(…, 0, 2)` → `["b","c","a"]`; `(…, 1, 1)` → igual; `(…, 5, 0)` → igual.
`src/admin-reorder.test.tsx` (`dataTransfer` falso com `setData`, `getData`, `effectAllowed`, `dropEffect`):
- `"alça aparece só com Reordenar ligado e as setas continuam"`, com a dica "Arraste pela alça ou use Subir e Descer para mudar a ordem.".
- `"arrastar a terceira aula para o topo grava as novas posições"`: `app_admin_save` com `order_index` 0, 1 e 2 só nos itens que mudaram.
- `"soltar no mesmo lugar não grava nada"`.
- `"soltar aula em outra seção não faz nada"`.
- `"erro ao gravar mostra aviso e recarrega a estrutura"`.

- [ ] **Step 2: Rodar e ver falhar**

Expected: FAIL.

- [ ] **Step 3: Implementar**

Alça `GripVertical` com rótulo "Arrastar {título}" e `draggable` só com Reordenar ligado; linha de destino com a cor de ação do DS; arraste desligado enquanto grava. `OrderControl` chama `persistOrder`.

- [ ] **Step 4: Rodar e ver passar; ajuda; commit**

Run: `npx vitest run src/reorder.test.ts src/admin-reorder.test.tsx src/admin-content.test.tsx src/admin-default-section.test.tsx && npm run typecheck`. Expected: PASS.

```bash
git add src
git commit -m "feat: reordenar a estrutura do curso arrastando, mantendo as setas"
```

---

### Task 12: Editar apresentação a partir da lista de cursos

**Files:**
- Create: `src/pages/admin-presentation-picker.tsx`, `src/admin-presentation-picker.test.tsx`
- Modify: `src/pages/admin.tsx:460-503` (`AdminCourses`)
- Modify: artigo `apresentacao-da-aula`

**Interfaces:**
- Consumes: `useAll`, `text` (Task 7).
- Produces: `PresentationPicker({ course }: { course: Row }): JSX.Element` (botão "Editar apresentação" e modal "Escolha a aula").

- [ ] **Step 1: Escrever os testes que falham**

- `"lista as aulas do curso por módulo, na ordem da estrutura"`.
- `"aula arquivada fica de fora"`.
- `"cada aula leva ao editor de apresentação"`: `href` `/admin/cursos/<curso>/aulas/<aula>/apresentacao`.
- `"curso sem aulas mostra o vazio com o link para Estrutura e aulas"`: "Este curso ainda não tem aulas." e `href` `/admin/cursos/<curso>?aba=estrutura`.

- [ ] **Step 2: Rodar e ver falhar; implementar; rodar e ver passar**

Run: `npx vitest run src/admin-presentation-picker.test.tsx && npm run typecheck`. Expected: FAIL e depois PASS. O botão entra entre "Editar curso" e "Estrutura e aulas".

- [ ] **Step 3: Ajuda e commit**

```bash
git add src
git commit -m "feat: lista de cursos abre a apresentação de cada aula"
```

---

### Task 13: Ajuda em popup

**Files:**
- Create: `src/pages/help-article.tsx` (renderizador de artigo e da página inicial da ajuda extraídos de `src/pages/help.tsx:66-200`), `src/help-link.tsx`, `src/help-link.test.tsx`
- Modify: `src/pages/help.tsx` (usa os renderizadores extraídos), `src/pages/admin-surface.tsx:35`, `src/pages/admin.tsx:785`, `src/pages/events.tsx:214`, `src/pages/certificates.tsx:327`, `src/pages/community.tsx:127`, `src/pages/support.tsx:41-44,58,63,91`, `src/tour.tsx:418`, `src/pages/checkout.tsx:331`, CSS do modal largo (`src/style.css`, perto de `.dialog`)
- Modify: testes existentes que esperam navegação nesses links (`src/help-page.test.tsx`, `src/layout.test.tsx`, `src/support.test.tsx` e o que o `npm test` apontar)

**Interfaces:**
- Produces: `HelpLink({ to, children, className }: { to: string; children: ReactNode; className?: string }): JSX.Element`, onde `to` é `"/ajuda"` ou `"/ajuda/<slug>"` (o mesmo valor que os `Link` usam hoje, inclusive `helpPathFor(...)`). O conteúdo da ajuda é carregado sob demanda (`import()`) só ao abrir, como a Central já faz.

- [ ] **Step 1: Escrever os testes que falham**

`src/help-link.test.tsx`:
- `"link de ajuda abre o artigo num popup sem sair da tela"`: título do artigo dentro de `role="dialog"` e `location.pathname` inalterado.
- `"Abrir em uma nova janela aponta para o artigo da Central em nova aba"`: `href` `/app/ajuda/<slug>`, `target="_blank"`, `rel` com `noopener`, nome acessível "Abrir em uma nova janela".
- `"link para outro artigo troca o conteúdo e Voltar retorna"`.
- `"link para a Central abre busca e assuntos no popup"`.
- `"artigo de módulo desligado mostra Artigo não encontrado para o aluno"`.
- `"Ajuda da administração abre em popup"` (render de `AdminSurface`).

- [ ] **Step 2: Rodar e ver falhar**

Expected: FAIL.

- [ ] **Step 3: Implementar**

Extrair o renderizador sem mudar a página `/ajuda`. O popup usa `Modal` com classe de largura de leitura, guarda a pilha de artigos em estado, aplica o mesmo filtro de visibilidade da página e mostra a avaliação "Este artigo ajudou?" como a página. Link externo continua `target="_blank"`. Trocar todos os links listados; o item "Central de ajuda" do menu (`src/shell.tsx:164`) e o link da tela de entrada (`src/pages/access.tsx:65`) continuam como `Link`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npm run typecheck`. Expected: PASS. Conferir no `npm run build` que o conteúdo da ajuda continua num chunk separado (`ls dist/assets | grep -i help`).

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: links de ajuda abrem em popup com opção de nova janela"
```

---

### Task 14: Rascunho local nos formulários

**Files:**
- Create: `src/draft.ts`, `src/draft.test.tsx`
- Modify: `src/ui.tsx:290-395` (`Form`), `src/rich.tsx:46-90` (`RichEditor` recebe o valor recuperado), `src/shell.tsx` (provê o dono do rascunho), `src/api.ts:56-63` (`signOut`), `src/auth.tsx:53` (`SIGNED_OUT`), `src/pages/admin-lesson-presentation.tsx:357` (formulário próprio)
- Modify: formulários que não guardam rascunho (`draft={false}`): `src/pages/admin-integrations.tsx`, `src/pages/checkout.tsx`, os de senha, segundo fator e reautenticação em `src/pages/settings.tsx`, ficha do membro e pedidos de privacidade em `src/pages/admin.tsx`, motivos de moderação e denúncia (`src/pages/community.tsx`, `src/pages/admin-lesson-comments.tsx` e onde mais houver motivo de moderação)
- Modify: telas com vários registros na mesma rota passam `draft={id}` (editores de material, pasta, estrutura, espaços, planos)
- Modify: artigo `administracao` (seção sobre rascunho)

**Interfaces:**
- Produces:
  - `src/draft.ts`: `draftPrefix = "icarus:draft:"`; `draftStorageKey(owner: string, scope: string): string`; `readDraft(key: string): { savedAt: number; fields: [string, string][] } | null` (nulo se ausente, com mais de 7 dias ou se o storage falhar; o vencido é apagado); `writeDraft(key: string, fields: [string, string][]): void`; `clearDraft(key: string): void`; `clearAllDrafts(): void`; `draftFields(form: HTMLFormElement): [string, string][]` (ignora arquivo, `type="password"`, `[data-sensitive]`, `[data-no-draft]` e o que estiver dentro deles); `restoreDraft(form: HTMLFormElement, fields: [string, string][]): void` (preenche texto, select simples e múltiplo, checkbox e rádio por nome e valor, e dispara `new CustomEvent("draftrestore", { detail: valor })` em cada campo restaurado).
  - `DraftOwner = createContext<string | null>(null)` em `src/ui.tsx`; `Shell` envolve o conteúdo com `<DraftOwner.Provider value={profile.id}>`. Sem dono, nenhum rascunho (cobre entrada, cadastro e telas públicas).
  - `Form` ganha `draft?: false | string`. Escopo da chave: `` `${pathname}${search}|${label}|${draft || ""}` ``.

- [ ] **Step 1: Escrever os testes que falham**

`src/draft.test.tsx` (`vi.useFakeTimers()`):
- `"digitar guarda o rascunho depois de meio segundo"`.
- `"reabrir oferece recuperar e preenche texto, checkbox, select e texto rico"`: aviso "Há um rascunho não salvo de hoje às HH:MM."; "Recuperar rascunho" preenche e não envia o formulário.
- `"salvar com sucesso apaga o rascunho"`.
- `"Descartar apaga e esconde o aviso"`.
- `"senha, campo sensível, data-no-draft e arquivo ficam de fora"`.
- `"draft={false} não guarda nada"` e `"sem DraftOwner não guarda nada"`.
- `"rascunho com mais de 7 dias é ignorado e apagado"`.
- `"localStorage que lança erro não quebra o formulário"`: `getItem`/`setItem` lançam; salvar funciona e não aparece aviso.
- `"SIGNED_OUT apaga todos os rascunhos do Icarus"`: chaves com `icarus:draft:` somem, outras chaves continuam.
- `"rascunho igual ao formulário não mostra aviso"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/draft.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`Form` grava só depois de uma digitação do usuário (no `onInput` existente), com espera de 500 ms; mostra o aviso no topo do formulário, no padrão `Notice`, com "Recuperar rascunho" e "Descartar". Data no aviso: "hoje às 14:32", "ontem às 14:32" ou "28/11 às 14:32". `RichEditor` escuta `draftrestore` no input escondido e aplica `editor.commands.setContent(sanitizeRich(valor))` e `setHtml`. O editor de apresentação guarda o próprio estado como um campo JSON com os mesmos helpers. `signOut` e o evento `SIGNED_OUT` chamam `clearAllDrafts()`.

- [ ] **Step 4: Marcar as exceções e rodar tudo**

Run: `npm test && npm run typecheck`. Expected: PASS. Listar no relatório da tarefa cada formulário com `draft={false}` e o motivo.

- [ ] **Step 5: Ajuda e commit**

```bash
git add src
git commit -m "feat: rascunho local recupera o que foi digitado nos formulários"
```

---

### Task 15: Barra lateral recolhível com rodapé fixo

**Files:**
- Modify: `src/shell.tsx` (botão, estado, rótulos), `src/style.css:679-770`, `src/member-shell-stitch.css:40-60,195-260`
- Create: `src/sidebar.test.tsx`
- Modify: artigos `administracao` e o de navegação do aluno em `help-articles-member.ts`; passo `navigation` do tour, se citar a barra

**Interfaces:**
- Produces: `useSidebarCollapsed(area: "admin" | "member"): [boolean, (next: boolean) => void]` em `src/shell.tsx`, com a chave `icarus:sidebar:<area>` ("1" ou "0") em `try/catch`. O `.app-shell` ganha `data-sidebar="collapsed"` quando recolhida. Cada item da navegação passa a ter o texto em `<span className="rail-label">` e `data-label` com o nome.

- [ ] **Step 1: Escrever os testes que falham**

- `"Recolher menu recolhe a barra e guarda a escolha"`: `aria-expanded` vira `false`, rótulo vira "Expandir menu", `data-sidebar="collapsed"` e `localStorage["icarus:sidebar:admin"] === "1"`.
- `"barra recolhida mantém o nome de cada link para leitor de tela"`: `getByRole("link", { name: "Cursos e aulas" })`.
- `"painel e área do aluno guardam escolhas separadas"`.
- `"sem localStorage a barra começa expandida e alterna sem erro"`.
- `"a gaveta do celular não tem o botão de recolher"`.

- [ ] **Step 2: Rodar e ver falhar**

Expected: FAIL.

- [ ] **Step 3: Implementar**

Botão no topo da barra (só desktop, fora da gaveta) com `PanelLeftClose`/`PanelLeftOpen`, `aria-controls` no `aside`. Recolhida: coluna de 72 px, `.rail-label` visualmente escondido (padrão `sr-only`), rótulos de grupo escondidos, dica com `data-label` no `:hover` e no `:focus-visible`, marca reduzida ao ícone (favicon da instalação ou o do Icarus). Rodapé fixo: a barra não rola (`overflow: hidden`), a `nav` ocupa o espaço com `flex: 1 1 auto; min-height: 0; overflow-y: auto`, e `.rail-bottom` fica embaixo com `border-top: 1px solid var(--ic-border)`; vale para a gaveta também. Transição de 160 ms com `@media (prefers-reduced-motion: reduce)` sem animação.

- [ ] **Step 4: Rodar e ver passar; ajuda; commit**

Run: `npx vitest run src/sidebar.test.tsx src/layout.test.tsx src/member-shell.test.tsx && npm run typecheck`. Expected: PASS.

```bash
git add src
git commit -m "feat: barra lateral recolhível com rodapé fixo no painel e na área do aluno"
```

---

### Task 16: Contorno do filtro de aulas e lupa da busca

**Files:**
- Modify: `src/lesson-stitch.css:871-882` (remover o bloco `[data-theme="light"] .stitch-curriculum-field::before` e o `padding-inline: 12px` que o compensava)
- Modify: `src/pages/lesson-presentation.css:231,281,301` (conferir; corrigir o que for borda fora do DS)
- Modify: `src/member-shell-stitch.css:285-310,644-652,723-740` e `src/pages/member-search.css:15-20` (lupa)

**Interfaces:** nenhuma.

- [ ] **Step 1: Varredura**

Run: `grep -rnE "border(-[a-z]+)?: [0-9.]+px (solid|dashed) #|outline: [0-9.]+px solid #" src --include=*.css` e `grep -rn "::before\|::after" src --include=*.css | grep -i "border"`. Listar cada ocorrência como defeito (borda desenhada fora dos tokens, campo dentro de campo) ou intencional, com o motivo.

- [ ] **Step 2: Corrigir**

Remover o contorno do filtro e os outros defeitos da lista. Lupa: `.member-search-field > button` com `background: var(--ic-action)`, `color: var(--ic-on-action)` e hover em `var(--ic-action-hover)`, nas larguras em que a lupa é um botão separado do campo (imagem `05-lupa-busca.png`).

- [ ] **Step 3: Conferir no navegador**

`npx vite --mode demo --host 127.0.0.1 --port 8091 --strictPort`, entrar como aluno, abrir uma aula e o topo em 360 px, 768 px e 1280 px, nos dois temas (`document.documentElement.dataset.theme = "dark"`). Capturar antes e depois do filtro (com zoom no campo) e da lupa. Registrar se a lupa no desktop pede a mesma mudança e o que foi feito.

- [ ] **Step 4: Rodar a suíte e commit**

Run: `npx vitest run src/lesson-stitch.test.tsx src/member-search.test.tsx src/member-shell.test.tsx`. Expected: PASS.

```bash
git add src
git commit -m "fix: tira o contorno fora do design system e destaca a lupa da busca"
```

---

### Task 17: Tela de sucesso no cadastro e na recuperação

**Files:**
- Modify: `src/pages/access.tsx:364-575` (`Access`)
- Modify: `src/login.test.tsx` (casos novos, no arranjo `setup()` existente, com rota de `/signup`, `/recover` e `/resend` no `fetch` falso)
- Modify: artigo de acesso do aluno em `src/pages/help-articles-member.ts` (o que cita a mensagem depois de criar conta ou recuperar)

**Interfaces:**
- Produces: `Access` guarda `sent: { mode: "register" | "forgot" | "confirm"; email: string } | null`; com `sent`, troca `Heading` e `Form` pela tela de confirmação. `Form` dessas três telas recebe `successMessage=""`.

- [ ] **Step 1: Escrever os testes que falham**

Em `src/login.test.tsx`, com `app_public_context` devolvendo `{registration_enabled: true, legal_ready: true, legal_versions: [{id: "v1"}]}` nos casos de cadastro:
- `"criar conta troca o formulário pela tela Confira seu email com o endereço"`: depois do envio, `heading` nível 1 "Confira seu email" com foco, texto com `ana@example.test`, nenhum `form`, nenhum "Salvo com sucesso.", links "Voltar para entrar" (`/entrar?returnTo=…`) e "Reenviar confirmação" (`/confirmar-email?returnTo=…`).
- `"erro no cadastro mantém o formulário e mostra o erro"`: `/signup` 422 → formulário continua, alerta com a mensagem.
- `"recuperar acesso mostra a confirmação e Enviar de novo volta ao formulário"`.
- `"reenviar confirmação mostra a confirmação"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/login.test.tsx`. Expected: FAIL nos quatro casos novos.

- [ ] **Step 3: Implementar**

Textos literais da seção 16 da spec. Ícone `MailCheck` do lucide, título com `Heading` (o `RouteFocus` foca o novo H1), email em `<strong>`. O `finally` que reinicia o Turnstile e limpa a senha continua.

- [ ] **Step 4: Rodar e ver passar; ajuda; commit**

Run: `npx vitest run src/login.test.tsx src/captcha.test.tsx && npm run typecheck`. Expected: PASS.

```bash
git add src
git commit -m "feat: cadastro e recuperação de acesso mostram tela de confirmação"
```

---

### Task 18: Avançar para a próxima aula automaticamente

**Files:**
- Create: `supabase/migrations/202611280005_auto_advance.sql`, `supabase/tests/auto_advance.sql`
- Modify: `supabase/functions/media/index.ts:17` (`enablejsapi=1` no embed do YouTube), `tests/integration/edge_test.ts:310` (teste do YouTube)
- Modify: `src/bunny.tsx` (prop `onEnded`), `src/pages/learning.tsx:520-840` (interruptor, fim do vídeo, avanço), `src/api.ts` (tipo `Profile` ganha `auto_advance`)
- Create: `src/youtube-ended.ts`, `src/lesson-auto-advance.test.tsx`
- Modify: `demo/transport.ts` (perfil com `auto_advance`, `app_profile` aceita a chave), artigo `recursos-da-aula` em `src/pages/help-articles-member.ts`

**Interfaces:**
- Produces:
  - `profiles.auto_advance boolean not null default false`; `app_profile(p_data)` aceita `auto_advance` (booleano, recusa outro tipo); `app_private.profile_json` devolve `auto_advance`. Recriar a partir de `202611230007_private_uploads.sql` (`app_profile`) e `202611250009_student_experience.sql` (`profile_json`).
  - `BunnyPlayer` ganha `onEnded?: () => void`, ligado ao evento `ended` do player.js.
  - `watchYouTubeEnded(iframe: HTMLIFrameElement, onEnded: () => void): () => void` em `src/youtube-ended.ts`: envia `{"event":"listening"}` ao iframe no `load`, aceita só mensagens com `origin === "https://www.youtube-nocookie.com"` e `source === iframe.contentWindow`, chama `onEnded` quando chega `onStateChange` com `info === 0`; devolve a função que remove o ouvinte.

- [ ] **Step 1: Escrever os testes que falham**

SQL `auto_advance.sql`: perfil novo nasce com `auto_advance = false`; `app_profile('{"auto_advance":true}')` grava e devolve `true`; `app_profile('{"auto_advance":"sim"}')` falha. Deno: o teste do YouTube passa a esperar `?rel=0&enablejsapi=1`. Vitest `src/lesson-auto-advance.test.tsx` (molde de `src/lesson-stitch.test.tsx`):
- `"interruptor grava a preferência no perfil"`: clicar em "Avançar para a próxima aula automaticamente" chama `app_profile` com `{auto_advance: true}`.
- `"com a opção ligada, Marcar como concluída leva à próxima aula"`.
- `"com a opção desligada, Marcar como concluída fica na aula"`.
- `"fim do vídeo com a opção ligada conclui a aula e conta 5 segundos com Ir agora e Cancelar"`; `"Cancelar fica na aula"`; após 5 s (timers falsos), a rota é a da próxima aula.
- `"fim do vídeo com a opção desligada não conclui nem avança"`.
- `"não avança sem próxima aula, para aula sem acesso ou quando sai certificado"`.
- `"watchYouTubeEnded ignora mensagem de outra origem e chama onEnded no estado 0"` (teste da função).

- [ ] **Step 2: Rodar e ver falhar**

Expected: FAIL em todos.

- [ ] **Step 3: Implementar**

Migration com `revoke`/`grant` iguais aos das funções recriadas. Na aula: uma função só, `finishLesson(origin: "button" | "ended")`, faz o `app_progress` com `p_complete: true` (o que o botão já faz) e decide o avanço; a próxima aula sai de `data.next_id` e o acesso vem da lista do curso já carregada. Contagem em texto com `aria-live="polite"`, sem animação com `prefers-reduced-motion`. Vídeo nativo e áudio usam `onEnded`; Bunny usa `onEnded`; YouTube usa `watchYouTubeEnded` no `ref` do iframe.

- [ ] **Step 4: Rodar e ver passar**

Run: SQL do `auto_advance`, `node scripts/test-integrations.mjs`, `npx vitest run src/lesson-auto-advance.test.tsx src/lesson-stitch.test.tsx src/bunny.test.tsx src/lesson-engagement.test.tsx && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Ajuda e commit**

Artigo `recursos-da-aula`: a opção, quando avança e quando não avança.

```bash
git add supabase src tests demo
git commit -m "feat: opção de avançar para a próxima aula automaticamente"
```

---

### Task 19: Versão 2.13.0, verificação completa e PR

**Files:**
- Modify: `package.json`, `package-lock.json` (versão `2.13.0`), `CHANGELOG.md`, `docs/operations.md`, `docs/CONTRACT.md`
- Create: `docs/superpowers/plans/2026-11-28-melhorias-painel-verificacao.md` (registro das verificações)

**Interfaces:**
- Consumes: tudo acima.

- [ ] **Step 1: Changelog e guia**

Entrada `## 2.13.0 · <data>` no padrão das anteriores, cobrindo os 17 itens e "Para atualizar da 2.12.0, aplique as migrations `202611280001` a `202611280005`, publique as Edge Functions `upload`, `capabilities` e `media` e então publique o frontend." Guia de operação sem envio de vídeo e com a exclusão definitiva.

- [ ] **Step 2: Verificação local completa**

Run, em ordem: `npm run typecheck`, `npm test`, `node scripts/test-integrations.mjs`, `node --test scripts/clean-install.test.mjs scripts/local.test.mjs`, todos os `supabase/tests/*.sql` no banco descartável depois de `SUPABASE_PROFILE=supabase supabase --workdir "$Q" db reset` (instalação limpa com as quatro migrations), `npm run build`, `npm run build:demo`. Expected: tudo sai 0. Os `.py` de concorrência ficam de fora (exigem o ambiente oficial); dizer isso no registro.

- [ ] **Step 3: Navegador real**

Seguir a sequência da seção Verificação da spec em Chrome (demo para telas; stack real ou banco descartável com a função local para envio e exclusão de arquivo, porque a demo não tem Storage), em 360 px e desktop, nos dois temas. Perfil do Chrome: perguntar a Tibério qual usar antes de abrir o Chrome dele; sem resposta, usar o Chromium isolado do Playwright (memória `reference_qa_navegador_icarus_sem_stack_local`). Registrar capturas e achados no arquivo de verificação; corrigir o que aparecer antes de seguir.

- [ ] **Step 4: Revisão final e orçamento de CI**

Revisão independente do branch inteiro (`superpowers:requesting-code-review`). Antes do PR, conferir que o único workflow ativo é `.github/workflows/demo-pages.yml` e estimar minutos de runner a partir das execuções recentes (`gh run list --workflow demo-pages.yml --limit 5`).

- [ ] **Step 5: Commit e PR**

```bash
git add package.json package-lock.json CHANGELOG.md docs
git commit -m "chore: Icarus 2.13.0"
git push -u origin HEAD
gh pr create --title "feat: Icarus 2.13.0 com melhorias do painel e da área do aluno" --body-file <corpo em ~/ai/projetos/icarus-area-de-membros/docs/>
```

Sem merge e sem publicação até Tibério autorizar.
