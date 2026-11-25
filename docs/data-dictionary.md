# Dicionário de dados do Icarus

**52 tabelas e 376 colunas** nos esquemas `public` e `app_private`.

Veja o [mapa técnico](architecture.md) para localizar os fluxos e visualizar os relacionamentos. Este inventário descreve a estrutura das tabelas da aplicação. Os esquemas gerenciados pelo Supabase, `auth` e `storage`, aparecem quando são destino de uma chave estrangeira.

Gerado por [schema-dictionary.sql](schema-dictionary.sql) a partir do catálogo do PostgreSQL. Para atualizar, aplique as migrations em um banco de teste e execute `psql -XAtq -f docs/schema-dictionary.sql > docs/data-dictionary.md` com a conexão apontada para esse banco. “RLS” indica se a proteção está ativada na tabela. Para as regras efetivas, consulte as migrations e o contrato das RPCs.

## `app_private.catalog_launch_signups`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `launch_id` | `uuid` | Não | — |
| `user_id` | `uuid` | Não | — |
| `subscribed_at` | `timestamp with time zone` | Não | `clock_timestamp()` |

**Chaves e restrições**

- `catalog_launch_signups_pkey` — `PRIMARY KEY (launch_id, user_id)`
- `catalog_launch_signups_launch_id_fkey` — `FOREIGN KEY (launch_id) REFERENCES app_private.catalog_launches(id)`
- `catalog_launch_signups_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`

**Índices adicionais**

- `CREATE INDEX catalog_launch_signups_owner ON app_private.catalog_launch_signups USING btree (user_id, subscribed_at, launch_id)`

## `app_private.catalog_launches`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `course_id` | `uuid` | Sim | — |
| `module_id` | `uuid` | Sim | — |
| `title` | `text` | Não | — |
| `summary` | `text` | Não | — |
| `planned_on` | `date` | Sim | — |
| `enabled` | `boolean` | Não | — |
| `released_at` | `timestamp with time zone` | Sim | — |

**Chaves e restrições**

- `catalog_launches_pkey` — `PRIMARY KEY (id)`
- `catalog_launches_course_id_key` — `UNIQUE (course_id)`
- `catalog_launches_module_id_key` — `UNIQUE (module_id)`
- `catalog_launches_course_id_fkey` — `FOREIGN KEY (course_id) REFERENCES public.courses(id)`
- `catalog_launches_module_id_fkey` — `FOREIGN KEY (module_id) REFERENCES public.modules(id)`
- `catalog_launches_check` — `CHECK ((num_nonnulls(course_id, module_id) = 1))`
- `catalog_launches_summary_check` — `CHECK (((char_length(summary) >= 1) AND (char_length(summary) <= 500)))`
- `catalog_launches_title_check` — `CHECK (((char_length(title) >= 1) AND (char_length(title) <= 160)))`

## `app_private.installation_brand`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `singleton` | `boolean` | Não | `true` |
| `name` | `text` | Não | `'Icarus'::text` |
| `revision` | `integer` | Não | `0` |
| `logo_light` | `text` | Sim | — |
| `logo_dark` | `text` | Sim | — |
| `icon` | `text` | Sim | — |

**Chaves e restrições**

- `installation_brand_pkey` — `PRIMARY KEY (singleton)`
- `installation_brand_icon_check` — `CHECK ((icon ~ '^icon/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'::text))`
- `installation_brand_logo_dark_check` — `CHECK ((logo_dark ~ '^logo/dark-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp)$'::text))`
- `installation_brand_logo_light_check` — `CHECK ((logo_light ~ '^logo/light-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|webp)$'::text))`
- `installation_brand_name_check` — `CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)))`
- `installation_brand_revision_check` — `CHECK ((revision >= 0))`
- `installation_brand_singleton_check` — `CHECK (singleton)`

## `app_private.installation_modules`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `key` | `text` | Não | — |
| `enabled` | `boolean` | Não | `true` |

**Chaves e restrições**

- `installation_modules_pkey` — `PRIMARY KEY (key)`
- `installation_modules_key_check` — `CHECK ((key = ANY (ARRAY['community'::text, 'materials'::text, 'podcasts'::text, 'ranking'::text, 'live_events'::text, 'support'::text, 'help'::text, 'feedback'::text])))`

## `app_private.local_demo_guard`

RLS desativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `singleton` | `boolean` | Não | `true` |
| `enabled` | `boolean` | Não | `false` |

**Chaves e restrições**

- `local_demo_guard_pkey` — `PRIMARY KEY (singleton)`
- `local_demo_guard_singleton_check` — `CHECK (singleton)`

