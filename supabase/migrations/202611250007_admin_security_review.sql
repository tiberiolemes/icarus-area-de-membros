begin;

create or replace function public.app_admin_lesson_comment_queue(p_page integer default 1)
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
  where c.status='pending'
 ), rows as (
  select * from pending order by created_at,id limit 20 offset (p_page-1)*20
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('can_open_lesson',app_private.lesson_access(actor_id,r.lesson_id)) order by r.created_at,r.id) from rows r),'[]'::jsonb),
  'total',(select count(*) from pending),'page',p_page,'page_size',20) into result;
 return result;
end $$;

create or replace function public.app_moderate_lesson_comment(
 p_lesson_id uuid,p_id uuid,p_decision text,p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := app_private.require_role(array['admin','moderator']);
 next_status text := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' end;
 current_status text;
 decision_reason text;
begin
 if next_status is null then perform app_private.fail('Decisão inválida.'); end if;
 decision_reason := app_private.trim_lesson_engagement_text(p_reason);
 if decision_reason is null or length(decision_reason)<3 or length(p_reason)>2000 then
  perform app_private.fail('Informe o motivo da decisão.');
 end if;
 perform app_private.lock_lesson_engagement_actor(actor_id);
 select c.status into current_status from public.lesson_comments c
  where c.id=p_id and c.lesson_id=p_lesson_id for update;
 if not found then perform app_private.fail('Comentário indisponível.'); end if;
 if current_status='pending' then
  update public.lesson_comments set status=next_status where id=p_id and lesson_id=p_lesson_id;
  insert into public.moderation_events(actor_id,target_type,target_id,decision,reason)
   values (actor_id,'lesson_comment',p_id,p_decision,decision_reason);
  perform app_private.audit(actor_id,'moderate:'||p_decision,'lesson_comment',p_id,decision_reason);
 elsif current_status<>next_status then
  perform app_private.fail('Este comentário já foi revisado.');
 end if;
 return jsonb_build_object('id',p_id,'status',next_status);
end $$;

create function public.app_admin_log_csv_export(
 p_entity text,p_query text default '',p_role text default null,p_plan text default null,p_status text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=app_private.require_role(array['admin']);
begin
 if p_entity is null or p_entity not in ('profiles','orders') or p_query is null or length(p_query)>200
    or (p_entity='profiles' and (
     (p_role is not null and p_role not in ('admin','instructor','moderator','support','member','staff'))
     or (p_plan is not null and p_plan<>'none' and p_plan !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
     or (p_status is not null and p_status not in ('active','suspended'))))
    or (p_entity='orders' and (p_role is not null or p_plan is not null
     or (p_status is not null and p_status not in ('paid','pending','refunded','chargeback','expired','cancelled')))) then
  perform app_private.fail('Filtros de exportação inválidos.');
 end if;
 perform app_private.audit(actor_id,'export:csv',
  case p_entity when 'profiles' then 'member_csv' else 'order_csv' end,null,
  jsonb_strip_nulls(jsonb_build_object('busca',p_query,'papel',p_role,'plano',p_plan,'situacao',p_status))::text);
end $$;

create or replace function public.app_admin_audit(p_query text default '',p_page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare admin_id uuid:=app_private.require_role(array['admin']); term text:=btrim(p_query); result jsonb;
begin
 if p_page is null or p_page not between 1 and 100000 or p_query is null or length(p_query)>200 then
  perform app_private.fail('Busca inválida.');
 end if;
 with source_events as (
  (select id,created_at,actor_id,target_id,target_type,reason,action
   from public.audit_events where term=''
   order by created_at desc,id limit 20 offset (p_page-1)*20)
  union all
  select id,created_at,actor_id,target_id,target_type,reason,action
  from public.audit_events where term<>''
 ), described as (
  select e.id,e.created_at,e.actor_id,a.full_name actor_name,e.target_id,e.target_type,e.reason,
   case e.action
    when 'export:csv' then 'Exportação CSV'
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
    when 'member_csv' then 'Membros' when 'order_csv' then 'Pedidos'
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
  from source_events e
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
  select * from described where term='' or strpos(lower(concat_ws(' ',actor_name,action_label,target_name,target_label,reason,target_id,actor_id)),lower(term))>0
 ), rows as (
  select * from filtered order by created_at desc,id limit 20 offset (case when term='' then 0 else (p_page-1)*20 end)
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from rows r),'[]'::jsonb),
  'total',case when term='' then (select count(*) from public.audit_events) else (select count(*) from filtered) end,'page',p_page,'page_size',20) into result;
 return result;
end $$;

revoke execute on function public.app_admin_lesson_comment_queue(integer),
 public.app_moderate_lesson_comment(uuid,uuid,text,text),
 public.app_admin_log_csv_export(text,text,text,text,text),public.app_admin_audit(text,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.app_admin_lesson_comment_queue(integer),
 public.app_moderate_lesson_comment(uuid,uuid,text,text),
 public.app_admin_log_csv_export(text,text,text,text,text),public.app_admin_audit(text,integer)
 to authenticated;

notify pgrst,'reload schema';
commit;
