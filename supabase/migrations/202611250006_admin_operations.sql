begin;

create function public.app_admin_commercial(
 p_entity text,p_query text default '',p_page integer default 1,p_role text default null,p_plan text default null,p_status text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=app_private.require_role(array['admin']); result jsonb; amount numeric; term text:=btrim(p_query);
begin
 if p_page is null or p_page not between 1 and 100000 or p_query is null or length(p_query)>200 then
  perform app_private.fail('Busca inválida.');
 end if;
 case p_entity
 when 'profiles' then
  if (p_role is not null and p_role not in ('admin','instructor','moderator','support','member','staff'))
     or (p_status is not null and p_status not in ('active','suspended'))
     or (p_plan is not null and p_plan<>'none' and p_plan !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') then
   perform app_private.fail('Filtros inválidos.');
  end if;
  with valid_subscriptions as (
   select user_id,plan_id from public.subscriptions where revoked_at is null and starts_at<=now() and ends_at>now()
  ), filtered as (
   select p.id,p.created_at,p.suspended,exists(select 1 from valid_subscriptions s where s.user_id=p.id) has_plan
   from public.profiles p join auth.users u on u.id=p.id
   where (p_role is null or p_role=p.role or (p_role='staff' and p.role<>'member'))
    and (p_status is null or p.suspended=(p_status='suspended'))
    and (p_plan is null or (p_plan='none' and not exists(select 1 from valid_subscriptions s where s.user_id=p.id))
      or exists(select 1 from valid_subscriptions s where s.user_id=p.id and s.plan_id::text=lower(p_plan)))
    and strpos(lower(concat_ws(' ',p.full_name,p.company->>'name',p.company->>'segment',u.email)),lower(term))>0
  ), rows as (
   select id,created_at from filtered order by created_at desc,id limit 20 offset (p_page-1)*20
  )
  select jsonb_build_object(
   'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',dto->'id','full_name',dto->'full_name','role',dto->'role','email',dto->'email',
    'suspended',dto->'suspended','company',dto->'company','plan_name',dto->'plan_name','access_ends_at',dto->'access_ends_at'
   ) order by r.created_at desc,r.id) from rows r cross join lateral (select app_private.profile_json(r.id) dto) p),'[]'::jsonb),
   'total',count(*),'metrics',jsonb_build_object('active',count(*) filter(where not suspended),
    'suspended',count(*) filter(where suspended),'with_plan',count(*) filter(where has_plan)),
   'plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id) from public.plans),'[]'::jsonb)
  ) into result from filtered;
 when 'plans' then
  with filtered as (
   select id,name,slug,price_cents,access_months,benefits,active,created_at
   from public.plans where strpos(lower(name),lower(term))>0
  ), rows as (
   select * from filtered order by created_at desc,id limit 20 offset (p_page-1)*20
  )
  select jsonb_build_object(
   'items',coalesce((select jsonb_agg(to_jsonb(r)-'created_at' order by r.created_at desc,r.id) from rows r),'[]'::jsonb),
   'total',count(*),'metrics',jsonb_build_object('active',count(*) filter(where active),'inactive',count(*) filter(where not active))
  ) into result from filtered;
 when 'orders' then
  if p_status is not null and p_status not in ('paid','pending','refunded','chargeback','expired','cancelled') then
   perform app_private.fail('Situação inválida.');
  end if;
  term:=btrim(regexp_replace(term,'^R[$][[:space:]]*','','i'));
  if term ~ '^([0-9]{1,10}|[0-9]{1,3}([.][0-9]{3}){1,3})(,[0-9]{1,2})?$' then
   amount:=replace(replace(term,'.',''),',','.')::numeric*100;
  end if;
  with filtered as (
   select id,amount_cents,method,status,created_at from public.orders
   where (p_status is null or status=p_status)
    and (term='' or strpos(id::text,lower(term))>0 or amount_cents=amount)
  ), rows as (
   select * from filtered order by created_at desc,id limit 20 offset (p_page-1)*20
  )
  select jsonb_build_object(
   'items',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from rows r),'[]'::jsonb),
   'total',count(*),'metrics',jsonb_build_object('paid',count(*) filter(where status='paid'),
    'pending',count(*) filter(where status='pending'),'revenue_cents',coalesce(sum(amount_cents) filter(where status='paid'),0))
  ) into result from filtered;
 else perform app_private.fail('Lista indisponível.');
 end case;
 return result||jsonb_build_object('page',p_page,'page_size',20);
