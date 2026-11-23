begin;
create schema if not exists app_private;
revoke all on schema app_private from public,anon,authenticated;
create extension if not exists pgcrypto with schema extensions;
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;
alter default privileges in schema app_private revoke execute on functions from public,anon,authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 full_name text not null default '' check(length(full_name)<=160), phone text not null default '' check(length(phone)<=40),
 bio text not null default '' check(length(bio)<=2000), company jsonb not null default '{}' check(jsonb_typeof(company)='object'),
 role text not null default 'member' check(role in ('member','instructor','moderator','support','admin')),
 theme text not null default 'light' check(theme in ('light','dark')), suspended boolean not null default false,
 onboarding_complete boolean not null default false, demo boolean not null default false, created_at timestamptz not null default now()
);
create table public.plans (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 price_cents integer not null check(price_cents>=0),access_months integer not null check(access_months between 1 and 120),benefits jsonb not null default '[]' check(jsonb_typeof(benefits)='array'),active boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),plan_id uuid not null references public.plans(id),
 starts_at timestamptz not null default now(),ends_at timestamptz not null,revoked_at timestamptz,source text not null check(source in ('order','courtesy')),order_id uuid unique,
 check(ends_at>starts_at)
);
create index subscriptions_access on public.subscriptions(user_id,ends_at) where revoked_at is null;
create table public.app_sessions (
 id uuid primary key references auth.sessions(id) on delete cascade,user_id uuid not null references public.profiles(id),
 last_activity_at timestamptz not null default now(),expires_at timestamptz not null,revoked_at timestamptz
);
create table public.reauth_nonces (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),actor_id uuid not null references public.profiles(id),session_id uuid not null references public.app_sessions(id),
 expires_at timestamptz not null,consumed_at timestamptz
);
create table public.legal_versions (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('terms','privacy')),version text not null check(length(version) between 1 and 80),
 title text not null check(length(title) between 1 and 200),body text not null check(length(body) between 40 and 100000),published boolean not null default false,demo boolean not null default false,
 created_at timestamptz not null default now(),unique(kind,version)
);
create unique index legal_one_active on public.legal_versions(kind) where published;
create table public.legal_acceptances (
 id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles(id),order_id uuid,legal_version_id uuid not null references public.legal_versions(id),accepted_at timestamptz not null default now(),marketing_opt_in boolean not null default false,
 check(user_id is not null or order_id is not null)
);
create table public.onboarding (
 id uuid primary key default gen_random_uuid(),name_label text not null default 'Nome completo',company_label text not null default 'Empresa',company_required boolean not null default true,
 singleton boolean not null default true unique check(singleton)
);
insert into public.onboarding default values;
create table public.courses (
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),title text not null check(length(title) between 1 and 200),description text not null default '' check(length(description)<=20000),cover_url text,
 status text not null default 'draft' check(status in ('draft','published','archived')),previous_status text,
 access_mode text not null default 'subscribers' check(access_mode in ('members','subscribers','plans')),plan_ids uuid[] not null default '{}',
 certificate_enabled boolean not null default false,curriculum_version integer not null default 1,required_lesson_ids uuid[] not null default '{}',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.modules (
 id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id),slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),title text not null check(length(title) between 1 and 200),order_index integer not null default 0 check(order_index>=0),
 status text not null default 'draft' check(status in ('draft','published','archived')),previous_status text,
 access_mode text not null default 'inherit' check(access_mode in ('inherit','members','subscribers','plans')),plan_ids uuid[] not null default '{}',unique(course_id,slug)
);
create index modules_parent on public.modules(course_id,order_index,id);
create table public.sections (
 id uuid primary key default gen_random_uuid(),module_id uuid not null references public.modules(id),title text not null check(length(title) between 1 and 200),order_index integer not null default 0 check(order_index>=0),is_bonus boolean not null default false,
 status text not null default 'draft' check(status in ('draft','published','archived')),previous_status text
);
create index sections_parent on public.sections(module_id,order_index,id);
create table public.lessons (
 id uuid primary key default gen_random_uuid(),section_id uuid not null references public.sections(id),slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),title text not null check(length(title) between 1 and 200),
 body text not null default '' check(length(body)<=100000),type text not null default 'text' check(type in ('text','video','audio')),duration_seconds integer not null default 0 check(duration_seconds between 0 and 86400),video_id text,storage_path text,
 is_preview boolean not null default false,is_required boolean not null default true,order_index integer not null default 0 check(order_index>=0),status text not null default 'draft' check(status in ('draft','published','archived')),previous_status text,unique(section_id,slug)
);
create index lessons_parent on public.lessons(section_id,order_index,id);
create table public.material_folders (
 id uuid primary key default gen_random_uuid(),parent_id uuid references public.material_folders(id),name text not null check(length(name) between 1 and 200),status text not null default 'draft' check(status in ('draft','published','archived')),previous_status text,
 access_mode text not null default 'subscribers' check(access_mode in ('members','subscribers','plans')),plan_ids uuid[] not null default '{}',check(parent_id is distinct from id)
);
create table public.materials (
 id uuid primary key default gen_random_uuid(),folder_id uuid references public.material_folders(id),lesson_id uuid references public.lessons(id),name text not null check(length(name) between 1 and 200),description text not null default '' check(length(description)<=4000),
 file_type text not null default 'application/pdf',size_bytes bigint not null default 0 check(size_bytes between 0 and 52428800),storage_path text,
 status text not null default 'draft' check(status in ('draft','published','archived')),previous_status text,access_mode text not null default 'subscribers' check(access_mode in ('members','subscribers','plans')),plan_ids uuid[] not null default '{}'
);
create index materials_parent on public.materials(folder_id,lesson_id);
create table public.lesson_progress (
 user_id uuid not null references public.profiles(id),lesson_id uuid not null references public.lessons(id),position_seconds numeric not null default 0 check(position_seconds>=0),completed_at timestamptz,updated_at timestamptz not null default now(),primary key(user_id,lesson_id)
);
create table public.certificates (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),course_id uuid not null references public.courses(id),curriculum_version integer not null,
 code text not null unique default encode(extensions.gen_random_bytes(24),'hex'),student_name text not null,course_title text not null,duration_minutes integer not null check(duration_minutes>=0),
 lesson_ids uuid[] not null check(cardinality(lesson_ids)>0),issued_at timestamptz not null default now(),revoked_at timestamptz,demo boolean not null default false,unique(user_id,course_id,curriculum_version)
);
create table public.spaces (
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 160),description text not null default '' check(length(description)<=4000),order_index integer not null default 0 check(order_index>=0),
 status text not null default 'draft' check(status in ('draft','published','archived')),previous_status text,access_mode text not null default 'subscribers' check(access_mode in ('members','subscribers','plans')),plan_ids uuid[] not null default '{}'
);
create table public.posts (
 id uuid primary key default gen_random_uuid(),space_id uuid not null references public.spaces(id),author_id uuid not null references public.profiles(id),title text not null check(length(title) between 1 and 200),body text not null check(length(body) between 1 and 20000),image_path text,
 status text not null default 'pending' check(status in ('pending','approved','rejected','hidden','removed','archived')),previous_status text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index posts_feed on public.posts(space_id,created_at desc,id);
create table public.replies (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts(id),author_id uuid not null references public.profiles(id),body text not null check(length(body) between 1 and 10000),
 status text not null default 'pending' check(status in ('pending','approved','rejected','hidden','removed','archived')),previous_status text,created_at timestamptz not null default now()
);
create index replies_parent on public.replies(post_id,created_at,id);
create table public.votes (
 actor_id uuid not null references public.profiles(id),post_id uuid references public.posts(id),reply_id uuid references public.replies(id),created_at timestamptz not null default now(),check(num_nonnulls(post_id,reply_id)=1),unique(actor_id,post_id),unique(actor_id,reply_id)
);
create table public.reports (
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles(id),post_id uuid references public.posts(id),reply_id uuid references public.replies(id),reason text not null check(length(reason) between 3 and 2000),status text not null default 'pending' check(status in ('pending','resolved','dismissed')),created_at timestamptz not null default now(),check(num_nonnulls(post_id,reply_id)=1)
);
create table public.moderation_events (
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles(id),target_type text not null,target_id uuid not null,decision text not null,reason text not null,created_at timestamptz not null default now()
);
create table public.tickets (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),subject text not null check(length(subject) between 3 and 200),priority text not null check(priority in ('low','normal','high')),status text not null default 'open' check(status in ('open','pending','closed')),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index tickets_owner on public.tickets(user_id,created_at desc);
create table public.ticket_messages (
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.tickets(id),author_id uuid not null references public.profiles(id),body text not null check(length(body) between 1 and 20000),created_at timestamptz not null default now()
);
create index ticket_messages_parent on public.ticket_messages(ticket_id,created_at,id);
create table public.uploads (
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles(id),kind text not null,resource_id uuid not null,
 ticket_id uuid references public.tickets(id),post_id uuid references public.posts(id),lesson_id uuid references public.lessons(id),material_id uuid references public.materials(id),course_id uuid references public.courses(id),
 path text not null unique,file_name text not null,content_type text not null,size_bytes bigint not null check(size_bytes between 1 and 52428800),created_at timestamptz not null default now(),check(num_nonnulls(ticket_id,post_id,lesson_id,material_id,course_id)=1)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles(id),plan_id uuid not null references public.plans(id),attempt_key text not null unique check(length(attempt_key) between 16 and 160),
 amount_cents integer not null check(amount_cents>0),access_months integer not null check(access_months between 1 and 120),method text not null check(method in ('PIX','CREDIT_CARD')),installments integer not null check(installments between 1 and 12),buyer_data jsonb not null,receipt_hash text not null check(receipt_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','paid','refunded','chargeback','expired','cancelled')),gateway_id text unique,checkout_url text,paid_at timestamptz,finalized_at timestamptz,created_at timestamptz not null default now()
);
alter table public.subscriptions add foreign key(order_id) references public.orders(id);
alter table public.legal_acceptances add foreign key(order_id) references public.orders(id);
create table public.payment_events (id text primary key,order_id uuid not null references public.orders(id),event_type text not null,created_at timestamptz not null default now());
create table public.invitation_outbox (order_id uuid primary key references public.orders(id),status text not null default 'pending' check(status in ('pending','completed')),created_at timestamptz not null default now(),completed_at timestamptz);
create table public.audit_events (id uuid primary key default gen_random_uuid(),actor_id uuid references public.profiles(id),action text not null,target_type text not null,target_id uuid,reason text,created_at timestamptz not null default now());
create index audit_events_date on public.audit_events(created_at desc,id);
create table public.privacy_requests (id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),kind text not null check(kind in ('export','deletion')),status text not null default 'pending' check(status in ('pending','processing','completed','rejected')),created_at timestamptz not null default now());
create unique index privacy_one_pending on public.privacy_requests(user_id,kind) where status in ('pending','processing');
create table public.help_feedback (user_id uuid not null references public.profiles(id),page text not null check(length(page) between 1 and 200),action text not null check(action in ('start','pause','skip','complete','rate')),rating boolean,updated_at timestamptz not null default now(),primary key(user_id,page));
create table public.rate_limits (actor_id uuid not null,bucket text not null,window_start timestamptz not null,count integer not null,primary key(actor_id,bucket,window_start));

-- Browser DML is deliberately closed: all reads and writes go through checked RPCs.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table public.%I enable row level security',t.tablename);
  execute format('revoke all on public.%I from public,anon,authenticated',t.tablename);
  execute format('grant all on public.%I to service_role',t.tablename);
 end loop;
end $$;

create function app_private.fail(p_message text default 'Operação não permitida.') returns void language plpgsql set search_path='' as $$ begin raise exception using message=p_message,errcode='P0001'; end $$;
create function app_private.actor(p_allow_aal1 boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid; p public.profiles; s public.app_sessions; idle interval;
begin
 if u is null then perform app_private.fail('Sessão inválida. Entre novamente.'); end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 select * into p from public.profiles where id=u;
 if not found or p.suspended then perform app_private.fail('Acesso indisponível.'); end if;
 if sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=u) then perform app_private.fail('Sessão inválida. Entre novamente.'); end if;
 idle:=case when p.role='member' then interval '2 hours' else interval '30 minutes' end;
 insert into public.app_sessions(id,user_id,expires_at) values(sid,u,now()+idle) on conflict(id) do nothing;
 select * into s from public.app_sessions where id=sid and user_id=u for update;
 if not found or s.revoked_at is not null or least(s.expires_at,s.last_activity_at+idle)<=now() then perform app_private.fail('Sessão expirada. Entre novamente.'); end if;
 if p.role<>'member' and not p_allow_aal1 and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then perform app_private.fail('Confirme o segundo fator para continuar.'); end if;
 return u;
end $$;
create function app_private.require_role(p_roles text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); begin
 if not exists(select 1 from public.profiles where id=u and role=any(p_roles)) then perform app_private.fail(); end if;return u;
end $$;
create function app_private.is_staff(p_actor uuid,p_roles text[]) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=p_actor and not suspended and role=any(p_roles)) $$;
create function app_private.entitled(p_actor uuid,p_mode text,p_plans uuid[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_actor and not suspended) and
 (p_mode='members' or exists(select 1 from public.subscriptions s join public.plans p on p.id=s.plan_id where s.user_id=p_actor and s.revoked_at is null and s.starts_at<=now() and s.ends_at>now() and (p_mode in ('subscribers','inherit') or (p_mode='plans' and s.plan_id=any(p_plans)))))
$$;
create function app_private.course_access(p_actor uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses c where c.id=p_id and ((app_private.is_staff(p_actor,array['admin','instructor'])) or (c.status='published' and app_private.entitled(p_actor,c.access_mode,c.plan_ids))))
$$;
create function app_private.lesson_access(p_actor uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lessons l join public.sections s on s.id=l.section_id join public.modules m on m.id=s.module_id join public.courses c on c.id=m.course_id where l.id=p_id and
 (app_private.is_staff(p_actor,array['admin','instructor']) or (l.status='published' and s.status='published' and m.status='published' and c.status='published' and
 (l.is_preview or (app_private.course_access(p_actor,c.id) and (m.access_mode='inherit' or app_private.entitled(p_actor,m.access_mode,m.plan_ids)))))))
$$;
create function app_private.folder_access(p_actor uuid,p_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare f public.material_folders; seen uuid[]:='{}'; current_id uuid:=p_id; begin
 if p_id is null then return true;end if;
 if app_private.is_staff(p_actor,array['admin','instructor']) then return true;end if;
 loop
  if current_id=any(seen) then return false;end if;seen:=array_append(seen,current_id);
  select * into f from public.material_folders where id=current_id;
  if not found or f.status<>'published' or not app_private.entitled(p_actor,f.access_mode,f.plan_ids) then return false;end if;
  current_id:=f.parent_id;exit when current_id is null;
 end loop;return true;
end $$;
create function app_private.material_access(p_actor uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.materials m where m.id=p_id and (app_private.is_staff(p_actor,array['admin','instructor']) or (m.status='published' and app_private.folder_access(p_actor,m.folder_id) and app_private.entitled(p_actor,m.access_mode,m.plan_ids) and (m.lesson_id is null or app_private.lesson_access(p_actor,m.lesson_id)))))
$$;
create function app_private.space_access(p_actor uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.spaces s where id=p_id and (app_private.is_staff(p_actor,array['admin','moderator']) or (status='published' and app_private.entitled(p_actor,access_mode,plan_ids)))) $$;
create function app_private.post_access(p_actor uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.posts p where p.id=p_id and app_private.space_access(p_actor,p.space_id) and (p.status='approved' or p.author_id=p_actor or app_private.is_staff(p_actor,array['admin','moderator']))) $$;
create function app_private.ticket_access(p_actor uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.tickets where id=p_id and (user_id=p_actor or app_private.is_staff(p_actor,array['admin','support']))) $$;
create function app_private.throttle(p_actor uuid,p_bucket text,p_limit integer) returns void language plpgsql security definer set search_path='' as $$
declare n integer;begin
 insert into public.rate_limits values(p_actor,p_bucket,date_trunc('minute',now()),1) on conflict(actor_id,bucket,window_start) do update set count=public.rate_limits.count+1 returning count into n;
 if n>p_limit then perform app_private.fail('Muitas solicitações. Aguarde um minuto.');end if;
end $$;
create function app_private.audit(p_actor uuid,p_action text,p_type text,p_id uuid,p_reason text default null) returns void language sql security definer set search_path='' as $$ insert into public.audit_events(actor_id,action,target_type,target_id,reason) values(p_actor,p_action,p_type,p_id,left(p_reason,2000)) $$;
create function app_private.consume_reauth(p_token text,p_actor uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 update public.reauth_nonces set consumed_at=now() where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and actor_id=p_actor and session_id=(auth.jwt()->>'session_id')::uuid and consumed_at is null and expires_at>now();
 if not found then perform app_private.fail('Confirmação expirada. Confirme sua senha novamente.');end if;
end $$;

create function app_private.auth_user_created() returns trigger language plpgsql security definer set search_path='' as $$
declare versions uuid[]; v uuid;begin
 -- confirmed/invited are set only by native Auth administration, never signup input.
 if new.email_confirmed_at is null and new.invited_at is null then
  if (select count(distinct kind) from public.legal_versions where published and not demo)<>2 then perform app_private.fail('Cadastro público indisponível.');end if;
  begin select array_agg(x::uuid) into versions from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'legal_version_ids','[]')) x;exception when others then perform app_private.fail('Aceite os termos atuais.');end;
  if (select count(distinct kind) from public.legal_versions where published and not demo and id=any(versions))<>2 then perform app_private.fail('Aceite os termos atuais.');end if;
 end if;
 insert into public.profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),160));
 foreach v in array coalesce(versions,'{}') loop insert into public.legal_acceptances(user_id,legal_version_id,marketing_opt_in) values(new.id,v,coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean,false));end loop;
 return new;
end $$;
create trigger app_user_created after insert on auth.users for each row execute function app_private.auth_user_created();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('icarus-private','icarus-private',false,52428800,array['application/pdf','image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','text/plain','application/zip']) on conflict(id) do nothing;
revoke all on all functions in schema app_private from public,anon,authenticated;
commit;
