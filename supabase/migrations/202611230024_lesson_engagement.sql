begin;

create table public.ica_lesson_favorites (
 user_id uuid not null references public.ica_profiles(id),
 lesson_id uuid not null references public.ica_lessons(id),
 primary key (user_id,lesson_id)
);

create table public.ica_lesson_notes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.ica_profiles(id),
 lesson_id uuid not null references public.ica_lessons(id),
 body text not null check (length(body) between 1 and 2000),
 position_seconds numeric check (position_seconds between 0 and 86400),
 updated_at timestamptz not null default clock_timestamp()
);
create index ica_lesson_notes_owner_page on public.ica_lesson_notes(user_id,lesson_id,updated_at desc,id);

create table public.ica_lesson_comments (
 id uuid primary key default gen_random_uuid(),
 lesson_id uuid not null references public.ica_lessons(id),
 author_id uuid not null references public.ica_profiles(id),
 parent_id uuid,
 body text not null check (length(body) between 1 and 10000),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 is_instructor boolean not null,
 created_at timestamptz not null default clock_timestamp(),
 unique (lesson_id,id),
 foreign key (lesson_id,parent_id) references public.ica_lesson_comments(lesson_id,id),
 check (id is distinct from parent_id)
);
create index ica_lesson_comments_page on public.ica_lesson_comments(lesson_id,created_at,id);

alter table public.ica_lesson_favorites enable row level security;
alter table public.ica_lesson_notes enable row level security;
alter table public.ica_lesson_comments enable row level security;
revoke all on public.ica_lesson_favorites,public.ica_lesson_notes,public.ica_lesson_comments
 from public,anon,authenticated,service_role;

create function ica_private.lesson_engagement_actor(p_lesson_id uuid,p_review boolean default false)
returns uuid language plpgsql set search_path='' as $$
declare actor_id uuid := ica_private.actor();
begin
 if p_review and not ica_private.is_staff(actor_id,array['admin','moderator']) then
  perform ica_private.fail();
 end if;
 if not ica_private.lesson_access(actor_id,p_lesson_id) then
  perform ica_private.fail('Aula indisponível para seu acesso.');
 end if;
 return actor_id;
end $$;
revoke execute on function ica_private.lesson_engagement_actor(uuid,boolean)
 from public,anon,authenticated,service_role;

create function ica_private.lock_lesson_engagement_actor(p_actor_id uuid)
returns void language plpgsql set search_path='' as $$
begin
 -- The admin locks the profile before revoking sessions. The actor already holds its session.
 perform 1 from public.ica_profiles where id=p_actor_id for key share nowait;
exception when lock_not_available then
 perform ica_private.fail('Sua conta está sendo atualizada. Tente novamente em instantes.');
end $$;