end $$;

create function public.app_admin_ticket_queue(
 p_query text default '',p_status text default null,p_priority text default null,p_page integer default 1
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=app_private.require_role(array['admin','support']); result jsonb;
begin
 if p_page is null or p_page not between 1 and 100000 or p_query is null or length(p_query)>200
    or (p_status is not null and p_status not in ('open','in_progress','waiting_member','resolved'))
    or (p_priority is not null and p_priority not in ('low','normal','high','urgent')) then
  perform app_private.fail('Filtros inválidos.');
 end if;
 with base as (
  select t.id,t.status,t.created_at,t.user_id from public.tickets t
  where app_private.ticket_access(actor_id,t.id) and (p_priority is null or t.priority=p_priority)
   and strpos(lower(t.subject),lower(btrim(p_query)))>0
 ), filtered as (
  select id,created_at from base where p_status is null or status=p_status
 ), rows as (
  select id,created_at from filtered order by created_at desc,id limit 20 offset (p_page-1)*20
 ), counts as (
  select status,count(*) total from base group by status
 ), responses as (
  select avg(extract(epoch from r.first_at-t.created_at)) seconds from base t cross join lateral (
   select min(m.created_at) first_at from public.ticket_messages m
   where m.ticket_id=t.id and m.author_id<>t.user_id and m.created_at>=t.created_at
  ) r
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(app_private.ticket_json(actor_id,r.id) order by r.created_at desc,r.id) from rows r),'[]'::jsonb),
  'total',(select count(*) from filtered),'page',p_page,'page_size',20,
  'counts',coalesce((select jsonb_object_agg(status,total) from counts),'{}'::jsonb),
  'first_response_seconds',(select round(seconds) from responses)) into result;
 return result;
end $$;

create function public.app_admin_lesson_comment_queue(p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=app_private.require_role(array['admin','moderator']); result jsonb;
begin
 if p_page is null or p_page not between 1 and 100000 then perform app_private.fail('Página inválida.'); end if;
 with pending as (
  select c.id,c.lesson_id,c.body,c.created_at,p.full_name author_name,l.title lesson_title,
   course.title course_title,course.slug course_slug
  from public.lesson_comments c join public.profiles p on p.id=c.author_id
  join public.lessons l on l.id=c.lesson_id join public.sections s on s.id=l.section_id
  join public.modules m on m.id=s.module_id join public.courses course on course.id=m.course_id
  where c.status='pending' and app_private.lesson_access(actor_id,c.lesson_id)
 ), rows as (
  select * from pending order by created_at,id limit 20 offset (p_page-1)*20
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id) from rows r),'[]'::jsonb),
  'total',(select count(*) from pending),'page',p_page,'page_size',20) into result;
 return result;
end $$;

alter table public.podcast_episodes drop constraint podcast_episodes_status_check;
alter table public.podcast_episodes add check (status in ('draft','published','archived'));

