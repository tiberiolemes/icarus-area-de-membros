begin;

create table public.feedbacks (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles(id),
 attempt_key uuid not null,
 kind text not null check (kind in ('suggestion','bug','other')),
 body text not null check (length(body) between 1 and 4000),
 page_path text check (page_path in ('/app','/app/cursos','/app/cursos/:curso','/app/cursos/:curso/:modulo',
  '/app/cursos/:curso/:modulo/:aula','/app/materiais','/app/materiais/:pasta','/app/podcasts','/app/certificados',
  '/app/encontros-ao-vivo','/app/notificacoes','/app/configuracoes','/app/comunidade','/app/comunidade/novo',
  '/app/comunidade/:post','/app/comunidade/:post/editar','/app/suporte','/app/suporte/novo','/app/suporte/:ticket')),
 browser_family text check (browser_family in ('Chrome','Safari','Firefox','Edge','Opera','Outro')),
 screenshot_id uuid unique references public.uploads(id),
 status text not null default 'new' check (status in ('new','reviewing','planned','done')),
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (author_id,attempt_key)
);
alter table public.feedbacks enable row level security;
revoke all on public.feedbacks from public,anon,authenticated,service_role;
create index feedback_queue on public.feedbacks (created_at desc,id desc);

alter table public.uploads drop constraint uploads_resource_check;
alter table public.uploads add constraint uploads_resource_check check (
 num_nonnulls(ticket_id,post_id,lesson_id,material_id,course_id,profile_id)
 = case when kind='feedback-screenshot' then 0 else 1 end
);
create unique index feedback_screenshot_attempt on public.uploads(actor_id,resource_id) where kind='feedback-screenshot';

create or replace function app_private.upload_gate(p_actor uuid,p_upload uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.uploads x where x.id=p_upload and x.actor_id=p_actor and
 case x.kind
 when 'ticket-attachment' then app_private.ticket_access(p_actor,x.ticket_id)
 when 'post-image' then exists(select 1 from public.posts p where p.id=x.post_id and p.author_id=p_actor and p.status not in ('removed','archived') and app_private.space_access(p_actor,p.space_id))
 when 'avatar' then x.profile_id=p_actor
 when 'lesson' then app_private.is_staff(p_actor,array['admin','instructor'])
 when 'material' then app_private.is_staff(p_actor,array['admin','instructor'])
 when 'course-cover' then app_private.is_staff(p_actor,array['admin','instructor'])
 when 'feedback-screenshot' then true
 else false end)
$$;

create or replace function app_private.storage_insert_allowed(p_path text) returns boolean
language plpgsql security definer set search_path='' as $$
declare u uuid := app_private.actor();
begin
 -- Screenshots must pass the multipart Edge signature check before Storage receives bytes.
 return exists(select 1 from public.uploads x where x.path=p_path and x.actor_id=u and x.state='pending'
  and x.kind<>'feedback-screenshot' and x.expires_at>now() and app_private.upload_gate(u,x.id));
end $$;

