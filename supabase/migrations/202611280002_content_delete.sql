begin;
-- 2.13.0: exclusão definitiva de aula, seção, módulo, material e pasta; arquivar deixa de pedir senha.

-- O que cai junto com o item. A pasta entra com as subpastas; órfãos são materiais cujas aulas serão todas apagadas.
create function app_private.delete_scope(p_entity text,p_id uuid,out section_ids uuid[],out lesson_ids uuid[],out folder_ids uuid[],out material_ids uuid[],out orphan_ids uuid[])
language sql stable set search_path='' as $$
 with recursive f(id) as (
  select p_id where p_entity='material_folders'
  union select x.id from public.material_folders x join f on x.parent_id=f.id
 ), s(id) as (
  select id from public.sections where (p_entity='sections' and id=p_id) or (p_entity='modules' and module_id=p_id)
 ), l(id) as (
  select id from public.lessons where (p_entity='lessons' and id=p_id) or section_id in (select id from s)
 )
 select array(select id from s),array(select id from l),array(select id from f),
  array(select id from public.materials where (p_entity='materials' and id=p_id) or folder_id in (select id from f)),
  array(select distinct ml.material_id from public.material_lessons ml where ml.lesson_id in (select id from l)
   and not exists(select 1 from public.material_lessons o where o.material_id=ml.material_id and o.lesson_id not in (select id from l)))
$$;
revoke execute on function app_private.delete_scope(text,uuid) from public, anon, authenticated, service_role;