create or replace function public.app_admin_save_podcast(
  p_id uuid, p_youtube_id text, p_kind text, p_title text, p_description text,
  p_published_at timestamptz, p_status text, p_is_featured boolean,
  p_chapters jsonb, p_spotify_url text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := app_private.actor();
  chapter jsonb;
  chapter_seconds integer;
  previous_seconds integer := -1;
  saved_id uuid;
  conflict_name text;
begin
  perform app_private.podcast_write_lock(actor_id);
  perform app_private.podcast_admin(actor_id);
  if p_youtube_id is null or p_youtube_id !~ '^[A-Za-z0-9_-]{11}$' then
    perform app_private.fail('Informe um vídeo válido do YouTube.');
  end if;
  if p_kind is null or p_kind not in ('podcast', 'masterclass')
     or p_title is null or length(btrim(p_title)) not between 1 and 160
     or p_description is null or length(p_description) > 5000
     or p_published_at is null or not isfinite(p_published_at)
     or p_published_at < '1900-01-01'::timestamptz or p_published_at >= '2101-01-01'::timestamptz
     or p_status is null or p_status not in ('draft', 'published')
     or p_is_featured is null or (p_is_featured and p_status <> 'published') then
    perform app_private.fail('Confira os dados do episódio. Somente episódios publicados podem ficar em destaque.');
  end if;
  if p_spotify_url is not null and p_spotify_url !~ '^https://open[.]spotify[.]com/episode/[A-Za-z0-9]{22}$' then
    perform app_private.fail('Informe o link de um episódio em open.spotify.com.');
  end if;
  if jsonb_typeof(p_chapters) is distinct from 'array' then
    perform app_private.fail('Informe capítulos válidos.');
  end if;
  if jsonb_array_length(p_chapters) > 40 then
    perform app_private.fail('Informe até 40 capítulos.');
  end if;
  for chapter in select value from jsonb_array_elements(p_chapters) loop
    if jsonb_typeof(chapter) <> 'object'
       or jsonb_typeof(chapter->'seconds') is distinct from 'number'
       or jsonb_typeof(chapter->'title') is distinct from 'string'
       or chapter - array['seconds', 'title'] <> '{}'::jsonb
       or chapter->>'seconds' !~ '^[0-9]{1,5}$'
       or length(btrim(chapter->>'title')) not between 1 and 160 then
      perform app_private.fail('Informe capítulos válidos.');
    end if;
    chapter_seconds := (chapter->>'seconds')::integer;
    if chapter_seconds <= previous_seconds or chapter_seconds > 86399 then
      perform app_private.fail('Informe capítulos em ordem crescente até 23:59:59.');
    end if;
    previous_seconds := chapter_seconds;
  end loop;

  perform app_private.throttle(actor_id, 'podcast_save', 20);
  -- Serializa a troca do destaque com outras edições e evita dois episódios fixados.
  perform pg_advisory_xact_lock(20261123, 22);
  if p_id is not null and not exists (
    select 1 from public.podcast_episodes where id = p_id and youtube_id = p_youtube_id
  ) then
    perform app_private.fail('Episódio indisponível ou vídeo alterado. Cadastre outro episódio para usar um novo vídeo.');
  end if;
  if exists (select 1 from public.podcast_episodes where id=p_id and status='archived') then
    perform app_private.fail('Restaure o episódio antes de editar.');
  end if;
  if p_is_featured then
    update public.podcast_episodes set is_featured = false where is_featured and id is distinct from p_id;
  end if;

  if p_id is null then
    insert into public.podcast_episodes (youtube_id, kind, title, description, published_at, status, is_featured, chapters, spotify_url)
    values (p_youtube_id, p_kind, btrim(p_title), p_description, p_published_at, p_status, p_is_featured, p_chapters, p_spotify_url)
    returning id into saved_id;
  else
    update public.podcast_episodes set kind = p_kind, title = btrim(p_title), description = p_description,
      published_at = p_published_at, status = p_status, is_featured = p_is_featured, chapters = p_chapters, spotify_url = p_spotify_url
    where id = p_id returning id into saved_id;
  end if;
  perform app_private.audit(actor_id, case when p_id is null then 'create' else 'update' end, 'podcast_episodes', saved_id);
  return jsonb_build_object('id', saved_id);
exception when unique_violation then
  get stacked diagnostics conflict_name = CONSTRAINT_NAME;
  if conflict_name <> 'podcast_episodes_youtube_id_key' then raise; end if;
  perform app_private.fail('Este vídeo já está cadastrado.');
  return null;
end $$;

create function public.app_admin_archive_podcast(p_id uuid,p_archived boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=app_private.actor(); current_status text;
begin
 perform app_private.podcast_write_lock(actor_id);
 perform app_private.podcast_admin(actor_id);
 if p_archived is null then perform app_private.fail('Situação inválida.'); end if;
 perform pg_advisory_xact_lock(20261123,22);
 select status into current_status from public.podcast_episodes where id=p_id for update;
 if not found then perform app_private.fail('Episódio indisponível.'); end if;
 if (current_status='archived')<>p_archived then
  current_status:=case when p_archived then 'archived' else 'draft' end;
  update public.podcast_episodes set status=current_status,is_featured=false where id=p_id;
  perform app_private.audit(actor_id,case when p_archived then 'archive' else 'restore' end,'podcast_episodes',p_id);
 end if;
 return jsonb_build_object('id',p_id,'status',current_status);
end $$;

create function public.app_admin_audit(p_query text default '',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare admin_id uuid:=app_private.require_role(array['admin']); result jsonb;
begin
 if p_page is null or p_page not between 1 and 100000 or p_query is null or length(p_query)>200 then
  perform app_private.fail('Busca inválida.');
 end if;
 with described as (
  select e.id,e.created_at,e.actor_id,a.full_name actor_name,e.target_id,e.target_type,e.reason,
   case e.action
    when 'create' then 'Criação' when 'update' then 'Edição' when 'archive' then 'Arquivamento'
    when 'restore' then 'Restauração' when 'save' then 'Salvamento' when 'remove' then 'Remoção'
    when 'enable' then 'Ativação' when 'disable' then 'Desativação' when 'resubmit' then 'Reenvio para revisão'
    when 'member-change' then 'Alteração de acesso' when 'password-setup-complete' then 'Definição de senha'
    when 'moderate:approve' then 'Aprovação' when 'moderate:approved' then 'Aprovação'
    when 'moderate:reject' then 'Rejeição' when 'moderate:rejected' then 'Rejeição'
    when 'moderate:hide' then 'Ocultação' when 'moderate:remove' then 'Remoção pela moderação'
    when 'moderate:resolved' then 'Denúncia tratada' when 'moderate:dismissed' then 'Denúncia improcedente'
    when 'reply:open' then 'Resposta a chamado aberto' when 'reply:in_progress' then 'Resposta em atendimento'
    when 'reply:waiting_member' then 'Resposta aguardando o membro' when 'reply:resolved' then 'Chamado resolvido'
    when 'reply:closed' then 'Chamado encerrado' when 'reply:pending' then 'Resposta a chamado pendente'
    when 'privacy:processing' then 'Solicitação em análise' when 'privacy:completed' then 'Solicitação concluída'
    when 'privacy:rejected' then 'Solicitação recusada' when 'feedback.status' then 'Alteração da situação do feedback'
    when 'catalog_launch_create' then 'Criação de lançamento'
    when 'payment:paid' then 'Pagamento confirmado' when 'payment:refunded' then 'Pagamento estornado'
    when 'payment:chargeback' then 'Pagamento contestado' when 'payment:expired' then 'Pagamento expirado'
    when 'payment:cancelled' then 'Pagamento cancelado'
    else case split_part(e.action,':',1)
     when 'payment' then 'Evento de pagamento' when 'invite' then 'Evento de convite' when 'reply' then 'Resposta a chamado'
     else case when e.action like 'catalog_launch_%' then 'Alteração de lançamento' else 'Ação registrada' end
    end
   end action_label,
   case e.target_type
    when 'profiles' then 'Membro' when 'plans' then 'Plano' when 'orders' then 'Pedido'
    when 'courses' then 'Curso' when 'modules' then 'Módulo' when 'sections' then 'Seção' when 'lessons' then 'Aula'
    when 'course_signature' then 'Assinatura do curso' when 'lesson_presentation' then 'Apresentação da aula'
    when 'material_folders' then 'Pasta de materiais' when 'materials' then 'Material'
    when 'spaces' then 'Espaço da comunidade' when 'post' then 'Publicação' when 'posts' then 'Publicação'
    when 'reply' then 'Resposta' when 'report' then 'Denúncia' when 'tickets' then 'Chamado'
    when 'lesson_comment' then 'Comentário de aula' when 'live_events' then 'Encontro'
    when 'podcast_episodes' then 'Episódio' when 'feedback' then 'Feedback' when 'privacy_request' then 'Solicitação de privacidade'
    when 'legal_versions' then 'Documento legal' when 'onboarding' then 'Onboarding'
    when 'onboarding_questions' then 'Pergunta do onboarding' when 'installation_brand' then 'Marca da instalação'
    when 'catalog_launch' then 'Lançamento'
    when 'module_community' then 'Módulo Comunidade' when 'module_materials' then 'Módulo Materiais'
    when 'module_podcasts' then 'Módulo Podcasts' when 'module_ranking' then 'Módulo Ranking'
    when 'module_live_events' then 'Módulo Encontros' when 'module_support' then 'Módulo Suporte'
    when 'module_help' then 'Módulo Central de ajuda' when 'module_feedback' then 'Módulo Feedback'
    else 'Registro administrativo'
   end target_label,
   coalesce(nullif(member.full_name,''),plan.name,course.title,module.title,section.title,lesson.title,
    folder.name,material.name,space.name,post.title,reply_post.title,ticket.subject,meeting.title,episode.title,
    legal.title,question.label,left(comment.body,100),left(feedback.body,100),launch.title) target_name,
   coalesce(case when member.id is not null then '/admin/membros/'||member.id end,
    case when course.id is not null then '/admin/cursos/'||course.id end,
    case when module.id is not null then '/admin/cursos/'||module.course_id||'?aba=estrutura' end,
    case when post.id is not null then '/admin/comunidade/'||post.id end,
    case when reply_post.id is not null then '/admin/comunidade/'||reply_post.id end,
    case when ticket.id is not null then '/admin/suporte/'||ticket.id end,
    case when meeting.id is not null then '/admin/encontros' end,
    case when episode.id is not null then '/admin/podcasts/'||episode.id end,
    case when e.target_type='orders' then '/admin/pedidos/'||e.target_id end
   ) target_path
  from public.audit_events e
  left join public.profiles a on a.id=e.actor_id
  left join public.profiles member on e.target_type='profiles' and member.id=e.target_id
  left join public.plans plan on e.target_type='plans' and plan.id=e.target_id
  left join public.courses course on e.target_type in ('courses','course_signature') and course.id=e.target_id
  left join public.modules module on e.target_type='modules' and module.id=e.target_id
  left join public.sections section on e.target_type='sections' and section.id=e.target_id
  left join public.lessons lesson on e.target_type in ('lessons','lesson_presentation') and lesson.id=e.target_id
  left join public.material_folders folder on e.target_type='material_folders' and folder.id=e.target_id
  left join public.materials material on e.target_type='materials' and material.id=e.target_id
  left join public.spaces space on e.target_type='spaces' and space.id=e.target_id
  left join public.posts post on e.target_type in ('post','posts') and post.id=e.target_id
  left join public.reports report on e.target_type='report' and report.id=e.target_id
  left join public.replies reply on reply.id=case e.target_type when 'reply' then e.target_id when 'report' then report.reply_id end
  left join public.posts reply_post on reply_post.id=coalesce(reply.post_id,report.post_id)
  left join public.tickets ticket on e.target_type='tickets' and ticket.id=e.target_id
  left join public.live_events meeting on e.target_type='live_events' and meeting.id=e.target_id
  left join public.podcast_episodes episode on e.target_type='podcast_episodes' and episode.id=e.target_id
  left join public.legal_versions legal on e.target_type='legal_versions' and legal.id=e.target_id
  left join public.onboarding_questions question on e.target_type='onboarding_questions' and question.id=e.target_id
  left join public.lesson_comments comment on e.target_type='lesson_comment' and comment.id=e.target_id
  left join public.feedbacks feedback on e.target_type='feedback' and feedback.id=e.target_id
  left join app_private.catalog_launches launch on launch.id=e.target_id and e.action like 'catalog_launch_%'
 ), filtered as (
  select * from described where strpos(lower(concat_ws(' ',actor_name,action_label,target_name,target_label,reason,target_id,actor_id)),lower(btrim(p_query)))>0
 ), rows as (
  select * from filtered order by created_at desc,id limit 20 offset (p_page-1)*20
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from rows r),'[]'::jsonb),
  'total',(select count(*) from filtered),'page',p_page,'page_size',20) into result;
 return result;
end $$;

create function public.app_admin_moderation_queue(
 p_entity text,p_query text default '',p_status text default null,p_page integer default 1
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=app_private.require_role(array['admin','moderator']); result jsonb;
begin
 if p_entity is null or p_entity not in ('posts','replies') or p_page is null or p_page not between 1 and 100000
    or p_query is null or length(p_query)>200 or (p_status is not null and p_status<>'pending') then
  perform app_private.fail('Filtros inválidos.');
 end if;
 with base as (
  select p.id,p.status,p.created_at from public.posts p join public.profiles a on a.id=p.author_id
  where p_entity='posts' and strpos(lower(concat_ws(' ',p.title,p.body,a.full_name)),lower(btrim(p_query)))>0
  union all
  select r.id,r.status,r.created_at from public.replies r join public.profiles a on a.id=r.author_id
  where p_entity='replies' and strpos(lower(concat_ws(' ',r.body,a.full_name)),lower(btrim(p_query)))>0
 ), filtered as (
  select id,created_at from base where p_status is null or status=p_status
 ), rows as (
  select * from filtered order by created_at desc,id limit 20 offset (p_page-1)*20
 )
 select jsonb_build_object('items',(select coalesce(jsonb_agg(
  case p_entity when 'posts' then app_private.post_json(actor_id,r.id) else app_private.reply_json(actor_id,r.id) end
  order by r.created_at desc,r.id),'[]'::jsonb) from rows r),
  'total',(select count(*) from filtered),'pending',(select count(*) from base where status='pending'),
  'page',p_page,'page_size',20) into result;
 return result;
end $$;

create or replace function public.app_admin_feedbacks(p_kind text default null,p_status text default null,p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform app_private.feedback_admin();
 if (p_kind is not null and p_kind not in ('suggestion','bug','other')) or
  (p_status is not null and p_status not in ('new','reviewing','planned','done')) or
  p_page is null or p_page not between 1 and 100000 then perform app_private.fail('Filtros inválidos.'); end if;
 with by_kind as (
  select id,status,created_at from public.feedbacks
  where p_kind is null or kind=p_kind
 ), filtered as (
  select * from by_kind where p_status is null or status=p_status
 ), current_page as (
  select id from filtered order by created_at desc,id desc limit 20 offset (p_page-1)*20
 )
 select jsonb_build_object('page',p_page,'page_size',20,'total',(select count(*) from filtered),
  'counts',coalesce((select jsonb_object_agg(status,n) from (select status,count(*) n from by_kind group by status) counts),'{}'::jsonb),
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'kind',f.kind,'status',f.status,
   'excerpt',left(f.body,240),'author_name',p.full_name,'created_at',f.created_at,'page_path',f.page_path,
   'has_screenshot',f.screenshot_id is not null) order by f.created_at desc,f.id desc)
   from current_page c join public.feedbacks f on f.id=c.id join public.profiles p on p.id=f.author_id),'[]'::jsonb))
 into result;
 return result;
