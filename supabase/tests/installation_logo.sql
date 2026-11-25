\set ON_ERROR_STOP on
begin;

create temporary table results (name text primary key);
grant all on results to anon, authenticated, service_role;
create function pg_temp.ok(condition boolean, name text) returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'Falhou: %', name; end if;
  insert into results values (name);
end $$;
create function pg_temp.denied(statement text, code text, name text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    perform pg_temp.ok(sqlstate = code, name || ' (' || sqlstate || ')');
    return;
  end;
  raise exception 'Operação permitida: %', name;
end $$;

create temporary table actors as
select role, gen_random_uuid() as actor_id, gen_random_uuid() as session_id
from unnest(array['admin', 'admin_aal1', 'member', 'support', 'moderator', 'instructor']) as role;
grant select on actors to anon, authenticated, service_role;
insert into auth.users(id, email, email_confirmed_at, aud, role, raw_app_meta_data)
select actor_id, actor_id || '@example.test', now(), 'authenticated', 'authenticated', '{"icarus_server_created":true}' from actors;
update public.profiles p set role = case when a.role like 'admin%' then 'admin' else a.role end from actors a where p.id = a.actor_id;
insert into auth.sessions(id, user_id, created_at, updated_at, aal)
select session_id, actor_id, now(), now(), (case when role = 'admin_aal1' then 'aal1' else 'aal2' end)::auth.aal_level from actors;
insert into public.app_sessions(id, user_id, expires_at) select session_id, actor_id, now() + interval '1 hour' from actors;
insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at)
select gen_random_uuid(), actor_id, 'Demonstração', 'totp', 'verified', now(), now() from actors where role like 'admin%';

-- A Edge chama com a service role e repassa a sessão do navegador nos cabeçalhos.
create function pg_temp.service(actor_role text) returns void language sql as $$
  select set_config('request.headers', jsonb_build_object('x-icarus-session-id', session_id, 'x-icarus-aal', case when role = 'admin_aal1' then 'aal1' else 'aal2' end)::text, true)
  from actors where role = actor_role
$$;
create function pg_temp.id(actor_role text) returns uuid language sql as $$ select actor_id from actors where role = actor_role $$;
create function pg_temp.path(variant text, ext text) returns text language sql as $$ select 'logo/' || variant || '-' || gen_random_uuid() || '.' || ext $$;

-- Permissões das RPCs e do bucket.
select pg_temp.ok(not has_function_privilege(r, 'public.app_brand_asset_begin(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege(r, 'public.app_brand_asset_commit(uuid,text,text,uuid)', 'EXECUTE'), 'RPCs fechadas para ' || r)
from unnest(array['anon', 'authenticated']) r;
select pg_temp.ok(has_function_privilege('service_role', 'public.app_brand_asset_begin(uuid,text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.app_brand_asset_commit(uuid,text,text,uuid)', 'EXECUTE'), 'Edge executa as RPCs');
select pg_temp.ok(not has_table_privilege(r, 'app_private.installation_brand', 'SELECT,UPDATE'), 'Marca fechada para ' || r)
from unnest(array['anon', 'authenticated', 'service_role']) r;
select pg_temp.ok((select public and file_size_limit = 512000 and allowed_mime_types = array['image/png', 'image/webp'] from storage.buckets where id = 'icarus-brand'), 'Bucket público só PNG e WebP até 500 KB');
select pg_temp.ok(not exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and coalesce(qual, '') || coalesce(with_check, '') not like '%icarus-private%'), 'Nenhuma policy de storage.objects alcança o bucket de marca');

-- Objetos de teste gravados como a Edge gravaria (service role ignora RLS).
create temporary table paths as select pg_temp.path('light', 'png') light, pg_temp.path('light', 'webp') light2, pg_temp.path('dark', 'png') dark, pg_temp.path('light', 'png') missing, 'icon/' || gen_random_uuid() || '.png' icon;
grant select on paths to service_role, authenticated, anon;
insert into storage.objects(bucket_id, name, metadata) select 'icarus-brand', unnest(array[light, light2, dark, icon]), '{"size":2048,"mimetype":"image/png"}' from paths;

set local role anon;
select pg_temp.ok(not exists(select 1 from storage.objects where bucket_id = 'icarus-brand'), 'Anônimo não lista o bucket de marca');
select pg_temp.denied($q$insert into storage.objects(bucket_id, name) values('icarus-brand', 'logo/light-00000000-0000-4000-8000-000000000000.png')$q$, '42501', 'Anônimo não grava no bucket de marca');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id('admin'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
select pg_temp.ok(not exists(select 1 from storage.objects where bucket_id = 'icarus-brand'), 'Admin autenticado não lista o bucket de marca');
select pg_temp.denied($q$insert into storage.objects(bucket_id, name) values('icarus-brand', 'logo/light-00000000-0000-4000-8000-000000000000.png')$q$, '42501', 'Admin no navegador não grava direto no bucket');
reset role;

set local role service_role;
do $$
declare actor_role text;
begin
  foreach actor_role in array array['member', 'support', 'moderator', 'instructor', 'admin_aal1'] loop
    perform pg_temp.service(actor_role);
    perform pg_temp.denied(format('select public.app_brand_asset_begin(%L, %L, %L)', pg_temp.id(actor_role), 'light', 'image/png'), 'P0001', actor_role || ' não inicia envio');
    perform pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L)', pg_temp.id(actor_role), 'light', (select light from paths)), 'P0001', actor_role || ' não grava logo');
    perform pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, null)', pg_temp.id(actor_role), 'light'), 'P0001', actor_role || ' não remove logo');
  end loop;
