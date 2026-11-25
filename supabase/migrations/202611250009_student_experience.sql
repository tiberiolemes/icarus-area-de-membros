begin;

-- Usa a mesma assinatura vigente para o nome e o identificador do plano atual.
create or replace function app_private.profile_json(p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p)-'created_at' || jsonb_build_object('email',u.email,'plan_name',s.plan_name,'current_plan_id',s.plan_id,'access_ends_at',s.ends_at)
 from public.profiles p join auth.users u on u.id=p.id left join lateral(
 select x.plan_id,pl.name plan_name,x.ends_at from public.subscriptions x join public.plans pl on pl.id=x.plan_id where x.user_id=p.id and x.revoked_at is null and x.starts_at<=now() and x.ends_at>now() order by x.ends_at desc,x.id limit 1
 )s on true where p.id=p_actor
$$;
revoke execute on function app_private.profile_json(uuid) from public,anon,authenticated,service_role;

-- A ementa usa apenas o progresso do próprio aluno para a retomada.
create or replace function app_private.lesson_summary(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',l.id,'slug',l.slug,'title',l.title,'duration_seconds',l.duration_seconds,'type',l.type,'order_index',l.order_index,'can_access',app_private.lesson_access(p_actor,l.id),'completed',p.completed_at is not null,'position_seconds',coalesce(p.position_seconds,0),'last_activity_at',p.updated_at,'is_preview',l.is_preview,'is_required',l.is_required) from public.lessons l left join public.lesson_progress p on p.lesson_id=l.id and p.user_id=p_actor where l.id=p_id
$$;
revoke execute on function app_private.lesson_summary(uuid,uuid) from public,anon,authenticated,service_role;

-- O nome da pasta só é lido depois da conferência de sua cadeia de acesso.
create or replace function public.app_materials(p_folder_id uuid default null,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();begin
 perform app_private.require_module(u,'materials');
 if p_page<1 or p_page>100000 or length(p_query)>200 then perform app_private.fail('Busca inválida.');end if;
 if not app_private.folder_access(u,p_folder_id) then perform app_private.fail('Pasta indisponível.');end if;
 return jsonb_build_object(
  'current_folder',(select jsonb_build_object('id',id,'name',name,'parent_id',parent_id) from public.material_folders where id=p_folder_id),
  'folders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'parent_id',parent_id)) from public.material_folders where parent_id is not distinct from p_folder_id and app_private.folder_access(u,id)),'[]'::jsonb),'items',coalesce((select jsonb_agg(app_private.material_json(u,x.id)) from(select id from public.materials where folder_id is not distinct from p_folder_id and status='published' and name ilike '%'||p_query||'%' order by name,id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.materials where folder_id is not distinct from p_folder_id and status='published' and name ilike '%'||p_query||'%'),'page',p_page,'page_size',20);
end $$;
revoke execute on function public.app_materials(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.app_materials(uuid,text,integer) to authenticated;

-- Só a prévia do encontro é visível sem plano. Os links continuam em app_live_event_link.
create or replace function public.app_live_events(p_recordings boolean default false,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); result jsonb;
begin
 perform app_private.require_module(u,'live_events');
 if p_recordings is null or p_page is null or p_page not between 1 and 10000 then
  perform app_private.fail('Página inválida.');
 end if;
 select jsonb_build_object('items', coalesce(jsonb_agg(
  jsonb_build_object('id',e.id,'starts_at',e.starts_at,'can_access',e.allowed,'title',e.title,'guest',e.guest)
  || case when e.allowed then jsonb_build_object(
     'description',e.description,'duration_minutes',e.duration_minutes,
     'confirmed',not p_recordings and exists(select 1 from public.live_event_rsvps r where r.event_id=e.id and r.user_id=u),
     'can_rsvp',e.starts_at>now()) else '{}'::jsonb end
  order by e.position) filter (where e.position <= 12),'[]'::jsonb),
  'has_more', count(*)>12) into result
 from (
  select page.*,row_number() over (order by
    case when p_recordings then page.starts_at end desc,page.starts_at,page.id) as position,
    app_private.entitled(u,page.access_mode,page.plan_ids) as allowed
  from (
   select id, starts_at, title, guest, description, duration_minutes, access_mode, plan_ids
   from public.live_events
   where status='published' and case when p_recordings then
    recording_url is not null and starts_at + make_interval(mins=>duration_minutes)<=now()
    else starts_at + make_interval(mins=>duration_minutes)>now() end
   order by case when p_recordings then starts_at end desc, starts_at,id
   limit 13 offset (p_page-1)*12
  ) page
 ) e;
 return result;
end $$;
revoke execute on function public.app_live_events(boolean,integer) from public,anon,authenticated,service_role;
grant execute on function public.app_live_events(boolean,integer) to authenticated;

commit;
