begin;

-- Seção automática: guarda as aulas postas direto no módulo, sem cabeçalho para aluno ou equipe.
-- Ela fica sempre publicada, fora do bônus e na posição -1, antes de qualquer seção criada pela equipe.
alter table public.sections add column is_default boolean not null default false;
alter table public.sections drop constraint sections_order_index_check;
alter table public.sections add constraint sections_order_index_check
 check (case when is_default then order_index=-1 and status='published' and not is_bonus else order_index>=0 end);
create unique index sections_one_default on public.sections(module_id) where is_default;

create function public.app_admin_default_section(p_module_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid:=app_private.require_role(app_private.entity_roles('modules'));
 module_status text;
 section_id uuid;
begin
 -- Trava o módulo para duas chamadas simultâneas não disputarem a criação.
 select status into module_status from public.modules where id=p_module_id for update;
 if not found then perform app_private.fail('Registro indisponível.');end if;
 if module_status='archived' then perform app_private.fail('Restaure o módulo antes de adicionar aulas.');end if;
 select id into section_id from public.sections where module_id=p_module_id and is_default;
 if found then return section_id;end if;
 perform app_private.throttle(actor_id,'default_section',30);
 insert into public.sections(module_id,title,order_index,status,is_default)
 values(p_module_id,'Aulas do módulo',-1,'published',true) returning id into section_id;
 perform app_private.audit(actor_id,'create','sections',section_id);
 return section_id;
end $$;
revoke execute on function public.app_admin_default_section(uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_admin_default_section(uuid) to authenticated;

-- Mesma definição de 202611230002_learning.sql, agora com a marca da seção automática.
create or replace function public.app_course(p_slug text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();c public.courses;staff boolean:=app_private.is_staff(u,array['admin','instructor']);begin
 select * into c from public.courses where slug=p_slug and (status='published' or staff);
 if not found then perform app_private.fail('Curso indisponível.');end if;
 return jsonb_build_object('course',app_private.course_json(u,c.id),'modules',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'slug',m.slug,'title',m.title,'order_index',m.order_index,'can_access',app_private.course_access(u,c.id) and (m.access_mode='inherit' or app_private.entitled(u,m.access_mode,m.plan_ids)),'sections',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'order_index',s.order_index,'is_bonus',s.is_bonus,'is_default',s.is_default,'lessons',coalesce((select jsonb_agg(app_private.lesson_summary(u,l.id) order by l.order_index,l.id) from public.lessons l where l.section_id=s.id and (l.status='published' or staff)),'[]'::jsonb)) order by s.order_index,s.id) from public.sections s where s.module_id=m.id and (s.status='published' or staff)),'[]'::jsonb)) order by m.order_index,m.id) from public.modules m where m.course_id=c.id and (m.status='published' or staff)),'[]'::jsonb));
end $$;
revoke execute on function public.app_course(text) from public,anon;grant execute on function public.app_course(text) to authenticated;

notify pgrst, 'reload schema';
commit;
