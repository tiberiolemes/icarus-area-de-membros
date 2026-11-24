begin;

-- O destinatário pode ser diferente do ator. O vínculo não disputa o lock do perfil na suspensão.
create table public.ica_notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null,
 source_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 read_at timestamptz,
 unique (user_id,event_key,source_id)
);
create index ica_notifications_owner_history on public.ica_notifications(user_id,created_at desc,id desc);
create index ica_notifications_owner_unread on public.ica_notifications(user_id,id) where read_at is null;

create table public.ica_notification_preferences (
 user_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null,
 in_app boolean not null,
 primary key (user_id,event_key)
);

alter table public.ica_notifications enable row level security;
alter table public.ica_notification_preferences enable row level security;
revoke all on public.ica_notifications,public.ica_notification_preferences from public,anon,authenticated,service_role;

-- Somente eventos opcionais disponíveis. Comunicações transacionais críticas seguem o fluxo existente.
create function ica_private.notification_preference_items(p_user uuid)
returns setof jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('event_key',e.event_key,'group',e.group_name,'label',e.label,
  'in_app',coalesce(p.in_app,true),'email',false,'email_available',false)
 from (values
  ('certificate_issued','Progresso','Certificado emitido'),
  ('lesson_comment_approved','Conteúdo','Comentário de aula aprovado')
 ) e(event_key,group_name,label)
 left join public.ica_notification_preferences p on p.user_id=p_user and p.event_key=e.event_key
$$;

create function ica_private.notification_item(p_item public.ica_notifications)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p_item.id,'event_key',p_item.event_key,
  'created_at',p_item.created_at,'read_at',p_item.read_at,
  'title',case when p_item.event_key='certificate_issued' then 'Certificado emitido'
   else 'Comentário aprovado' end,
  'subtitle',case when p_item.event_key='certificate_issued' then (
    select left(c.course_title,200) from public.ica_certificates c
    where c.id=p_item.source_id and c.user_id=p_item.user_id
   ) else 'Seu comentário foi aprovado na aula.' end,
  'action_path',case when p_item.event_key='certificate_issued' then '/app/certificados'
   else (
    select '/app/cursos/'||c.slug||'/'||m.slug||case when exists (
      -- A rota de aula não inclui seção, e duas seções podem ter o mesmo slug de aula.
      select from public.ica_sections sibling
      join public.ica_lessons other_lesson on other_lesson.section_id=sibling.id
      where sibling.module_id=m.id and other_lesson.slug=l.slug and other_lesson.id<>l.id
       and ((sibling.status='published' and other_lesson.status='published')
         or ica_private.is_staff(p_item.user_id,array['admin','instructor']))
    ) then '' else '/'||l.slug end
    from public.ica_lesson_comments lc
    join public.ica_lessons l on l.id=lc.lesson_id
    join public.ica_sections s on s.id=l.section_id
    join public.ica_modules m on m.id=s.module_id
    join public.ica_courses c on c.id=m.course_id
    where lc.id=p_item.source_id and lc.author_id=p_item.user_id
     and ica_private.lesson_access(p_item.user_id,l.id)
   ) end)
$$;

create function ica_private.notify_learning_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 recipient uuid;
 event_key_in text := TG_ARGV[0];
begin
 if event_key_in='certificate_issued' then recipient := new.user_id;
 else recipient := new.author_id;
 end if;

 -- A gravação da preferência e a decisão de entrega são serializadas por titular e evento.
 perform pg_advisory_xact_lock_shared(hashtextextended('icarus.notifications/'||recipient||'/'||event_key_in,0));
 insert into public.ica_notifications(user_id,event_key,source_id)
 select recipient,event_key_in,new.id
 where not exists (
  select from public.ica_notification_preferences p
  where p.user_id=recipient and p.event_key=event_key_in and not p.in_app
 )
 on conflict (user_id,event_key,source_id) do nothing;
 return null;
end $$;

create trigger notify_certificate_issued after insert on public.ica_certificates
 for each row when (new.revoked_at is null)
 execute function ica_private.notify_learning_event('certificate_issued');

create trigger notify_lesson_comment_approved after update of status on public.ica_lesson_comments
 for each row when (old.status='pending' and new.status='approved')
 execute function ica_private.notify_learning_event('lesson_comment_approved');