end $$;

create function public.app_admin_lesson_context(p_course_id uuid,p_lesson_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=app_private.require_role(array['admin','instructor']); result jsonb;
begin
 select jsonb_build_object('course_title',c.title,'module_title',m.title,'lesson_title',l.title) into result
 from public.lessons l join public.sections s on s.id=l.section_id
 join public.modules m on m.id=s.module_id join public.courses c on c.id=m.course_id
 where c.id=p_course_id and l.id=p_lesson_id;
 if result is null then perform app_private.fail('Aula indisponível neste curso.'); end if;
 return result;
end $$;

revoke execute on function public.app_admin_commercial(text,text,integer,text,text,text),
 public.app_admin_ticket_queue(text,text,text,integer),public.app_admin_lesson_comment_queue(integer),
 public.app_admin_archive_podcast(uuid,boolean),public.app_admin_audit(text,integer),
 public.app_admin_save_podcast(uuid,text,text,text,text,timestamptz,text,boolean,jsonb,text),
 public.app_admin_lesson_context(uuid,uuid),public.app_admin_moderation_queue(text,text,text,integer),public.app_admin_feedbacks(text,text,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.app_admin_commercial(text,text,integer,text,text,text),
 public.app_admin_ticket_queue(text,text,text,integer),public.app_admin_lesson_comment_queue(integer),
 public.app_admin_archive_podcast(uuid,boolean),public.app_admin_audit(text,integer),
 public.app_admin_save_podcast(uuid,text,text,text,text,timestamptz,text,boolean,jsonb,text),
 public.app_admin_lesson_context(uuid,uuid),public.app_admin_moderation_queue(text,text,text,integer),public.app_admin_feedbacks(text,text,integer) to authenticated;

notify pgrst,'reload schema';
commit;