end $$;
select pg_temp.service('member');
select pg_temp.denied(format('select public.app_brand_asset_begin(%L, %L, %L)', pg_temp.id('admin'), 'light', 'image/png'), 'P0001', 'Sessão de outra pessoa não vale para o admin');

select pg_temp.service('admin');
select pg_temp.denied(format('select public.app_brand_asset_begin(%L, %L, %L)', pg_temp.id('admin'), 'sepia', 'image/png'), 'P0001', 'Variante desconhecida');
select pg_temp.denied(format('select public.app_brand_asset_begin(%L, %L, %L)', pg_temp.id('admin'), 'light', 'image/svg+xml'), 'P0001', 'SVG recusado');
select pg_temp.denied(format('select public.app_brand_asset_begin(%L, %L, %L)', pg_temp.id('admin'), 'light', 'image/jpeg'), 'P0001', 'JPEG recusado');
select pg_temp.ok(public.app_brand_asset_begin(pg_temp.id('admin'), 'light', 'image/png') ~ '^logo/light-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$', 'Caminho PNG gerado no servidor');
select pg_temp.ok(public.app_brand_asset_begin(pg_temp.id('admin'), 'dark', 'image/webp') ~ '^logo/dark-[0-9a-f-]{36}\.webp$', 'Caminho WebP gerado no servidor');
select pg_temp.ok(public.app_brand_asset_begin(pg_temp.id('admin'), 'icon', 'image/png') ~ '^icon/[0-9a-f-]{36}\.png$', 'Caminho do favicon gerado no servidor');
select pg_temp.denied(format('select public.app_brand_asset_begin(%L, %L, %L)', pg_temp.id('admin'), 'icon', 'image/webp'), 'P0001', 'Favicon só em PNG');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L)', pg_temp.id('admin'), 'icon', (select light from paths)), 'P0001', 'Favicon recusa caminho de logo');

select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L)', pg_temp.id('admin'), 'dark', (select light from paths)), 'P0001', 'Caminho de outra variante');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L)', pg_temp.id('admin'), 'light', 'logo/light-x.png'), 'P0001', 'Caminho fora do formato');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L)', pg_temp.id('admin'), 'light', '../icarus-private/' || (select light from paths)), 'P0001', 'Caminho com travessia');
select pg_temp.denied(format('select public.app_brand_asset_commit(%L, %L, %L)', pg_temp.id('admin'), 'light', (select missing from paths)), 'P0001', 'Objeto inexistente');

