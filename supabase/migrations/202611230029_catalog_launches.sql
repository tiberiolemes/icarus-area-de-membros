begin;

create table ica_private.catalog_launches (
 id uuid primary key default gen_random_uuid(),
 course_id uuid unique references public.ica_courses(id),
 module_id uuid unique references public.ica_modules(id),
 title text not null check (char_length(title) between 1 and 160),
 summary text not null check (char_length(summary) between 1 and 500),
 planned_on date,
 enabled boolean not null,
 released_at timestamptz,
 check (num_nonnulls(course_id,module_id)=1)
);

create table ica_private.catalog_launch_signups (
 launch_id uuid not null references ica_private.catalog_launches(id),
 user_id uuid not null references auth.users(id) on delete cascade,
 subscribed_at timestamptz not null default clock_timestamp(),
 primary key (launch_id,user_id)
);
create index catalog_launch_signups_owner on ica_private.catalog_launch_signups(user_id,subscribed_at,launch_id);
alter table ica_private.catalog_launches enable row level security;
alter table ica_private.catalog_launch_signups enable row level security;
revoke all on ica_private.catalog_launches,ica_private.catalog_launch_signups from public,anon,authenticated,service_role;

-- No rascunho, o anúncio de curso divulga apenas os metadados editoriais.
-- Em conteúdo publicado, entrega e leitura do aviso exigem acesso atual.
create function ica_private.catalog_launch_visible(p_user uuid,p_launch ica_private.catalog_launches,p_status text)
returns boolean language sql stable set search_path='' as $$
 select exists (
  select from public.ica_profiles p where p.id=p_user and not p.suspended
 ) and case when p_launch.module_id is null then exists (
  select from public.ica_courses c where c.id=p_launch.course_id and c.status=p_status
   and (p_status='draft' or ica_private.course_access(p_user,c.id))
 ) else exists (
  select from public.ica_modules m join public.ica_courses c on c.id=m.course_id
  where m.id=p_launch.module_id and m.status=p_status and c.status='published'
   and ica_private.course_access(p_user,c.id)
   and (m.access_mode='inherit' or ica_private.entitled(p_user,m.access_mode,m.plan_ids))
 ) end
$$;