create function public.app_feedback_screenshot_reserve(p_actor_id uuid,p_attempt_key uuid,p_content_type text,p_size_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.uploads; file_id uuid := gen_random_uuid(); ext text;
begin
 perform app_private.service_actor(p_actor_id);
 ext := case p_content_type when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' end;
 if p_attempt_key is null or ext is null or p_size_bytes is null or p_size_bytes not between 1 and 5242880 then
  perform app_private.fail('Envie uma imagem PNG, JPG ou WebP de até 5 MiB.');
 end if;
 perform app_private.throttle(p_actor_id,'upload',12);
 insert into public.uploads(id,actor_id,kind,resource_id,path,file_name,content_type,size_bytes)
 values(file_id,p_actor_id,'feedback-screenshot',p_attempt_key,
  'feedback-screenshot/'||file_id||'.'||ext,'print.'||ext,p_content_type,p_size_bytes)
 on conflict (actor_id,resource_id) where kind='feedback-screenshot' do nothing;
 select * into x from public.uploads where actor_id=p_actor_id and resource_id=p_attempt_key and kind='feedback-screenshot' for update;
 if x.content_type is distinct from p_content_type or x.size_bytes is distinct from p_size_bytes then
  perform app_private.fail('A imagem não corresponde ao envio reservado.');
 end if;
 if x.state='pending' and x.expires_at<=now() then
  update public.uploads set expires_at=now()+interval '15 minutes' where id=x.id;
 end if;
 return jsonb_build_object('id',x.id,'bucket','icarus-private','path',x.path,'status',x.state);
end $$;

create function public.app_submit_feedback(p_attempt_key uuid,p_kind text,p_body text,p_screenshot_id uuid default null,
 p_page_path text default null,p_browser_family text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := app_private.actor(); f public.feedbacks; body_text text := regexp_replace(p_body,'^[[:space:]]+|[[:space:]]+$','','g');
begin
 if p_attempt_key is null or p_kind is null or body_text is null then
  perform app_private.fail('Confira o tipo, a descrição e o contexto do feedback.');
 end if;
 perform pg_advisory_xact_lock(hashtextextended('icarus.feedback/'||u||'/'||p_attempt_key,0));
 select * into f from public.feedbacks where author_id=u and attempt_key=p_attempt_key;
 if found then
  if (f.kind,f.body,f.screenshot_id,f.page_path,f.browser_family) is distinct from
   (p_kind,body_text,p_screenshot_id,p_page_path,p_browser_family) then
   perform app_private.fail('Esta tentativa corresponde ao envio anterior. Envie o rascunho alterado como novo feedback.');
  end if;
  return jsonb_build_object('id',f.id);
 end if;
 perform app_private.throttle(u,'feedback',6);
 if p_screenshot_id is not null then
  perform 1 from public.uploads where id=p_screenshot_id and actor_id=u and kind='feedback-screenshot' and state='ready' for update;
  if not found then perform app_private.fail('Print indisponível para este envio.'); end if;
  if exists(select 1 from public.feedbacks where screenshot_id=p_screenshot_id) then
   perform app_private.fail('Print indisponível para este envio.');
  end if;
 end if;
 insert into public.feedbacks(author_id,attempt_key,kind,body,screenshot_id,page_path,browser_family)
 values(u,p_attempt_key,p_kind,body_text,p_screenshot_id,p_page_path,p_browser_family)
 returning * into f;
 return jsonb_build_object('id',f.id);
exception when check_violation then
 perform app_private.fail('Confira o tipo, a descrição e o contexto do feedback.');
end $$;

create function app_private.feedback_aal2(p_actor uuid,p_session uuid,p_aal text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_aal is not distinct from 'aal2' and exists(
  select 1 from auth.sessions where id=p_session and user_id=p_actor and aal='aal2'
 )
$$;

create function app_private.feedback_admin() returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid := app_private.require_role(array['admin']);
begin
 if not app_private.feedback_aal2(u,(auth.jwt()->>'session_id')::uuid,auth.jwt()->>'aal') then
  perform app_private.fail('Confirme o segundo fator para gerenciar feedbacks.');
 end if;
 return u;
end $$;

create function public.app_admin_feedbacks(p_kind text default null,p_status text default null,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.feedback_admin();
 if (p_kind is not null and p_kind not in ('suggestion','bug','other')) or
  (p_status is not null and p_status not in ('new','reviewing','planned','done')) or
  p_page is null or p_page not between 1 and 100000 then perform app_private.fail('Filtros inválidos.'); end if;
 with filtered as (
  select id,status,created_at from public.feedbacks
  where (p_kind is null or kind=p_kind) and (p_status is null or status=p_status)
 ), current_page as (
  select id from filtered order by created_at desc,id desc limit 20 offset (p_page-1)*20
 )
 select jsonb_build_object('page',p_page,'page_size',20,'total',(select count(*) from filtered),
  'counts',coalesce((select jsonb_object_agg(status,n) from (select status,count(*) n from filtered group by status) counts),'{}'::jsonb),
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'kind',f.kind,'status',f.status,
   'excerpt',left(f.body,240),'author_name',p.full_name,'created_at',f.created_at,'page_path',f.page_path,
   'has_screenshot',f.screenshot_id is not null) order by f.created_at desc,f.id desc)
   from current_page c join public.feedbacks f on f.id=c.id join public.profiles p on p.id=f.author_id),'[]'::jsonb))
 into result;
 return result;
