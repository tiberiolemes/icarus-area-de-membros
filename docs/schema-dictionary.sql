-- Run with psql -XAtq against an isolated database with the project's migrations applied.
\set ON_ERROR_STOP on
begin read only;
set local search_path = pg_catalog;

with tables as (
  select c.oid, n.nspname as schema_name, c.relname as table_name, c.relrowsecurity,
    n.nspname || '.' || c.relname as qualified_name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where (n.nspname = 'ica_private' or (n.nspname = 'public' and c.relname like 'ica\_%')) and c.relkind in ('r', 'p')
), sections as (
  select 0 as section, '' as name, 0 as line,
    format(E'# Dicionário de dados do Icarus\n\n**%s tabelas e %s colunas** nas tabelas `ica_*` do esquema `public` e no esquema `ica_private`.\n\n'
      'Veja o [mapa técnico](architecture.md) para localizar os fluxos e visualizar os relacionamentos. '
      'Este inventário descreve a estrutura das tabelas da aplicação. Os esquemas gerenciados pelo Supabase, '
      '`auth` e `storage`, aparecem quando são destino de uma chave estrangeira.\n\n'
      'Gerado por [schema-dictionary.sql](schema-dictionary.sql) a partir do catálogo do PostgreSQL. '
      'Para atualizar, aplique as migrations em um banco de teste e execute `psql -XAtq -f docs/schema-dictionary.sql > docs/data-dictionary.md` '
      'com a conexão apontada para esse banco. “RLS” indica se a proteção está ativada na tabela. '
      'Para as regras efetivas, consulte as migrations e o contrato das RPCs.\n',
      (select count(*) from tables),
      (select count(*) from tables t join pg_attribute a on a.attrelid = t.oid where a.attnum > 0 and not a.attisdropped)
    ) as body

  union all
  select 1, t.qualified_name, 0,
    format(E'## `%s`\n\nRLS %s.\n\n| Coluna | Tipo PostgreSQL | Aceita nulo | Padrão |\n| --- | --- | --- | --- |',
      t.qualified_name, case when t.relrowsecurity then 'ativada' else 'desativada' end)
  from tables t

  union all
  select 1, t.qualified_name, a.attnum,
    format('| `%s` | `%s` | %s | %s |', a.attname, format_type(a.atttypid, a.atttypmod),
      case when a.attnotnull then 'Não' else 'Sim' end,
      coalesce('`' || replace(replace(pg_get_expr(d.adbin, d.adrelid), E'\n', ' '), '|', E'\\|') || '`', '—'))
  from tables t join pg_attribute a on a.attrelid = t.oid
  left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped

  union all
  select 1, t.qualified_name, 40000, E'\n**Chaves e restrições**\n'
  from tables t
  where exists (select from pg_constraint k where k.conrelid = t.oid and k.contype in ('p', 'u', 'f', 'c', 'x'))

  union all
  select 1, t.qualified_name,
    40000 + row_number() over (partition by t.oid order by
      case k.contype when 'p' then 0 when 'u' then 1 when 'f' then 2 else 3 end, k.conname),
    format('- `%s` — `%s`', k.conname, replace(pg_get_constraintdef(k.oid), E'\n', ' '))
  from tables t join pg_constraint k on k.conrelid = t.oid
  where k.contype in ('p', 'u', 'f', 'c', 'x')

  union all
  select 1, t.qualified_name, 50000, E'\n**Índices adicionais**\n'
  from tables t
  where exists (select from pg_index i where i.indrelid = t.oid
    and not exists (select from pg_constraint k where k.conrelid = t.oid and k.conindid = i.indexrelid and k.contype in ('p', 'u', 'x')))

  union all
  select 1, t.qualified_name,
    50000 + row_number() over (partition by t.oid order by c.relname),
    format('- `%s`', replace(pg_get_indexdef(i.indexrelid), E'\n', ' '))
  from tables t join pg_index i on i.indrelid = t.oid join pg_class c on c.oid = i.indexrelid
  where not exists (select from pg_constraint k where k.conrelid = t.oid and k.conindid = i.indexrelid and k.contype in ('p', 'u', 'x'))

  union all
  select 1, qualified_name, 60000, ''
  from tables
  where qualified_name collate "C" < (select max(qualified_name collate "C") from tables)
)
select body from sections order by section, name collate "C", line;

rollback;
