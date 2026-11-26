\set ON_ERROR_STOP on
begin;
-- O PostgREST chama funções stable ou immutable numa transação só de leitura.
-- Quem confere a sessão bloqueia a linha dela (select ... for update), então precisa ser volatile.
do $$
declare fora text;
begin
  select string_agg(p.proname, ', ') into fora
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'app\_%' and p.provolatile <> 'v'
    and p.prosrc ~ '(require_role|app_private\.actor)\s*\(';
  if fora is not null then raise exception 'FAIL: RPC que confere sessão precisa ser volatile: %', fora; end if;
end $$;
select 1 as session_rpcs_volatile_assertions;
rollback;