select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'light', (select light from paths)) = jsonb_build_object('logo_light', (select light from paths), 'logo_dark', null, 'icon', null, 'previous', null), 'Primeira logo colorida');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'light', (select light from paths)) = jsonb_build_object('logo_light', (select light from paths), 'logo_dark', null, 'icon', null, 'previous', null), 'Repetição idempotente não devolve objeto para apagar');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'light', (select light2 from paths)) = jsonb_build_object('logo_light', (select light2 from paths), 'logo_dark', null, 'icon', null, 'previous', (select light from paths)), 'Troca devolve a anterior');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'dark', (select dark from paths)) = jsonb_build_object('logo_light', (select light2 from paths), 'logo_dark', (select dark from paths), 'icon', null, 'previous', null), 'Logo branca');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'icon', (select icon from paths)) = jsonb_build_object('logo_light', (select light2 from paths), 'logo_dark', (select dark from paths), 'icon', (select icon from paths), 'previous', null), 'Favicon');
reset role;

set local role anon;
select pg_temp.ok(public.app_public_context() @> jsonb_build_object('logo_light', (select light2 from paths), 'logo_dark', (select dark from paths), 'icon', (select icon from paths)), 'Contexto anônimo expõe logos e favicon');
select pg_temp.ok(public.app_public_context()->>'name' = 'Icarus', 'Contexto anônimo mantém o nome');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id('member'), 'session_id', (select session_id from actors where role = 'member'), 'aal', 'aal2', 'role', 'authenticated')::text, true);
select pg_temp.ok(public.app_bootstrap()->'settings' @> jsonb_build_object('name', 'Icarus', 'logo_light', (select light2 from paths), 'logo_dark', (select dark from paths)), 'Bootstrap do membro expõe os dois caminhos');
select pg_temp.ok(public.app_bootstrap()->'settings'->>'icon' = (select icon from paths), 'Bootstrap expõe o favicon');
reset role;

set local role service_role;
select pg_temp.service('admin');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'light', null) = jsonb_build_object('logo_light', null, 'logo_dark', (select dark from paths), 'icon', (select icon from paths), 'previous', (select light2 from paths)), 'Remoção devolve a anterior');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'light', null) = jsonb_build_object('logo_light', null, 'logo_dark', (select dark from paths), 'icon', (select icon from paths), 'previous', null), 'Remover de novo é idempotente');
select pg_temp.ok(public.app_brand_asset_commit(pg_temp.id('admin'), 'icon', null)->>'previous' = (select icon from paths), 'Remover o favicon devolve o arquivo');
reset role;

select pg_temp.ok((select count(*) = 6
  and count(*) filter (where action = 'save' and target_type = 'installation_icon') = 1
  and count(*) filter (where action = 'remove' and target_type = 'installation_icon') = 1
  and count(*) filter (where action = 'save' and target_type = 'installation_logo_light') = 2
  and count(*) filter (where action = 'save' and target_type = 'installation_logo_dark') = 1
  and count(*) filter (where action = 'remove' and target_type = 'installation_logo_light') = 1
  and bool_and(actor_id = pg_temp.id('admin') and target_id is null)
  from public.audit_events where target_type like 'installation_logo_%' or target_type = 'installation_icon'), 'Uma auditoria por mudança efetiva');
select pg_temp.denied($q$update app_private.installation_brand set logo_dark = 'logo/light-00000000-0000-4000-8000-000000000000.png'$q$, '23514', 'Coluna recusa caminho de outra variante');
select pg_temp.denied($q$update app_private.installation_brand set icon = 'icon/00000000-0000-4000-8000-000000000000.webp'$q$, '23514', 'Coluna do favicon só aceita PNG');

set local role service_role;
select pg_temp.service('admin');
do $$
declare attempt integer := 0;
begin
  loop
    attempt := attempt + 1;
    begin
      perform public.app_brand_asset_begin(pg_temp.id('admin'), 'light', 'image/png');
    exception when sqlstate 'P0001' then
      perform pg_temp.ok(attempt > 1 and attempt <= 11, 'Limite de 10 envios por minuto');
      return;
    end;
    if attempt > 11 then raise exception 'Falhou: limite de envios não aplicado'; end if;
  end loop;
end $$;
reset role;

select count(*) from results;
rollback;