create function ica_private.trim_lesson_engagement_text(p_text text)
returns text language sql immutable strict set search_path='' as $$
 -- Unicode White_Space and the BOM stripped by the browser's trim().
 select btrim(p_text,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;
revoke execute on function ica_private.lock_lesson_engagement_actor(uuid),
 ica_private.trim_lesson_engagement_text(text) from public,anon,authenticated,service_role;

create function public.app_lesson_favorite(p_lesson_id uuid,p_saved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid := ica_private.lesson_engagement_actor(p_lesson_id);
begin
 if p_saved is null then perform ica_private.fail('Informe se a aula deve ser favoritada.'); end if;
 if p_saved then
  perform ica_private.lock_lesson_engagement_actor(actor_id);
  insert into public.ica_lesson_favorites(user_id,lesson_id) values (actor_id,p_lesson_id)
   on conflict (user_id,lesson_id) do nothing;
 else
  delete from public.ica_lesson_favorites where user_id=actor_id and lesson_id=p_lesson_id;
 end if;
 return jsonb_build_object('saved',p_saved);
end $$;

create function public.app_lesson_engagement(p_lesson_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid := ica_private.lesson_engagement_actor(p_lesson_id);
begin
 return jsonb_build_object(
  'saved',exists(select 1 from public.ica_lesson_favorites where user_id=actor_id and lesson_id=p_lesson_id),
  'notes_count',(select count(*) from public.ica_lesson_notes where user_id=actor_id and lesson_id=p_lesson_id),
  'comments_count',(select count(*) from public.ica_lesson_comments
    where lesson_id=p_lesson_id and (status='approved' or author_id=actor_id))
 );
end $$;

create function public.app_lesson_notes(p_lesson_id uuid,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid := ica_private.lesson_engagement_actor(p_lesson_id);
begin
 if p_page is null or p_page not between 1 and 100000 then perform ica_private.fail('Página inválida.'); end if;
 return (
  with visible as not materialized (
   select id,body,position_seconds,updated_at from public.ica_lesson_notes
   where user_id=actor_id and lesson_id=p_lesson_id
  ), page_items as (
   select * from visible order by updated_at desc,id limit 20 offset (p_page-1)*20
  )
  select jsonb_build_object(
   'items',coalesce((select jsonb_agg(to_jsonb(n) order by n.updated_at desc,n.id) from page_items n),'[]'::jsonb),
   'total',(select count(*) from visible),'page',p_page,'page_size',20
  )
 );
end $$;

create function public.app_save_lesson_note(
 p_lesson_id uuid,p_id uuid,p_body text,p_position_seconds numeric default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := ica_private.lesson_engagement_actor(p_lesson_id);
 note_body text;
 note_id uuid;
begin
 note_body := ica_private.trim_lesson_engagement_text(p_body);
 if note_body is null or length(p_body)>2000 or note_body='' then
  perform ica_private.fail('Informe uma anotação de até 2000 caracteres.');
 end if;
 if p_position_seconds is not null and p_position_seconds not between 0 and 86400 then
  perform ica_private.fail('Posição inválida.');
 end if;
 perform ica_private.throttle(actor_id,'lesson_note',30);
 if p_id is null then
  perform ica_private.lock_lesson_engagement_actor(actor_id);
  insert into public.ica_lesson_notes(user_id,lesson_id,body,position_seconds)
   values (actor_id,p_lesson_id,note_body,p_position_seconds) returning id into note_id;
 else
  update public.ica_lesson_notes n
   set body=note_body,position_seconds=p_position_seconds,
       updated_at=case when (n.body,n.position_seconds) is distinct from (note_body,p_position_seconds)
                       then clock_timestamp() else n.updated_at end
   where n.id=p_id and n.user_id=actor_id and n.lesson_id=p_lesson_id
   returning n.id into note_id;
  if not found then perform ica_private.fail('Anotação indisponível.'); end if;
 end if;
 return jsonb_build_object('id',note_id);
end $$;

create function public.app_delete_lesson_note(p_lesson_id uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid := ica_private.lesson_engagement_actor(p_lesson_id);
begin
 delete from public.ica_lesson_notes where id=p_id and user_id=actor_id and lesson_id=p_lesson_id;
 if not found then perform ica_private.fail('Anotação indisponível.'); end if;
 return jsonb_build_object('id',p_id);
end $$;

create function public.app_lesson_comments(
 p_lesson_id uuid,p_page integer default 1,p_review boolean default false
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid := ica_private.lesson_engagement_actor(p_lesson_id,p_review);
begin
 if p_page is null or p_page not between 1 and 100000 then perform ica_private.fail('Página inválida.'); end if;
 if p_review is null then perform ica_private.fail('Modo de revisão inválido.'); end if;
 return (
  with visible as not materialized (
   select c.id,c.author_id,c.body,c.parent_id,c.status,c.is_instructor,c.created_at
   from public.ica_lesson_comments c
   where c.lesson_id=p_lesson_id
    and case when p_review then c.status='pending'
             else c.status='approved' or c.author_id=actor_id end
  ), page_items as (
   select v.id,p.full_name as author_name,v.body,v.parent_id,v.status,v.is_instructor,v.created_at
   from (select * from visible order by created_at,id limit 20 offset (p_page-1)*20) v
   join public.ica_profiles p on p.id=v.author_id
  )
  select jsonb_build_object(
   'items',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from page_items c),'[]'::jsonb),
   'total',(select count(*) from visible),'page',p_page,'page_size',20
  )
 );
end $$;

create function public.app_save_lesson_comment(p_lesson_id uuid,p_parent_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := ica_private.lesson_engagement_actor(p_lesson_id);
 comment_body text;
 comment_id uuid;
begin
 comment_body := ica_private.trim_lesson_engagement_text(p_body);
 if comment_body is null or length(p_body)>10000 or comment_body='' then
  perform ica_private.fail('Informe um comentário de até 10000 caracteres.');
 end if;
 -- Replies start at an approved root. A final decision keeps it visible to the whole thread.
 if p_parent_id is not null and not exists (
  select 1 from public.ica_lesson_comments
   where id=p_parent_id and lesson_id=p_lesson_id and parent_id is null and status='approved'
 ) then perform ica_private.fail('Comentário indisponível para resposta.'); end if;
 perform ica_private.lock_lesson_engagement_actor(actor_id);
 perform ica_private.throttle(actor_id,'lesson_comment',12);
 insert into public.ica_lesson_comments(lesson_id,author_id,parent_id,body,is_instructor)
  values (p_lesson_id,actor_id,p_parent_id,comment_body,ica_private.is_staff(actor_id,array['instructor']))
  returning id into comment_id;
 return jsonb_build_object('id',comment_id,'status','pending');
end $$;

create function public.app_moderate_lesson_comment(
 p_lesson_id uuid,p_id uuid,p_decision text,p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := ica_private.lesson_engagement_actor(p_lesson_id,true);
 next_status text := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' end;
 current_status text;
 decision_reason text;
begin
 if next_status is null then perform ica_private.fail('Decisão inválida.'); end if;
 decision_reason := ica_private.trim_lesson_engagement_text(p_reason);
 if decision_reason is null or length(decision_reason)<3 or length(p_reason)>2000 then
  perform ica_private.fail('Informe o motivo da decisão.');
 end if;
 perform ica_private.lock_lesson_engagement_actor(actor_id);
 select c.status into current_status from public.ica_lesson_comments c
  where c.id=p_id and c.lesson_id=p_lesson_id for update;
 if not found then perform ica_private.fail('Comentário indisponível.'); end if;
 if current_status='pending' then
  update public.ica_lesson_comments set status=next_status where id=p_id and lesson_id=p_lesson_id;
  insert into public.ica_moderation_events(actor_id,target_type,target_id,decision,reason)
   values (actor_id,'lesson_comment',p_id,p_decision,decision_reason);
  perform ica_private.audit(actor_id,'moderate:'||p_decision,'lesson_comment',p_id,decision_reason);
 elsif current_status<>next_status then
  perform ica_private.fail('Este comentário já foi revisado.');
 end if;
 return jsonb_build_object('id',p_id,'status',next_status);
end $$;

create or replace function public.app_export_data() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := ica_private.actor();
begin
 perform ica_private.throttle(u,'export',2);
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
  'lesson_comments',coalesce((
   select jsonb_agg(jsonb_build_object('id',c.id,'lesson_id',c.lesson_id,'body',c.body,'parent_id',p.id,
    'status',c.status,'is_instructor',c.is_instructor,'created_at',c.created_at) order by c.created_at,c.id)
   from public.ica_lesson_comments c
   left join public.ica_lesson_comments p on p.lesson_id=c.lesson_id and p.id=c.parent_id and p.author_id=u
   where c.author_id=u
  ),'[]'::jsonb)
 );
end $$;

revoke execute on function
 public.app_lesson_favorite(uuid,boolean),
 public.app_lesson_engagement(uuid),
 public.app_lesson_notes(uuid,integer),
 public.app_save_lesson_note(uuid,uuid,text,numeric),
 public.app_delete_lesson_note(uuid,uuid),
 public.app_lesson_comments(uuid,integer,boolean),
 public.app_save_lesson_comment(uuid,uuid,text),
 public.app_moderate_lesson_comment(uuid,uuid,text,text)
 from public,anon,authenticated,service_role;
grant execute on function
 public.app_lesson_favorite(uuid,boolean),
 public.app_lesson_engagement(uuid),
 public.app_lesson_notes(uuid,integer),
 public.app_save_lesson_note(uuid,uuid,text,numeric),
 public.app_delete_lesson_note(uuid,uuid),
 public.app_lesson_comments(uuid,integer,boolean),
 public.app_save_lesson_comment(uuid,uuid,text),
 public.app_moderate_lesson_comment(uuid,uuid,text,text)
 to authenticated;

notify pgrst,'reload schema';
commit;