create function public.app_admin_delete_preview(p_entity text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s record;present boolean;begin
 if p_entity is null or p_entity not in ('lessons','sections','modules','materials','material_folders') then perform app_private.fail('Esta entidade não pode ser excluída.');end if;
 perform app_private.require_role(app_private.entity_roles(p_entity));
 execute format('select exists(select 1 from public.%I where id=$1)',p_entity) into present using p_id;
 if not present then perform app_private.fail('Registro indisponível.');end if;
 select * into s from app_private.delete_scope(p_entity,p_id);
 -- A seção automática não aparece no painel; a exclusão a apaga, mas o resumo não a conta.
 return jsonb_build_object('sections',(select count(*) from public.sections where id=any(s.section_ids) and not is_default),'lessons',cardinality(s.lesson_ids),'materials',cardinality(s.material_ids),
  'folders',cardinality(array_remove(s.folder_ids,p_id)),
  'students',(select count(distinct user_id) from public.lesson_progress where lesson_id=any(s.lesson_ids)),
  'comments',(select count(*) from public.lesson_comments where lesson_id=any(s.lesson_ids)),
  'linked_materials',(select count(distinct material_id) from public.material_lessons where material_id=any(s.material_ids)),
  'orphaned_materials',cardinality(s.orphan_ids));
end $$;

-- Chamada pela Edge upload, que apaga do Storage os caminhos devolvidos.
create function public.app_admin_delete(p_actor_id uuid,p_entity text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare item_name text;s record;paths text[];begin
 if p_entity is null or p_entity not in ('lessons','sections','modules','materials','material_folders') then perform app_private.fail('Esta entidade não pode ser excluída.');end if;
 perform app_private.service_actor(p_actor_id);
 if not app_private.is_staff(p_actor_id,app_private.entity_roles(p_entity)) then perform app_private.fail();end if;
 perform app_private.throttle(p_actor_id,'content_delete',20);
 -- Trava o item antes de juntar o que está abaixo dele: quem cria um filho ao mesmo tempo espera e depois falha na chave estrangeira.
 execute format('select %I from public.%I where id=$1 for update',case when p_entity in ('materials','material_folders') then 'name' else 'title' end,p_entity) into item_name using p_id;
 if item_name is null then perform app_private.fail('Registro indisponível.');end if;
 select * into s from app_private.delete_scope(p_entity,p_id);
 perform 1 from public.sections where id=any(s.section_ids) for update;
 perform 1 from public.lessons where id=any(s.lesson_ids) for update;
 perform 1 from public.material_folders where id=any(s.folder_ids) for update;
 perform 1 from public.materials where id=any(s.material_ids) for update;
 paths:=array(select p from (
  select storage_path from public.lessons where id=any(s.lesson_ids)
  union select storage_path from public.materials where id=any(s.material_ids)
  union select path from public.uploads where lesson_id=any(s.lesson_ids) or material_id=any(s.material_ids)
 ) x(p) where p is not null order by p);
 -- Sem chave estrangeira: aviso de comentário aprovado e pontos de ranking da aula.
 delete from public.notifications where event_key='lesson_comment_approved' and source_id in (select id from public.lesson_comments where lesson_id=any(s.lesson_ids));
 delete from app_private.ranking_events where kind='lesson' and source_id=any(s.lesson_ids);
 delete from public.lesson_comments where lesson_id=any(s.lesson_ids);
 delete from public.lesson_checklist_items where lesson_id=any(s.lesson_ids);
 delete from public.lesson_presentations where lesson_id=any(s.lesson_ids);
 delete from public.lesson_progress where lesson_id=any(s.lesson_ids);
 delete from public.lesson_favorites where lesson_id=any(s.lesson_ids);
 delete from public.lesson_notes where lesson_id=any(s.lesson_ids);
 delete from public.uploads where lesson_id=any(s.lesson_ids) or material_id=any(s.material_ids);
 -- material_lessons sai em cascata com aulas e materiais.
 delete from public.lessons where id=any(s.lesson_ids);
 delete from public.sections where id=any(s.section_ids);
 -- O aviso de lançamento também aponta para o lançamento sem chave estrangeira.
 delete from public.notifications where event_key='catalog_launch' and source_id in (select id from app_private.catalog_launches where p_entity='modules' and module_id=p_id);
 delete from app_private.catalog_launch_signups where launch_id in (select id from app_private.catalog_launches where p_entity='modules' and module_id=p_id);
 delete from app_private.catalog_launches where p_entity='modules' and module_id=p_id;
 delete from public.modules where p_entity='modules' and id=p_id;
 delete from public.materials where id=any(s.material_ids);
 delete from public.material_folders where id=any(s.folder_ids);
 -- Sem subir curriculum_version, para ninguém ganhar segundo certificado; a ordem fica igual à do refresh_curriculum.
 update public.courses set required_lesson_ids=array(select x from unnest(required_lesson_ids) with ordinality u(x,n) where x<>all(s.lesson_ids) order by n)
  where required_lesson_ids&&s.lesson_ids;
 -- Como no desvínculo: sem aula, volta para rascunho; arquivado continua arquivado e restaura como rascunho.
 update public.materials set status=case when status='archived' then status else 'draft' end,previous_status=case when status='archived' then 'draft' else previous_status end
  where id=any(s.orphan_ids) and not exists(select 1 from public.material_lessons ml where ml.material_id=materials.id);
 perform app_private.audit(p_actor_id,'delete',p_entity,p_id,item_name);
 return jsonb_build_object('id',p_id,'paths',to_jsonb(paths));
end $$;
revoke execute on function public.app_admin_delete_preview(text,uuid),public.app_admin_delete(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.app_admin_delete_preview(text,uuid) to authenticated;
grant execute on function public.app_admin_delete(uuid,text,uuid) to service_role;

-- Arquivar e restaurar deixam de pedir senha (decisão de Tibério); ficam papel, limite por minuto e auditoria.
drop function public.app_admin_archive(text,uuid,boolean,text);
create function public.app_admin_archive(p_entity text,p_id uuid,p_archived boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.require_role(app_private.entity_roles(p_entity));begin
 perform app_private.throttle(u,'archive',30);
 case p_entity
 when 'courses' then update public.courses set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'modules' then update public.modules set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'sections' then update public.sections set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'lessons' then update public.lessons set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'material_folders' then update public.material_folders set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'materials' then update public.materials set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'spaces' then update public.spaces set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'posts' then
  if p_archived is null then perform app_private.fail('Operação inválida.');end if;
  update public.posts set archived_by=case when p_archived then u end,archive_source=case when p_archived then 'admin' end,previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 when 'replies' then update public.replies set previous_status=case when p_archived and status<>'archived' then status else previous_status end,status=case when p_archived then 'archived' when status='archived' then coalesce(previous_status,'draft') else status end where id=p_id;
 else perform app_private.fail('Esta entidade não pode ser arquivada.');end case;
 if not found then perform app_private.fail('Registro indisponível.');end if;
 perform app_private.audit(u,case when p_archived then 'archive' else 'restore' end,p_entity,p_id);
 return jsonb_build_object('id',p_id,'archived',p_archived);
end $$;
revoke execute on function public.app_admin_archive(text,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.app_admin_archive(text,uuid,boolean) to authenticated;

-- Mesma definição de 202611250007_admin_security_review.sql, com os rótulos de exclusão e desvínculo.
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
    when 'delete' then 'Exclusão definitiva' when 'unlink' then 'Material desvinculado da aula'
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
revoke execute on function public.app_admin_audit(text,integer) from public, anon, authenticated, service_role;
grant execute on function public.app_admin_audit(text,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