## `app_private.ranking_events`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `kind` | `text` | Não | — |
| `recipient_id` | `uuid` | Não | — |
| `source_id` | `uuid` | Não | — |
| `actor_id` | `uuid` | Não | — |
| `occurred_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `ranking_events_pkey` — `PRIMARY KEY (kind, recipient_id, source_id, actor_id)`
- `ranking_events_actor_id_fkey` — `FOREIGN KEY (actor_id) REFERENCES app_private.ranking_subjects(profile_id) ON DELETE CASCADE`
- `ranking_events_recipient_id_fkey` — `FOREIGN KEY (recipient_id) REFERENCES app_private.ranking_subjects(profile_id) ON DELETE CASCADE`
- `ranking_events_check` — `CHECK (((kind = 'like'::text) = (recipient_id <> actor_id)))`
- `ranking_events_kind_check` — `CHECK ((kind = ANY (ARRAY['post'::text, 'reply'::text, 'like'::text, 'lesson'::text, 'certificate'::text])))`

**Índices adicionais**

- `CREATE INDEX ranking_events_actor ON app_private.ranking_events USING btree (actor_id)`
- `CREATE INDEX ranking_events_period ON app_private.ranking_events USING btree (occurred_at)`
- `CREATE INDEX ranking_events_recipient ON app_private.ranking_events USING btree (recipient_id)`

## `app_private.ranking_subjects`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `profile_id` | `uuid` | Não | — |

**Chaves e restrições**

- `ranking_subjects_pkey` — `PRIMARY KEY (profile_id)`
- `ranking_subjects_profile_id_fkey` — `FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE`

## `public.app_sessions`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | — |
| `user_id` | `uuid` | Não | — |
| `last_activity_at` | `timestamp with time zone` | Não | `now()` |
| `expires_at` | `timestamp with time zone` | Não | — |
| `revoked_at` | `timestamp with time zone` | Sim | — |
| `remember_until` | `timestamp with time zone` | Sim | — |

`remember_until` só é gravado por `app_remember_session`, 15 dias após `auth.sessions.created_at`. Com ele, a sessão ignora a inatividade e termina nesse instante.

**Chaves e restrições**

- `app_sessions_pkey` — `PRIMARY KEY (id)`
- `app_sessions_id_fkey` — `FOREIGN KEY (id) REFERENCES auth.sessions(id) ON DELETE CASCADE`
- `app_sessions_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`

## `public.audit_events`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `actor_id` | `uuid` | Sim | — |
| `action` | `text` | Não | — |
| `target_type` | `text` | Não | — |
| `target_id` | `uuid` | Sim | — |
| `reason` | `text` | Sim | — |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `audit_events_pkey` — `PRIMARY KEY (id)`
- `audit_events_actor_id_fkey` — `FOREIGN KEY (actor_id) REFERENCES public.profiles(id)`

**Índices adicionais**

- `CREATE INDEX audit_events_date ON public.audit_events USING btree (created_at DESC, id)`

## `public.certificates`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `user_id` | `uuid` | Não | — |
| `course_id` | `uuid` | Não | — |
| `curriculum_version` | `integer` | Não | — |
| `code` | `text` | Não | `encode(extensions.gen_random_bytes(24), 'hex'::text)` |
| `student_name` | `text` | Não | — |
| `course_title` | `text` | Não | — |
| `duration_minutes` | `integer` | Não | — |
| `lesson_ids` | `uuid[]` | Não | — |
| `issued_at` | `timestamp with time zone` | Não | `now()` |
| `revoked_at` | `timestamp with time zone` | Sim | — |
| `demo` | `boolean` | Não | `false` |
| `signer_name` | `text` | Não | `''::text` |
| `signer_title` | `text` | Não | `''::text` |
| `signature_url` | `text` | Sim | — |
| `signature_path` | `text` | Sim | — |

**Chaves e restrições**

- `certificates_pkey` — `PRIMARY KEY (id)`
- `certificates_code_key` — `UNIQUE (code)`
- `certificates_user_id_course_id_curriculum_version_key` — `UNIQUE (user_id, course_id, curriculum_version)`
- `certificates_course_id_fkey` — `FOREIGN KEY (course_id) REFERENCES public.courses(id)`
- `certificates_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`
- `certificates_duration_minutes_check` — `CHECK ((duration_minutes >= 0))`
- `certificates_lesson_ids_check` — `CHECK ((cardinality(lesson_ids) > 0))`
- `certificates_signature_path_check` — `CHECK ((signature_path ~ '^signature/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'::text))`

## `public.courses`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `slug` | `text` | Não | — |
| `title` | `text` | Não | — |
| `description` | `text` | Não | `''::text` |
| `cover_url` | `text` | Sim | — |
| `status` | `text` | Não | `'draft'::text` |
| `previous_status` | `text` | Sim | — |
| `access_mode` | `text` | Não | `'subscribers'::text` |
| `plan_ids` | `uuid[]` | Não | `'{}'::uuid[]` |
| `certificate_enabled` | `boolean` | Não | `false` |
| `curriculum_version` | `integer` | Não | `1` |
| `required_lesson_ids` | `uuid[]` | Não | `'{}'::uuid[]` |
| `created_at` | `timestamp with time zone` | Não | `now()` |
| `updated_at` | `timestamp with time zone` | Não | `now()` |
| `signer_name` | `text` | Não | `''::text` |
| `signer_title` | `text` | Não | `''::text` |
| `signature_url` | `text` | Sim | — |
| `signature_path` | `text` | Sim | — |

**Chaves e restrições**

- `courses_pkey` — `PRIMARY KEY (id)`
- `courses_slug_key` — `UNIQUE (slug)`
- `courses_access_mode_check` — `CHECK ((access_mode = ANY (ARRAY['members'::text, 'subscribers'::text, 'plans'::text])))`
- `courses_description_check` — `CHECK ((length(description) <= 20000))`
- `courses_signature_path_check` — `CHECK ((signature_path ~ '^signature/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'::text))`
- `courses_signer_name_check` — `CHECK ((length(signer_name) <= 160))`
- `courses_signer_title_check` — `CHECK ((length(signer_title) <= 160))`
- `courses_slug_check` — `CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))`
- `courses_status_check` — `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))`
- `courses_title_check` — `CHECK (((length(title) >= 1) AND (length(title) <= 200)))`

## `public.feedbacks`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `author_id` | `uuid` | Não | — |
| `attempt_key` | `uuid` | Não | — |
| `kind` | `text` | Não | — |
| `body` | `text` | Não | — |
| `page_path` | `text` | Sim | — |
| `browser_family` | `text` | Sim | — |
| `screenshot_id` | `uuid` | Sim | — |
| `status` | `text` | Não | `'new'::text` |
| `revision` | `integer` | Não | `1` |
| `created_at` | `timestamp with time zone` | Não | `now()` |
| `updated_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `feedbacks_pkey` — `PRIMARY KEY (id)`
- `feedbacks_author_id_attempt_key_key` — `UNIQUE (author_id, attempt_key)`
- `feedbacks_screenshot_id_key` — `UNIQUE (screenshot_id)`
- `feedbacks_author_id_fkey` — `FOREIGN KEY (author_id) REFERENCES public.profiles(id)`
- `feedbacks_screenshot_id_fkey` — `FOREIGN KEY (screenshot_id) REFERENCES public.uploads(id)`
- `feedbacks_body_check` — `CHECK (((length(body) >= 1) AND (length(body) <= 4000)))`
- `feedbacks_browser_family_check` — `CHECK ((browser_family = ANY (ARRAY['Chrome'::text, 'Safari'::text, 'Firefox'::text, 'Edge'::text, 'Opera'::text, 'Outro'::text])))`
- `feedbacks_kind_check` — `CHECK ((kind = ANY (ARRAY['suggestion'::text, 'bug'::text, 'other'::text])))`
- `feedbacks_page_path_check` — `CHECK ((page_path = ANY (ARRAY['/app'::text, '/app/cursos'::text, '/app/cursos/:curso'::text, '/app/cursos/:curso/:modulo'::text, '/app/cursos/:curso/:modulo/:aula'::text, '/app/materiais'::text, '/app/materiais/:pasta'::text, '/app/podcasts'::text, '/app/certificados'::text, '/app/encontros-ao-vivo'::text, '/app/notificacoes'::text, '/app/configuracoes'::text, '/app/comunidade'::text, '/app/comunidade/novo'::text, '/app/comunidade/:post'::text, '/app/comunidade/:post/editar'::text, '/app/suporte'::text, '/app/suporte/novo'::text, '/app/suporte/:ticket'::text])))`
- `feedbacks_status_check` — `CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'planned'::text, 'done'::text])))`

**Índices adicionais**