end $$;

create function public.app_admin_feedback(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.feedback_admin();
 select jsonb_build_object('id',f.id,'kind',f.kind,'status',f.status,'revision',f.revision,
  'body',f.body,'author_name',p.full_name,'page_path',f.page_path,'browser_family',f.browser_family,
  'created_at',f.created_at,'screenshot_id',f.screenshot_id)
 into result from public.feedbacks f join public.profiles p on p.id=f.author_id where f.id=p_id;
 if not found then perform app_private.fail('Feedback indisponível.'); end if;
 return result;
end $$;

create function public.app_admin_feedback_status(p_id uuid,p_status text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := app_private.feedback_admin(); f public.feedbacks;
begin
 if p_status is null or p_status not in ('new','reviewing','planned','done') or p_revision is null then
  perform app_private.fail('Escolha uma situação válida.');
 end if;
 select * into f from public.feedbacks where id=p_id for update;
 if not found then perform app_private.fail('Feedback indisponível.'); end if;
 if f.status<>p_status then
  if f.revision<>p_revision then perform app_private.fail('A situação mudou. Atualize o detalhe e tente novamente.'); end if;
  perform app_private.audit(u,'feedback.status','feedback',f.id,f.status||' -> '||p_status);
  update public.feedbacks set status=p_status,revision=revision+1,updated_at=now() where id=f.id returning * into f;
 end if;
 return jsonb_build_object('id',f.id,'status',f.status,'revision',f.revision);
end $$;

create function public.app_feedback_screenshot_access(p_actor_id uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare object_path text; headers jsonb;
begin
 perform app_private.service_actor(p_actor_id);
 headers := current_setting('request.headers',true)::jsonb;
 select x.path into object_path from public.feedbacks f join public.uploads x on x.id=f.screenshot_id
 where x.id=p_id and x.kind='feedback-screenshot' and x.state='ready' and x.actor_id=f.author_id
  and (f.author_id=p_actor_id or (app_private.is_staff(p_actor_id,array['admin']) and app_private.feedback_aal2(
   p_actor_id,(headers->>'x-icarus-session-id')::uuid,headers->>'x-icarus-aal')));
 if not found then raise insufficient_privilege using message='Print indisponível.'; end if;
 return jsonb_build_object('storage_path',object_path,'can_access',true);
end $$;

alter function public.app_export_data() set schema app_private;
alter function app_private.app_export_data() rename to export_data_before_feedback;
revoke execute on function app_private.export_data_before_feedback() from public,anon,authenticated,service_role;
create function public.app_export_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare data jsonb := app_private.export_data_before_feedback();
begin
 return data||jsonb_build_object('feedbacks',coalesce((select jsonb_agg(jsonb_build_object(
  'id',f.id,'kind',f.kind,'body',f.body,'status',f.status,'page_path',f.page_path,'browser_family',f.browser_family,
  'created_at',f.created_at,'updated_at',f.updated_at,'screenshot_id',f.screenshot_id) order by f.created_at,f.id)
  from public.feedbacks f where f.author_id=auth.uid()),'[]'::jsonb));
end $$;

revoke execute on function app_private.upload_gate(uuid,uuid),app_private.feedback_aal2(uuid,uuid,text),
 app_private.feedback_admin() from public,anon,authenticated,service_role;
revoke execute on function public.app_feedback_screenshot_reserve(uuid,uuid,text,bigint),
 public.app_feedback_screenshot_access(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_feedback_screenshot_reserve(uuid,uuid,text,bigint),
 public.app_feedback_screenshot_access(uuid,uuid) to service_role;
revoke execute on function public.app_submit_feedback(uuid,text,text,uuid,text,text),public.app_admin_feedbacks(text,text,integer),
 public.app_admin_feedback(uuid),public.app_admin_feedback_status(uuid,text,integer),public.app_export_data()
 from public,anon,authenticated,service_role;
grant execute on function public.app_submit_feedback(uuid,text,text,uuid,text,text),public.app_admin_feedbacks(text,text,integer),
 public.app_admin_feedback(uuid),public.app_admin_feedback_status(uuid,text,integer),public.app_export_data() to authenticated;

notify pgrst,'reload schema';
commit;