create function public.app_notifications(p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid := ica_private.actor();
 page_number integer := greatest(p_page,1);
 result jsonb;
begin
 perform ica_private.throttle(u,'notifications_list',120);
 select jsonb_build_object('items',coalesce((
  select jsonb_agg(ica_private.notification_item(n.item) order by n.created_at desc,n.id desc)
  from (
   select n item,n.created_at,n.id from public.ica_notifications n where n.user_id=u
   order by n.created_at desc,n.id desc limit 20 offset ((page_number::bigint-1)*20)
  ) n
 ),'[]'::jsonb),
  'total',(select count(*) from public.ica_notifications where user_id=u),
  'page',page_number,'page_size',20,
  'unread_count',(select count(*) from public.ica_notifications where user_id=u and read_at is null))
 into result;
 return result;
end $$;

create function public.app_notifications_read(p_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := ica_private.actor();
begin
 perform ica_private.throttle(u,'notifications_read',60);
 update public.ica_notifications set read_at=clock_timestamp()
 where user_id=u and read_at is null and (p_id is null or id=p_id);
 return jsonb_build_object('unread_count',(
  select count(*) from public.ica_notifications where user_id=u and read_at is null
 ));
end $$;

create function public.app_notification_preferences()
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := ica_private.actor();
begin
 perform ica_private.throttle(u,'notification_preferences',120);
 return jsonb_build_object('items',(
  select jsonb_agg(i.item order by i.item->>'event_key')
  from ica_private.notification_preference_items(u) i(item)
 ));
end $$;

create function public.app_set_notification_preference(p_event_key text,p_in_app boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid := ica_private.actor();
 preference jsonb;
begin
 perform ica_private.throttle(u,'notification_preference_set',60);
 select i.item into preference from ica_private.notification_preference_items(u) i(item)
 where i.item->>'event_key'=p_event_key;
 if preference is null or p_in_app is null then
  perform ica_private.fail('Informe um evento de notificação disponível e sua preferência.');
 end if;

 perform pg_advisory_xact_lock(hashtextextended('icarus.notifications/'||u||'/'||p_event_key,0));
 insert into public.ica_notification_preferences(user_id,event_key,in_app) values (u,p_event_key,p_in_app)
 on conflict (user_id,event_key) do update set in_app=excluded.in_app
  where ica_notification_preferences.in_app is distinct from excluded.in_app;
 return preference||jsonb_build_object('in_app',p_in_app);
end $$;

revoke execute on function ica_private.notification_preference_items(uuid),
 ica_private.notification_item(public.ica_notifications),ica_private.notify_learning_event()
 from public,anon,authenticated,service_role;
revoke execute on function public.app_notifications(integer),public.app_notifications_read(uuid),
 public.app_notification_preferences(),public.app_set_notification_preference(text,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.app_notifications(integer),public.app_notifications_read(uuid),
 public.app_notification_preferences(),public.app_set_notification_preference(text,boolean)
 to authenticated;

create or replace function public.app_export_data() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid := ica_private.actor();
 inbox jsonb;
 inbox_truncated boolean;
begin
 perform ica_private.throttle(u,'export',2);
 -- O item extra indica truncamento sem alterar o prefixo exportado nem o histórico.
 select coalesce(jsonb_agg(ica_private.notification_item(q.item) order by q.position)
   filter (where q.position<=1000),'[]'::jsonb),count(*)>1000
 into inbox,inbox_truncated
 from (
  select n item,row_number() over (order by n.created_at desc,n.id desc) as position
  from public.ica_notifications n where n.user_id=u
  order by n.created_at desc,n.id desc limit 1001
 ) q;

 return jsonb_build_object(
  'profile',ica_private.profile_json(u),
  'subscriptions',coalesce((select jsonb_agg(to_jsonb(s)-'order_id') from public.ica_subscriptions s where user_id=u),'[]'::jsonb),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.ica_lesson_progress p where user_id=u),'[]'::jsonb),
  'certificates',coalesce((select jsonb_agg(to_jsonb(c)) from public.ica_certificates c where user_id=u),'[]'::jsonb),
  'posts',coalesce((select jsonb_agg(to_jsonb(p)-'archived_by') from public.ica_posts p where author_id=u),'[]'::jsonb),
  'replies',coalesce((select jsonb_agg(to_jsonb(r)) from public.ica_replies r where author_id=u),'[]'::jsonb),
  'ticket_messages',coalesce((select jsonb_agg(to_jsonb(m)) from public.ica_ticket_messages m where author_id=u),'[]'::jsonb),
  'orders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'amount_cents',amount_cents,'status',status,'created_at',created_at)) from public.ica_orders where user_id=u),'[]'::jsonb),
  'legal_acceptances',coalesce((select jsonb_agg(to_jsonb(a)) from public.ica_legal_acceptances a where user_id=u),'[]'::jsonb),
  'privacy_requests',coalesce((select jsonb_agg(to_jsonb(p)) from public.ica_privacy_requests p where user_id=u),'[]'::jsonb),
  'lesson_favorites',coalesce((
   select jsonb_agg(jsonb_build_object('lesson_id',f.lesson_id) order by f.lesson_id)
   from public.ica_lesson_favorites f where f.user_id=u
  ),'[]'::jsonb),
  'lesson_notes',coalesce((
   select jsonb_agg(jsonb_build_object('id',n.id,'lesson_id',n.lesson_id,'body',n.body,
    'position_seconds',n.position_seconds,'updated_at',n.updated_at) order by n.updated_at desc,n.id)
   from public.ica_lesson_notes n where n.user_id=u
  ),'[]'::jsonb),
  'lesson_checklist_items',coalesce((
   select jsonb_agg(jsonb_build_object('lesson_id',c.lesson_id,'item_id',c.item_id) order by c.lesson_id,c.item_id)
   from public.ica_lesson_checklist_items c where c.user_id=u
  ),'[]'::jsonb),
  'lesson_comments',coalesce((
   select jsonb_agg(jsonb_build_object('id',c.id,'lesson_id',c.lesson_id,'body',c.body,'parent_id',p.id,
    'status',c.status,'is_instructor',c.is_instructor,'created_at',c.created_at) order by c.created_at,c.id)
   from public.ica_lesson_comments c
   left join public.ica_lesson_comments p on p.lesson_id=c.lesson_id and p.id=c.parent_id and p.author_id=u
   where c.author_id=u
  ),'[]'::jsonb),
  'notifications',inbox,
  'notifications_truncated',inbox_truncated,
  'notification_preferences',(
   select jsonb_agg(i.item order by i.item->>'event_key')
   from ica_private.notification_preference_items(u) i(item)
  )
 );
end $$;

revoke execute on function public.app_export_data() from public,anon,authenticated,service_role;
grant execute on function public.app_export_data() to authenticated;

notify pgrst,'reload schema';
commit;