create function public.app_catalog_launches(p_course_slug text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := ica_private.actor();
begin
 if char_length(p_course_slug)>200 then perform ica_private.fail('Curso indisponível.'); end if;
 return coalesce((
  select jsonb_agg(q.item order by q.planned_on nulls last,q.title,q.id)
  from (
   select a.id,a.title,a.planned_on,jsonb_build_object(
    'key',a.id,'title',a.title,'summary',a.summary,'planned_on',a.planned_on,
    'subscribed',exists(select from ica_private.catalog_launch_signups s where s.launch_id=a.id and s.user_id=u)
   ) item
   from ica_private.catalog_launches a
   where a.enabled and a.released_at is null
    and (case when p_course_slug is null then a.course_id is not null else exists (
     select from public.ica_modules m join public.ica_courses c on c.id=m.course_id
     where m.id=a.module_id and c.slug=p_course_slug and c.status='published'
    ) end)
    and ica_private.catalog_launch_visible(u,a,'draft')
   order by a.planned_on nulls last,a.title,a.id limit 50
  ) q
 ),'[]'::jsonb);
end $$;

create function public.app_subscribe_catalog_launch(p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := ica_private.actor(); a ica_private.catalog_launches;
begin
 perform ica_private.throttle(u,'catalog_launch_subscribe',60);
 -- Só trava o anúncio; a publicação já vem com o recurso (e seu currículo) travado.
 select * into a from ica_private.catalog_launches where id=p_key for update;
 if not found or not a.enabled or a.released_at is not null
  or not ica_private.catalog_launch_visible(u,a,'draft') then
  perform ica_private.fail('Lançamento indisponível.');
 end if;
 insert into ica_private.catalog_launch_signups(launch_id,user_id) values(a.id,u)
 on conflict (launch_id,user_id) do nothing;
 return jsonb_build_object('subscribed',true);
end $$;

create function public.app_admin_catalog_launch(p_entity text,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_entity is null or p_entity not in ('courses','modules') then
  perform ica_private.fail('Conteúdo indisponível.');
 end if;
 perform ica_private.require_role(ica_private.entity_roles(p_entity));
 return (
  select jsonb_build_object('title',title,'summary',summary,'planned_on',planned_on,'enabled',enabled)
  from ica_private.catalog_launches
  where released_at is null
   and (case when p_entity='courses' then course_id=p_id else module_id=p_id end)
 );
end $$;

create function public.app_admin_save_catalog_launch(
 p_entity text,p_id uuid,p_title text,p_summary text,p_planned_on date,p_enabled boolean
) returns void language plpgsql security definer set search_path='' as $$
declare u uuid; status_now text; a ica_private.catalog_launches;
begin
 if p_entity is null or p_entity not in ('courses','modules') then
  perform ica_private.fail('Conteúdo indisponível.');
 end if;
 u:=ica_private.require_role(ica_private.entity_roles(p_entity));
 if coalesce(char_length(trim(p_title)),0) not between 1 and 160
  or coalesce(char_length(trim(p_summary)),0) not between 1 and 500
  or p_enabled is null or (p_planned_on is not null and p_planned_on not between date '0001-01-01' and date '9999-12-31') then
  perform ica_private.fail('Revise o título, o resumo e a data do anúncio.');
 end if;
 perform ica_private.lock_lesson_engagement_actor(u);
 perform ica_private.throttle(u,'catalog_launch_save',60);
 if p_entity='courses' then
  select status into status_now from public.ica_courses where id=p_id for update;
 else
  select status into status_now from public.ica_modules where id=p_id for update;
 end if;
 if status_now is distinct from 'draft' then perform ica_private.fail('Salve o conteúdo como rascunho para editar o anúncio.'); end if;
 select * into a from ica_private.catalog_launches
 where (case when p_entity='courses' then course_id=p_id else module_id=p_id end) for update;
 if a.released_at is not null then perform ica_private.fail('Este lançamento já ocorreu.'); end if;
 if found then
  update ica_private.catalog_launches set
   title=trim(p_title),summary=trim(p_summary),planned_on=p_planned_on,enabled=p_enabled
  where id=a.id;
 else
  insert into ica_private.catalog_launches(course_id,module_id,title,summary,planned_on,enabled)
  values (
   case when p_entity='courses' then p_id end,case when p_entity='modules' then p_id end,
   trim(p_title),trim(p_summary),p_planned_on,p_enabled
  );
 end if;
 perform ica_private.audit(u,case when a.id is null then 'catalog_launch_create'
  else 'catalog_launch_update' end,p_entity,p_id);
end $$;

create function ica_private.release_catalog_launches()
returns trigger language plpgsql security definer set search_path='' as $$
declare a ica_private.catalog_launches; recipient uuid;
begin
 for a in
  select l.* from ica_private.catalog_launches l
  where l.released_at is null and (
   case when tg_table_name='ica_courses' then l.course_id=new.id or exists (
    select from public.ica_modules m where m.id=l.module_id and m.course_id=new.id
   ) else l.module_id=new.id end
  )
  order by l.id for update of l
 loop
  if a.module_id is not null and not exists (
   select from public.ica_modules m join public.ica_courses c on c.id=m.course_id
   where m.id=a.module_id and m.status='published' and c.status='published'
  ) then continue; end if;
  update ica_private.catalog_launches set released_at=clock_timestamp() where id=a.id;
  if not a.enabled then continue; end if;
  for recipient in select user_id from ica_private.catalog_launch_signups where launch_id=a.id order by user_id
  loop
   perform pg_advisory_xact_lock_shared(hashtextextended('icarus.notifications/'||recipient||'/catalog_launch',0));
   insert into public.ica_notifications(user_id,event_key,source_id)
   select recipient,'catalog_launch',a.id
   where ica_private.catalog_launch_visible(recipient,a,'published')
    and not exists (
     select from public.ica_notification_preferences p
     where p.user_id=recipient and p.event_key='catalog_launch' and not p.in_app
    )
   on conflict (user_id,event_key,source_id) do nothing;
  end loop;
 end loop;
 return null;
end $$;

create trigger z_catalog_course_launch after update of status on public.ica_courses
 for each row when (old.status<>'published' and new.status='published')
 execute function ica_private.release_catalog_launches();

-- O PostgreSQL roda triggers equivalentes por nome. O 006 trava o curso antes deste trigger.
create trigger z_catalog_module_launch after update of status on public.ica_modules
 for each row when (old.status<>'published' and new.status='published')
 execute function ica_private.release_catalog_launches();

alter function ica_private.notification_item(public.ica_notifications) rename to notification_item_v026;
create function ica_private.notification_item(p_item public.ica_notifications)
returns jsonb language sql stable set search_path='' as $$
 select case when p_item.event_key<>'catalog_launch' then ica_private.notification_item_v026(p_item)
 else jsonb_build_object('id',p_item.id,'event_key',p_item.event_key,
  'created_at',p_item.created_at,'read_at',p_item.read_at,'title','Conteúdo publicado',
  'subtitle',(select a.title from ica_private.catalog_launches a
   where a.id=p_item.source_id and ica_private.catalog_launch_visible(p_item.user_id,a,'published')),
  'action_path',(
   select '/app/cursos/'||c.slug||case when m.id is null then '' else '/'||m.slug end
   from ica_private.catalog_launches a left join public.ica_modules m on m.id=a.module_id
   join public.ica_courses c on c.id=coalesce(a.course_id,m.course_id)
   where a.id=p_item.source_id and ica_private.catalog_launch_visible(p_item.user_id,a,'published')
  )) end
$$;

alter function ica_private.notification_preference_items(uuid) rename to notification_preference_items_v026;
create function ica_private.notification_preference_items(p_user uuid)
returns setof jsonb language sql stable set search_path='' as $$
 select * from ica_private.notification_preference_items_v026(p_user)
 union all
 select jsonb_build_object('event_key','catalog_launch','group','Conteúdo','label','Lançamentos inscritos',
  'in_app',coalesce((select p.in_app from public.ica_notification_preferences p
    where p.user_id=p_user and p.event_key='catalog_launch'),true),'email',false,'email_available',false)
$$;

alter function public.app_export_data() set schema ica_private;
alter function ica_private.app_export_data() rename to export_data_v026;
revoke execute on function ica_private.export_data_v026() from public,anon,authenticated,service_role;
create function public.app_export_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare data jsonb := ica_private.export_data_v026();
begin
 return data||jsonb_build_object('catalog_launch_signups',coalesce((
  select jsonb_agg(jsonb_build_object('launch_key',s.launch_id,'subscribed_at',s.subscribed_at)
   order by s.subscribed_at,s.launch_id)
  from ica_private.catalog_launch_signups s where s.user_id=auth.uid()
 ),'[]'::jsonb));
end $$;

revoke execute on function ica_private.catalog_launch_visible(uuid,ica_private.catalog_launches,text),
 ica_private.release_catalog_launches(),ica_private.notification_item(public.ica_notifications),
 ica_private.notification_preference_items(uuid)
 from public,anon,authenticated,service_role;
revoke execute on function public.app_catalog_launches(text),public.app_subscribe_catalog_launch(uuid),
 public.app_admin_catalog_launch(text,uuid),public.app_admin_save_catalog_launch(text,uuid,text,text,date,boolean),
 public.app_export_data()
 from public,anon,authenticated,service_role;
grant execute on function public.app_catalog_launches(text),public.app_subscribe_catalog_launch(uuid),
 public.app_admin_catalog_launch(text,uuid),public.app_admin_save_catalog_launch(text,uuid,text,text,date,boolean),
 public.app_export_data()
 to authenticated;

notify pgrst,'reload schema';
commit;