- `CREATE INDEX feedback_queue ON public.feedbacks USING btree (created_at DESC, id DESC)`

## `public.help_feedback`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `user_id` | `uuid` | Não | — |
| `page` | `text` | Não | — |
| `action` | `text` | Não | — |
| `rating` | `boolean` | Sim | — |
| `updated_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `help_feedback_pkey` — `PRIMARY KEY (user_id, page)`
- `help_feedback_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`
- `help_feedback_action_check` — `CHECK ((action = ANY (ARRAY['start'::text, 'pause'::text, 'skip'::text, 'complete'::text, 'rate'::text])))`
- `help_feedback_page_check` — `CHECK (((length(page) >= 1) AND (length(page) <= 200)))`

## `public.invitation_outbox`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `order_id` | `uuid` | Não | — |
| `status` | `text` | Não | `'pending'::text` |
| `created_at` | `timestamp with time zone` | Não | `now()` |
| `completed_at` | `timestamp with time zone` | Sim | — |
| `attempts` | `integer` | Não | `0` |
| `next_attempt_at` | `timestamp with time zone` | Não | `now()` |
| `claim_id` | `uuid` | Sim | — |
| `claimed_until` | `timestamp with time zone` | Sim | — |
| `sent_at` | `timestamp with time zone` | Sim | — |

**Chaves e restrições**

- `invitation_outbox_pkey` — `PRIMARY KEY (order_id)`
- `invitation_outbox_order_id_fkey` — `FOREIGN KEY (order_id) REFERENCES public.orders(id)`
- `invitation_outbox_attempts_check` — `CHECK ((attempts >= 0))`
- `invitation_outbox_status_check` — `CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'uncertain'::text, 'completed'::text])))`

**Índices adicionais**

- `CREATE INDEX invitation_outbox_due ON public.invitation_outbox USING btree (next_attempt_at, created_at) WHERE (status = 'pending'::text)`

## `public.legal_acceptances`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `user_id` | `uuid` | Sim | — |
| `order_id` | `uuid` | Sim | — |
| `legal_version_id` | `uuid` | Não | — |
| `accepted_at` | `timestamp with time zone` | Não | `now()` |
| `marketing_opt_in` | `boolean` | Não | `false` |

**Chaves e restrições**

- `legal_acceptances_pkey` — `PRIMARY KEY (id)`
- `legal_acceptances_legal_version_id_fkey` — `FOREIGN KEY (legal_version_id) REFERENCES public.legal_versions(id)`
- `legal_acceptances_order_id_fkey` — `FOREIGN KEY (order_id) REFERENCES public.orders(id)`
- `legal_acceptances_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`
- `legal_acceptances_check` — `CHECK (((user_id IS NOT NULL) OR (order_id IS NOT NULL)))`

## `public.legal_versions`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `kind` | `text` | Não | — |
| `version` | `text` | Não | — |
| `title` | `text` | Não | — |
| `body` | `text` | Não | — |
| `published` | `boolean` | Não | `false` |
| `demo` | `boolean` | Não | `false` |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `legal_versions_pkey` — `PRIMARY KEY (id)`
- `legal_versions_kind_version_key` — `UNIQUE (kind, version)`
- `legal_versions_body_check` — `CHECK (((length(body) >= 40) AND (length(body) <= 100000)))`
- `legal_versions_kind_check` — `CHECK ((kind = ANY (ARRAY['terms'::text, 'privacy'::text])))`
- `legal_versions_title_check` — `CHECK (((length(title) >= 1) AND (length(title) <= 200)))`
- `legal_versions_version_check` — `CHECK (((length(version) >= 1) AND (length(version) <= 80)))`

**Índices adicionais**

- `CREATE UNIQUE INDEX legal_one_active ON public.legal_versions USING btree (kind) WHERE published`

## `public.lesson_checklist_items`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `user_id` | `uuid` | Não | — |
| `lesson_id` | `uuid` | Não | — |
| `item_id` | `text` | Não | — |

**Chaves e restrições**

- `lesson_checklist_items_pkey` — `PRIMARY KEY (user_id, lesson_id, item_id)`
- `lesson_checklist_items_lesson_id_fkey` — `FOREIGN KEY (lesson_id) REFERENCES public.lesson_presentations(lesson_id)`
- `lesson_checklist_items_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`
- `lesson_checklist_items_item_id_check` — `CHECK (((item_id COLLATE "C") ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'::text))`

**Índices adicionais**

- `CREATE INDEX lesson_checklist_items_definition ON public.lesson_checklist_items USING btree (lesson_id, item_id)`

## `public.lesson_comments`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `lesson_id` | `uuid` | Não | — |
| `author_id` | `uuid` | Não | — |
| `parent_id` | `uuid` | Sim | — |
| `body` | `text` | Não | — |
| `status` | `text` | Não | `'pending'::text` |
| `is_instructor` | `boolean` | Não | — |
| `created_at` | `timestamp with time zone` | Não | `clock_timestamp()` |

**Chaves e restrições**

- `lesson_comments_pkey` — `PRIMARY KEY (id)`
- `lesson_comments_lesson_id_id_key` — `UNIQUE (lesson_id, id)`
- `lesson_comments_author_id_fkey` — `FOREIGN KEY (author_id) REFERENCES public.profiles(id)`
- `lesson_comments_lesson_id_fkey` — `FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)`
- `lesson_comments_lesson_id_parent_id_fkey` — `FOREIGN KEY (lesson_id, parent_id) REFERENCES public.lesson_comments(lesson_id, id)`
- `lesson_comments_body_check` — `CHECK (((length(body) >= 1) AND (length(body) <= 10000)))`
- `lesson_comments_check` — `CHECK ((id IS DISTINCT FROM parent_id))`
- `lesson_comments_status_check` — `CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))`

**Índices adicionais**

- `CREATE INDEX lesson_comments_page ON public.lesson_comments USING btree (lesson_id, created_at, id)`

## `public.lesson_favorites`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `user_id` | `uuid` | Não | — |
| `lesson_id` | `uuid` | Não | — |

**Chaves e restrições**

- `lesson_favorites_pkey` — `PRIMARY KEY (user_id, lesson_id)`
- `lesson_favorites_lesson_id_fkey` — `FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)`
- `lesson_favorites_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`

## `public.lesson_notes`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `user_id` | `uuid` | Não | — |
| `lesson_id` | `uuid` | Não | — |
| `body` | `text` | Não | — |
| `position_seconds` | `numeric` | Sim | — |
| `updated_at` | `timestamp with time zone` | Não | `clock_timestamp()` |

**Chaves e restrições**

- `lesson_notes_pkey` — `PRIMARY KEY (id)`
- `lesson_notes_lesson_id_fkey` — `FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)`
- `lesson_notes_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`
- `lesson_notes_body_check` — `CHECK (((length(body) >= 1) AND (length(body) <= 2000)))`
- `lesson_notes_position_seconds_check` — `CHECK (((position_seconds >= (0)::numeric) AND (position_seconds <= (86400)::numeric)))`

**Índices adicionais**

- `CREATE INDEX lesson_notes_owner_page ON public.lesson_notes USING btree (user_id, lesson_id, updated_at DESC, id)`

## `public.lesson_presentations`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `lesson_id` | `uuid` | Não | — |
| `presentation` | `jsonb` | Não | — |

**Chaves e restrições**

- `lesson_presentations_pkey` — `PRIMARY KEY (lesson_id)`
- `lesson_presentations_lesson_id_fkey` — `FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)`
- `lesson_presentations_presentation_check` — `CHECK (((jsonb_typeof(presentation) = 'object'::text) AND (pg_column_size(presentation) <= 65536)))`

## `public.lesson_progress`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `user_id` | `uuid` | Não | — |
| `lesson_id` | `uuid` | Não | — |
| `position_seconds` | `numeric` | Não | `0` |
| `completed_at` | `timestamp with time zone` | Sim | — |
| `updated_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `lesson_progress_pkey` — `PRIMARY KEY (user_id, lesson_id)`
- `lesson_progress_lesson_id_fkey` — `FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)`
- `lesson_progress_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`
- `lesson_progress_position_seconds_check` — `CHECK ((position_seconds >= (0)::numeric))`

## `public.lessons`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `section_id` | `uuid` | Não | — |
| `slug` | `text` | Não | — |
| `title` | `text` | Não | — |
| `body` | `text` | Não | `''::text` |
| `type` | `text` | Não | `'text'::text` |
| `duration_seconds` | `integer` | Não | `0` |
| `video_id` | `text` | Sim | — |
| `storage_path` | `text` | Sim | — |
| `is_preview` | `boolean` | Não | `false` |
| `is_required` | `boolean` | Não | `true` |
| `order_index` | `integer` | Não | `0` |
| `status` | `text` | Não | `'draft'::text` |
| `previous_status` | `text` | Sim | — |

**Chaves e restrições**

- `lessons_pkey` — `PRIMARY KEY (id)`
- `lessons_section_id_slug_key` — `UNIQUE (section_id, slug)`
- `lessons_section_id_fkey` — `FOREIGN KEY (section_id) REFERENCES public.sections(id)`
- `lessons_body_check` — `CHECK ((length(body) <= 100000))`
- `lessons_duration_seconds_check` — `CHECK (((duration_seconds >= 0) AND (duration_seconds <= 86400)))`
- `lessons_order_index_check` — `CHECK ((order_index >= 0))`
- `lessons_slug_check` — `CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))`
- `lessons_status_check` — `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))`
- `lessons_title_check` — `CHECK (((length(title) >= 1) AND (length(title) <= 200)))`
- `lessons_type_check` — `CHECK ((type = ANY (ARRAY['text'::text, 'video'::text, 'audio'::text])))`

**Índices adicionais**

- `CREATE INDEX lessons_parent ON public.lessons USING btree (section_id, order_index, id)`

## `public.live_event_rsvps`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `event_id` | `uuid` | Não | — |
| `user_id` | `uuid` | Não | — |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `live_event_rsvps_pkey` — `PRIMARY KEY (event_id, user_id)`
- `live_event_rsvps_event_id_fkey` — `FOREIGN KEY (event_id) REFERENCES public.live_events(id)`
- `live_event_rsvps_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`

## `public.live_events`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | — |
| `title` | `text` | Não | — |
| `guest` | `text` | Não | — |
| `description` | `text` | Não | `''::text` |
| `starts_at` | `timestamp with time zone` | Não | — |
| `duration_minutes` | `integer` | Não | — |
| `meeting_url` | `text` | Não | — |
| `recording_url` | `text` | Sim | — |
| `access_mode` | `text` | Não | — |
| `plan_ids` | `uuid[]` | Não | `'{}'::uuid[]` |
| `status` | `text` | Não | `'draft'::text` |
| `revision` | `integer` | Não | `1` |

**Chaves e restrições**

- `live_events_pkey` — `PRIMARY KEY (id)`
- `live_events_access_mode_check` — `CHECK ((access_mode = ANY (ARRAY['members'::text, 'subscribers'::text, 'plans'::text])))`
- `live_events_check` — `CHECK (((access_mode = 'plans'::text) = (cardinality(plan_ids) > 0)))`
- `live_events_description_check` — `CHECK ((length(description) <= 4000))`
- `live_events_duration_minutes_check` — `CHECK (((duration_minutes >= 1) AND (duration_minutes <= 720)))`
- `live_events_guest_check` — `CHECK (((length(btrim(guest)) >= 1) AND (length(btrim(guest)) <= 160)))`
- `live_events_meeting_url_check` — `CHECK (((length(meeting_url) <= 2048) AND (meeting_url ~ '^https://(([a-z0-9-]+\.)*zoom\.us/(j|my)/[A-Za-z0-9._-]+|meet\.google\.com/[a-zA-Z0-9-]+)([?][^[:space:]\\]*)?$'::text)))`
- `live_events_recording_url_check` — `CHECK (((length(recording_url) <= 2048) AND (recording_url ~ '^https://([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,63}([/?#][^[:space:]\\]*)?$'::text)))`
- `live_events_starts_at_check` — `CHECK (((starts_at >= '2000-01-01 00:00:00-02'::timestamp with time zone) AND (starts_at < '2100-01-01 00:00:00-03'::timestamp with time zone)))`
- `live_events_status_check` — `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))`
- `live_events_title_check` — `CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 160)))`

**Índices adicionais**

- `CREATE INDEX live_events_schedule ON public.live_events USING btree (starts_at, id) WHERE (status = 'published'::text)`

## `public.material_folders`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `parent_id` | `uuid` | Sim | — |
| `name` | `text` | Não | — |
| `status` | `text` | Não | `'draft'::text` |
| `previous_status` | `text` | Sim | — |
| `access_mode` | `text` | Não | `'subscribers'::text` |
| `plan_ids` | `uuid[]` | Não | `'{}'::uuid[]` |

**Chaves e restrições**

- `material_folders_pkey` — `PRIMARY KEY (id)`
- `material_folders_parent_id_fkey` — `FOREIGN KEY (parent_id) REFERENCES public.material_folders(id)`
- `material_folders_access_mode_check` — `CHECK ((access_mode = ANY (ARRAY['members'::text, 'subscribers'::text, 'plans'::text])))`
- `material_folders_check` — `CHECK ((parent_id IS DISTINCT FROM id))`
- `material_folders_name_check` — `CHECK (((length(name) >= 1) AND (length(name) <= 200)))`
- `material_folders_status_check` — `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))`

## `public.materials`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `folder_id` | `uuid` | Sim | — |
| `lesson_id` | `uuid` | Sim | — |
| `name` | `text` | Não | — |
| `description` | `text` | Não | `''::text` |
| `file_type` | `text` | Não | `'application/pdf'::text` |
| `size_bytes` | `bigint` | Não | `0` |
| `storage_path` | `text` | Sim | — |
| `status` | `text` | Não | `'draft'::text` |
| `previous_status` | `text` | Sim | — |
| `access_mode` | `text` | Não | `'subscribers'::text` |
| `plan_ids` | `uuid[]` | Não | `'{}'::uuid[]` |

**Chaves e restrições**

- `materials_pkey` — `PRIMARY KEY (id)`
- `materials_folder_id_fkey` — `FOREIGN KEY (folder_id) REFERENCES public.material_folders(id)`
- `materials_lesson_id_fkey` — `FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)`
- `materials_access_mode_check` — `CHECK ((access_mode = ANY (ARRAY['members'::text, 'subscribers'::text, 'plans'::text])))`
- `materials_description_check` — `CHECK ((length(description) <= 4000))`
- `materials_name_check` — `CHECK (((length(name) >= 1) AND (length(name) <= 200)))`
- `materials_size_bytes_check` — `CHECK (((size_bytes >= 0) AND (size_bytes <= 524288000)))`
- `materials_status_check` — `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))`

**Índices adicionais**

- `CREATE INDEX materials_parent ON public.materials USING btree (folder_id, lesson_id)`

## `public.moderation_events`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `actor_id` | `uuid` | Não | — |
| `target_type` | `text` | Não | — |
| `target_id` | `uuid` | Não | — |
| `decision` | `text` | Não | — |
| `reason` | `text` | Não | — |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `moderation_events_pkey` — `PRIMARY KEY (id)`
- `moderation_events_actor_id_fkey` — `FOREIGN KEY (actor_id) REFERENCES public.profiles(id)`

## `public.modules`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `course_id` | `uuid` | Não | — |
| `slug` | `text` | Não | — |
| `title` | `text` | Não | — |
| `order_index` | `integer` | Não | `0` |
| `status` | `text` | Não | `'draft'::text` |
| `previous_status` | `text` | Sim | — |
| `access_mode` | `text` | Não | `'inherit'::text` |
| `plan_ids` | `uuid[]` | Não | `'{}'::uuid[]` |

**Chaves e restrições**

- `modules_pkey` — `PRIMARY KEY (id)`
- `modules_course_id_slug_key` — `UNIQUE (course_id, slug)`
- `modules_course_id_fkey` — `FOREIGN KEY (course_id) REFERENCES public.courses(id)`
- `modules_access_mode_check` — `CHECK ((access_mode = ANY (ARRAY['inherit'::text, 'members'::text, 'subscribers'::text, 'plans'::text])))`
- `modules_order_index_check` — `CHECK ((order_index >= 0))`
- `modules_slug_check` — `CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))`
- `modules_status_check` — `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))`
- `modules_title_check` — `CHECK (((length(title) >= 1) AND (length(title) <= 200)))`

**Índices adicionais**

- `CREATE INDEX modules_parent ON public.modules USING btree (course_id, order_index, id)`

## `public.notification_preferences`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `user_id` | `uuid` | Não | — |
| `event_key` | `text` | Não | — |
| `in_app` | `boolean` | Não | — |

**Chaves e restrições**

- `notification_preferences_pkey` — `PRIMARY KEY (user_id, event_key)`
- `notification_preferences_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`

## `public.notifications`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `user_id` | `uuid` | Não | — |
| `event_key` | `text` | Não | — |
| `source_id` | `uuid` | Não | — |
| `created_at` | `timestamp with time zone` | Não | `clock_timestamp()` |
| `read_at` | `timestamp with time zone` | Sim | — |

**Chaves e restrições**

- `notifications_pkey` — `PRIMARY KEY (id)`
- `notifications_user_id_event_key_source_id_key` — `UNIQUE (user_id, event_key, source_id)`
- `notifications_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`

**Índices adicionais**

- `CREATE INDEX notifications_owner_history ON public.notifications USING btree (user_id, created_at DESC, id DESC)`
- `CREATE INDEX notifications_owner_unread ON public.notifications USING btree (user_id, id) WHERE (read_at IS NULL)`

## `public.onboarding`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `name_label` | `text` | Não | `'Nome completo'::text` |
| `company_label` | `text` | Não | `'Empresa'::text` |
| `company_required` | `boolean` | Não | `true` |
| `singleton` | `boolean` | Não | `true` |

**Chaves e restrições**

- `onboarding_pkey` — `PRIMARY KEY (id)`
- `onboarding_singleton_key` — `UNIQUE (singleton)`
- `onboarding_singleton_check` — `CHECK (singleton)`

## `public.onboarding_questions`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `key` | `text` | Não | — |
| `label` | `text` | Não | — |
| `type` | `text` | Não | `'text'::text` |
| `options` | `jsonb` | Não | `'[]'::jsonb` |
| `required` | `boolean` | Não | `false` |
| `active` | `boolean` | Não | `true` |
| `order_index` | `integer` | Não | `0` |

**Chaves e restrições**

- `onboarding_questions_pkey` — `PRIMARY KEY (id)`
- `onboarding_questions_key_key` — `UNIQUE (key)`
- `onboarding_questions_key_check` — `CHECK ((key = ANY (ARRAY['name'::text, 'segment'::text, 'role'::text, 'size'::text, 'stage'::text, 'revenue_range'::text, 'acquisition'::text, 'product_description'::text])))`
- `onboarding_questions_label_check` — `CHECK (((length(label) >= 1) AND (length(label) <= 200)))`
- `onboarding_questions_options_check` — `CHECK ((jsonb_typeof(options) = 'array'::text))`
- `onboarding_questions_order_index_check` — `CHECK ((order_index >= 0))`
- `onboarding_questions_type_check` — `CHECK ((type = ANY (ARRAY['text'::text, 'select'::text, 'textarea'::text])))`

## `public.orders`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `user_id` | `uuid` | Sim | — |
| `plan_id` | `uuid` | Não | — |
| `attempt_key` | `text` | Não | — |
| `amount_cents` | `integer` | Não | — |
| `access_months` | `integer` | Não | — |
| `method` | `text` | Não | — |
| `installments` | `integer` | Não | — |
| `buyer_data` | `jsonb` | Não | — |
| `receipt_hash` | `text` | Não | — |
| `status` | `text` | Não | `'pending'::text` |
| `gateway_id` | `text` | Sim | — |
| `checkout_url` | `text` | Sim | — |
| `paid_at` | `timestamp with time zone` | Sim | — |
| `finalized_at` | `timestamp with time zone` | Sim | — |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `orders_pkey` — `PRIMARY KEY (id)`
- `orders_attempt_key_key` — `UNIQUE (attempt_key)`
- `orders_gateway_id_key` — `UNIQUE (gateway_id)`
- `orders_plan_id_fkey` — `FOREIGN KEY (plan_id) REFERENCES public.plans(id)`
- `orders_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`
- `orders_access_months_check` — `CHECK (((access_months >= 1) AND (access_months <= 120)))`
- `orders_amount_cents_check` — `CHECK ((amount_cents > 0))`
- `orders_attempt_key_check` — `CHECK (((length(attempt_key) >= 16) AND (length(attempt_key) <= 160)))`
- `orders_installments_check` — `CHECK (((installments >= 1) AND (installments <= 12)))`
- `orders_method_check` — `CHECK ((method = ANY (ARRAY['PIX'::text, 'CREDIT_CARD'::text])))`
- `orders_receipt_hash_check` — `CHECK ((receipt_hash ~ '^[a-f0-9]{64}$'::text))`
- `orders_status_check` — `CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'refunded'::text, 'chargeback'::text, 'expired'::text, 'cancelled'::text])))`

## `public.payment_events`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `text` | Não | — |
| `order_id` | `uuid` | Não | — |
| `event_type` | `text` | Não | — |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `payment_events_pkey` — `PRIMARY KEY (id)`
- `payment_events_order_id_fkey` — `FOREIGN KEY (order_id) REFERENCES public.orders(id)`

## `public.plans`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `name` | `text` | Não | — |
| `slug` | `text` | Não | — |
| `price_cents` | `integer` | Não | — |
| `access_months` | `integer` | Não | — |
| `benefits` | `jsonb` | Não | `'[]'::jsonb` |
| `active` | `boolean` | Não | `false` |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `plans_pkey` — `PRIMARY KEY (id)`
- `plans_slug_key` — `UNIQUE (slug)`
- `plans_access_months_check` — `CHECK (((access_months >= 1) AND (access_months <= 120)))`
- `plans_benefits_check` — `CHECK ((jsonb_typeof(benefits) = 'array'::text))`
- `plans_name_check` — `CHECK (((length(name) >= 1) AND (length(name) <= 120)))`
- `plans_price_cents_check` — `CHECK ((price_cents >= 0))`
- `plans_slug_check` — `CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text))`

## `public.podcast_episodes`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `youtube_id` | `text` | Não | — |
| `kind` | `text` | Não | — |
| `title` | `text` | Não | — |
| `description` | `text` | Não | — |
| `published_at` | `timestamp with time zone` | Não | — |
| `status` | `text` | Não | `'draft'::text` |
| `is_featured` | `boolean` | Não | `false` |
| `chapters` | `jsonb` | Não | `'[]'::jsonb` |
| `spotify_url` | `text` | Sim | — |

**Chaves e restrições**

- `podcast_episodes_pkey` — `PRIMARY KEY (id)`
- `podcast_episodes_youtube_id_key` — `UNIQUE (youtube_id)`
- `podcast_episodes_check` — `CHECK (((NOT is_featured) OR (status = 'published'::text)))`
- `podcast_episodes_description_check` — `CHECK ((length(description) <= 5000))`
- `podcast_episodes_kind_check` — `CHECK ((kind = ANY (ARRAY['podcast'::text, 'masterclass'::text])))`
- `podcast_episodes_published_at_check` — `CHECK (isfinite(published_at))`
- `podcast_episodes_spotify_url_check` — `CHECK ((spotify_url ~ '^https://open[.]spotify[.]com/episode/[A-Za-z0-9]{22}$'::text))`
- `podcast_episodes_status_check` — `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))`
- `podcast_episodes_title_check` — `CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 160)))`
- `podcast_episodes_youtube_id_check` — `CHECK ((youtube_id ~ '^[A-Za-z0-9_-]{11}$'::text))`

**Índices adicionais**

- `CREATE INDEX podcast_episode_order ON public.podcast_episodes USING btree (published_at DESC, id)`
- `CREATE UNIQUE INDEX podcast_one_featured ON public.podcast_episodes USING btree (is_featured) WHERE is_featured`

## `public.podcast_watches`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `user_id` | `uuid` | Não | — |
| `episode_id` | `uuid` | Não | — |

**Chaves e restrições**

- `podcast_watches_pkey` — `PRIMARY KEY (user_id, episode_id)`
- `podcast_watches_episode_id_fkey` — `FOREIGN KEY (episode_id) REFERENCES public.podcast_episodes(id) ON DELETE CASCADE`
- `podcast_watches_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE`

## `public.posts`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `space_id` | `uuid` | Não | — |
| `author_id` | `uuid` | Não | — |
| `title` | `text` | Não | — |
| `body` | `text` | Não | — |
| `image_path` | `text` | Sim | — |
| `status` | `text` | Não | `'pending'::text` |
| `previous_status` | `text` | Sim | — |
| `created_at` | `timestamp with time zone` | Não | `now()` |
| `updated_at` | `timestamp with time zone` | Não | `now()` |
| `archived_by` | `uuid` | Sim | — |
| `archive_source` | `text` | Sim | — |

**Chaves e restrições**

- `posts_pkey` — `PRIMARY KEY (id)`
- `posts_archived_by_fkey` — `FOREIGN KEY (archived_by) REFERENCES public.profiles(id)`
- `posts_author_id_fkey` — `FOREIGN KEY (author_id) REFERENCES public.profiles(id)`
- `posts_space_id_fkey` — `FOREIGN KEY (space_id) REFERENCES public.spaces(id)`
- `posts_archive_source_check` — `CHECK ((archive_source = ANY (ARRAY['author'::text, 'admin'::text])))`
- `posts_body_check` — `CHECK (((length(body) >= 1) AND (length(body) <= 20000)))`
- `posts_status_check` — `CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'hidden'::text, 'removed'::text, 'archived'::text])))`
- `posts_title_check` — `CHECK (((length(title) >= 1) AND (length(title) <= 200)))`

**Índices adicionais**

- `CREATE INDEX posts_feed ON public.posts USING btree (space_id, created_at DESC, id)`

## `public.privacy_requests`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `user_id` | `uuid` | Não | — |
| `kind` | `text` | Não | — |
| `status` | `text` | Não | `'pending'::text` |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `privacy_requests_pkey` — `PRIMARY KEY (id)`
- `privacy_requests_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`
- `privacy_requests_kind_check` — `CHECK ((kind = ANY (ARRAY['export'::text, 'deletion'::text])))`
- `privacy_requests_status_check` — `CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'rejected'::text])))`

**Índices adicionais**

- `CREATE UNIQUE INDEX privacy_one_pending ON public.privacy_requests USING btree (user_id, kind) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]))`

## `public.profiles`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | — |
| `full_name` | `text` | Não | `''::text` |
| `phone` | `text` | Não | `''::text` |
| `bio` | `text` | Não | `''::text` |
| `company` | `jsonb` | Não | `'{}'::jsonb` |
| `role` | `text` | Não | `'member'::text` |
| `theme` | `text` | Não | `'light'::text` |
| `suspended` | `boolean` | Não | `false` |
| `onboarding_complete` | `boolean` | Não | `false` |
| `demo` | `boolean` | Não | `false` |
| `created_at` | `timestamp with time zone` | Não | `now()` |
| `avatar_id` | `uuid` | Sim | — |
| `password_setup_required` | `boolean` | Não | `false` |

**Chaves e restrições**

- `profiles_pkey` — `PRIMARY KEY (id)`
- `profiles_avatar_id_fkey` — `FOREIGN KEY (avatar_id) REFERENCES public.uploads(id)`
- `profiles_id_fkey` — `FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT`
- `profiles_bio_check` — `CHECK ((length(bio) <= 2000))`
- `profiles_company_check` — `CHECK ((jsonb_typeof(company) = 'object'::text))`
- `profiles_full_name_check` — `CHECK ((length(full_name) <= 160))`
- `profiles_phone_check` — `CHECK ((length(phone) <= 40))`
- `profiles_role_check` — `CHECK ((role = ANY (ARRAY['member'::text, 'instructor'::text, 'moderator'::text, 'support'::text, 'admin'::text])))`
- `profiles_theme_check` — `CHECK ((theme = ANY (ARRAY['light'::text, 'dark'::text])))`

## `public.rate_limits`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `actor_id` | `uuid` | Não | — |
| `bucket` | `text` | Não | — |
| `window_start` | `timestamp with time zone` | Não | — |
| `count` | `integer` | Não | — |

**Chaves e restrições**

- `rate_limits_pkey` — `PRIMARY KEY (actor_id, bucket, window_start)`

## `public.reauth_nonces`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `token_hash` | `text` | Não | — |
| `actor_id` | `uuid` | Não | — |
| `session_id` | `uuid` | Não | — |
| `expires_at` | `timestamp with time zone` | Não | — |
| `consumed_at` | `timestamp with time zone` | Sim | — |

**Chaves e restrições**

- `reauth_nonces_pkey` — `PRIMARY KEY (token_hash)`
- `reauth_nonces_actor_id_fkey` — `FOREIGN KEY (actor_id) REFERENCES public.profiles(id)`
- `reauth_nonces_session_id_fkey` — `FOREIGN KEY (session_id) REFERENCES public.app_sessions(id) ON DELETE CASCADE`
- `reauth_nonces_token_hash_check` — `CHECK ((token_hash ~ '^[a-f0-9]{64}$'::text))`

## `public.replies`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `post_id` | `uuid` | Não | — |
| `author_id` | `uuid` | Não | — |
| `body` | `text` | Não | — |
| `status` | `text` | Não | `'pending'::text` |
| `previous_status` | `text` | Sim | — |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `replies_pkey` — `PRIMARY KEY (id)`
- `replies_author_id_fkey` — `FOREIGN KEY (author_id) REFERENCES public.profiles(id)`
- `replies_post_id_fkey` — `FOREIGN KEY (post_id) REFERENCES public.posts(id)`
- `replies_body_check` — `CHECK (((length(body) >= 1) AND (length(body) <= 10000)))`
- `replies_status_check` — `CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'hidden'::text, 'removed'::text, 'archived'::text])))`

**Índices adicionais**

- `CREATE INDEX replies_parent ON public.replies USING btree (post_id, created_at, id)`

## `public.reports`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `actor_id` | `uuid` | Não | — |
| `post_id` | `uuid` | Sim | — |
| `reply_id` | `uuid` | Sim | — |
| `reason` | `text` | Não | — |
| `status` | `text` | Não | `'pending'::text` |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `reports_pkey` — `PRIMARY KEY (id)`
- `reports_actor_id_fkey` — `FOREIGN KEY (actor_id) REFERENCES public.profiles(id)`
- `reports_post_id_fkey` — `FOREIGN KEY (post_id) REFERENCES public.posts(id)`
- `reports_reply_id_fkey` — `FOREIGN KEY (reply_id) REFERENCES public.replies(id)`
- `reports_check` — `CHECK ((num_nonnulls(post_id, reply_id) = 1))`
- `reports_reason_check` — `CHECK (((length(reason) >= 3) AND (length(reason) <= 2000)))`
- `reports_status_check` — `CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])))`

## `public.sections`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `module_id` | `uuid` | Não | — |
| `title` | `text` | Não | — |
| `order_index` | `integer` | Não | `0` |
| `is_bonus` | `boolean` | Não | `false` |
| `status` | `text` | Não | `'draft'::text` |
| `previous_status` | `text` | Sim | — |

**Chaves e restrições**

- `sections_pkey` — `PRIMARY KEY (id)`
- `sections_module_id_fkey` — `FOREIGN KEY (module_id) REFERENCES public.modules(id)`
- `sections_order_index_check` — `CHECK ((order_index >= 0))`
- `sections_status_check` — `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))`
- `sections_title_check` — `CHECK (((length(title) >= 1) AND (length(title) <= 200)))`

**Índices adicionais**

- `CREATE INDEX sections_parent ON public.sections USING btree (module_id, order_index, id)`

## `public.spaces`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `name` | `text` | Não | — |
| `description` | `text` | Não | `''::text` |
| `order_index` | `integer` | Não | `0` |
| `status` | `text` | Não | `'draft'::text` |
| `previous_status` | `text` | Sim | — |
| `access_mode` | `text` | Não | `'subscribers'::text` |
| `plan_ids` | `uuid[]` | Não | `'{}'::uuid[]` |

**Chaves e restrições**

- `spaces_pkey` — `PRIMARY KEY (id)`
- `spaces_access_mode_check` — `CHECK ((access_mode = ANY (ARRAY['members'::text, 'subscribers'::text, 'plans'::text])))`
- `spaces_description_check` — `CHECK ((length(description) <= 4000))`
- `spaces_name_check` — `CHECK (((length(name) >= 1) AND (length(name) <= 160)))`
- `spaces_order_index_check` — `CHECK ((order_index >= 0))`
- `spaces_status_check` — `CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))`

## `public.subscriptions`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `user_id` | `uuid` | Não | — |
| `plan_id` | `uuid` | Não | — |
| `starts_at` | `timestamp with time zone` | Não | `now()` |
| `ends_at` | `timestamp with time zone` | Não | — |
| `revoked_at` | `timestamp with time zone` | Sim | — |
| `source` | `text` | Não | — |
| `order_id` | `uuid` | Sim | — |

**Chaves e restrições**

- `subscriptions_pkey` — `PRIMARY KEY (id)`
- `subscriptions_order_id_key` — `UNIQUE (order_id)`
- `subscriptions_order_id_fkey` — `FOREIGN KEY (order_id) REFERENCES public.orders(id)`
- `subscriptions_plan_id_fkey` — `FOREIGN KEY (plan_id) REFERENCES public.plans(id)`
- `subscriptions_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`
- `subscriptions_check` — `CHECK ((ends_at > starts_at))`
- `subscriptions_source_check` — `CHECK ((source = ANY (ARRAY['order'::text, 'courtesy'::text])))`

**Índices adicionais**

- `CREATE INDEX subscriptions_access ON public.subscriptions USING btree (user_id, ends_at) WHERE (revoked_at IS NULL)`

## `public.ticket_messages`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `ticket_id` | `uuid` | Não | — |
| `author_id` | `uuid` | Não | — |
| `body` | `text` | Não | — |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `ticket_messages_pkey` — `PRIMARY KEY (id)`
- `ticket_messages_author_id_fkey` — `FOREIGN KEY (author_id) REFERENCES public.profiles(id)`
- `ticket_messages_ticket_id_fkey` — `FOREIGN KEY (ticket_id) REFERENCES public.tickets(id)`
- `ticket_messages_body_check` — `CHECK (((length(body) >= 1) AND (length(body) <= 20000)))`

**Índices adicionais**

- `CREATE INDEX ticket_messages_parent ON public.ticket_messages USING btree (ticket_id, created_at, id)`

## `public.tickets`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `user_id` | `uuid` | Não | — |
| `subject` | `text` | Não | — |
| `priority` | `text` | Não | — |
| `status` | `text` | Não | `'open'::text` |
| `created_at` | `timestamp with time zone` | Não | `now()` |
| `updated_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `tickets_pkey` — `PRIMARY KEY (id)`
- `tickets_user_id_fkey` — `FOREIGN KEY (user_id) REFERENCES public.profiles(id)`
- `tickets_priority_check` — `CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))`
- `tickets_status_check` — `CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'waiting_member'::text, 'resolved'::text])))`
- `tickets_subject_check` — `CHECK (((length(subject) >= 3) AND (length(subject) <= 200)))`

**Índices adicionais**

- `CREATE INDEX tickets_owner ON public.tickets USING btree (user_id, created_at DESC)`

## `public.uploads`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `id` | `uuid` | Não | `gen_random_uuid()` |
| `actor_id` | `uuid` | Não | — |
| `kind` | `text` | Não | — |
| `resource_id` | `uuid` | Não | — |
| `ticket_id` | `uuid` | Sim | — |
| `post_id` | `uuid` | Sim | — |
| `lesson_id` | `uuid` | Sim | — |
| `material_id` | `uuid` | Sim | — |
| `course_id` | `uuid` | Sim | — |
| `path` | `text` | Não | — |
| `file_name` | `text` | Não | — |
| `content_type` | `text` | Não | — |
| `size_bytes` | `bigint` | Não | — |
| `created_at` | `timestamp with time zone` | Não | `now()` |
| `state` | `text` | Não | `'pending'::text` |
| `expires_at` | `timestamp with time zone` | Não | `(now() + '00:15:00'::interval)` |
| `profile_id` | `uuid` | Sim | — |
| `message_id` | `uuid` | Sim | — |

**Chaves e restrições**

- `uploads_pkey` — `PRIMARY KEY (id)`
- `uploads_path_key` — `UNIQUE (path)`
- `uploads_actor_id_fkey` — `FOREIGN KEY (actor_id) REFERENCES public.profiles(id)`
- `uploads_course_id_fkey` — `FOREIGN KEY (course_id) REFERENCES public.courses(id)`
- `uploads_lesson_id_fkey` — `FOREIGN KEY (lesson_id) REFERENCES public.lessons(id)`
- `uploads_material_id_fkey` — `FOREIGN KEY (material_id) REFERENCES public.materials(id)`
- `uploads_message_id_fkey` — `FOREIGN KEY (message_id) REFERENCES public.ticket_messages(id)`
- `uploads_post_id_fkey` — `FOREIGN KEY (post_id) REFERENCES public.posts(id)`
- `uploads_profile_id_fkey` — `FOREIGN KEY (profile_id) REFERENCES public.profiles(id)`
- `uploads_ticket_id_fkey` — `FOREIGN KEY (ticket_id) REFERENCES public.tickets(id)`
- `uploads_resource_check` — `CHECK ((num_nonnulls(ticket_id, post_id, lesson_id, material_id, course_id, profile_id) = CASE     WHEN (kind = 'feedback-screenshot'::text) THEN 0     ELSE 1 END))`
- `uploads_size_bytes_check` — `CHECK (((size_bytes >= 1) AND (size_bytes <= 524288000)))`
- `uploads_state_check` — `CHECK ((state = ANY (ARRAY['pending'::text, 'ready'::text])))`

**Índices adicionais**

- `CREATE UNIQUE INDEX feedback_screenshot_attempt ON public.uploads USING btree (actor_id, resource_id) WHERE (kind = 'feedback-screenshot'::text)`

## `public.votes`

RLS ativada.

| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |
| --- | --- | --- | --- |
| `actor_id` | `uuid` | Não | — |
| `post_id` | `uuid` | Sim | — |
| `reply_id` | `uuid` | Sim | — |
| `created_at` | `timestamp with time zone` | Não | `now()` |

**Chaves e restrições**

- `votes_actor_id_post_id_key` — `UNIQUE (actor_id, post_id)`
- `votes_actor_id_reply_id_key` — `UNIQUE (actor_id, reply_id)`
- `votes_actor_id_fkey` — `FOREIGN KEY (actor_id) REFERENCES public.profiles(id)`
- `votes_post_id_fkey` — `FOREIGN KEY (post_id) REFERENCES public.posts(id)`
- `votes_reply_id_fkey` — `FOREIGN KEY (reply_id) REFERENCES public.replies(id)`
- `votes_check` — `CHECK ((num_nonnulls(post_id, reply_id) = 1))`
