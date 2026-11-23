begin;
create function app_private.refresh_curriculum(p_course uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.courses;ids uuid[];begin
 select * into c from public.courses where id=p_course for update;
 if not found then return;end if;
 select coalesce(array_agg(l.id order by m.order_index,m.id,s.order_index,s.id,l.order_index,l.id),'{}') into ids from public.lessons l join public.sections s on s.id=l.section_id join public.modules m on m.id=s.module_id where m.course_id=c.id and l.is_required and not s.is_bonus and
 ((l.status='published' and s.status='published' and m.status='published') or (l.id=any(c.required_lesson_ids) and (l.status='archived' or s.status='archived' or m.status='archived')));
 if c.required_lesson_ids<>ids then update public.courses set required_lesson_ids=ids,curriculum_version=curriculum_version+1,updated_at=now() where id=c.id;end if;
end $$;
create function app_private.curriculum_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 if tg_table_name='lessons' then select m.course_id into cid from public.sections s join public.modules m on m.id=s.module_id where s.id=new.section_id;
 elsif tg_table_name='sections' then select course_id into cid from public.modules where id=new.module_id;
 else cid:=new.course_id;end if;
 perform app_private.refresh_curriculum(cid);return new;
end $$;
create trigger app_lessons_curriculum after insert or update on public.lessons for each row execute function app_private.curriculum_changed();
create trigger app_sections_curriculum after insert or update on public.sections for each row execute function app_private.curriculum_changed();
create trigger app_modules_curriculum after insert or update on public.modules for each row execute function app_private.curriculum_changed();
create function app_private.validate_course() returns trigger language plpgsql set search_path='' as $$ begin
 if new.status='published' and new.certificate_enabled and (length(trim(new.signer_name))<3 or length(trim(new.signer_title))<2) then perform app_private.fail('Configure o responsável pelo certificado antes de publicar.');end if;
 if new.cover_url is not null and (new.cover_url !~ '^course-cover/[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$' and new.cover_url !~ '^demo/') then perform app_private.fail('Use o upload privado para a capa.');end if;
 if new.signature_url is not null and (new.signature_url !~ '^https://[^[:space:]]+$' or length(new.signature_url)>2000) then perform app_private.fail('Endereço da assinatura inválido.');end if;
 return new;
end $$;
create trigger app_course_validation before insert or update on public.courses for each row execute function app_private.validate_course();
create function app_private.validate_onboarding_question() returns trigger language plpgsql set search_path='' as $$ begin
 if jsonb_array_length(new.options)>50 or exists(select 1 from jsonb_array_elements(new.options) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 300) or (new.type='select' and jsonb_array_length(new.options)=0 and new.active) then perform app_private.fail('Configure as opções antes de ativar a pergunta.');end if;
 return new;
end $$;
create trigger app_question_validation before insert or update on public.onboarding_questions for each row execute function app_private.validate_onboarding_question();
create function app_private.validate_company(p_company jsonb,p_complete boolean) returns void language plpgsql security definer set search_path='' as $$
declare q public.onboarding_questions;value text;begin
 perform app_private.validate_keys(p_company,array['name','segment','role','size','stage','revenue_range','acquisition','product_description']);
 if exists(select 1 from jsonb_each(p_company) x where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>2000) then perform app_private.fail('Dados da empresa inválidos.');end if;
 for q in select * from public.onboarding_questions where active loop
  value:=trim(coalesce(p_company->>q.key,''));
  if p_complete and q.required and value='' then perform app_private.fail('Preencha os campos obrigatórios da empresa.');end if;
  if value<>'' and q.type='select' and not q.options?value then perform app_private.fail('Selecione uma opção válida para a empresa.');end if;
 end loop;
end $$;
create or replace function public.app_profile(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();p public.profiles;begin
 perform app_private.validate_keys(p_data,array['full_name','phone','bio','company','theme','onboarding_complete']);
 select * into p from public.profiles where id=u for update;
 perform app_private.validate_company(coalesce(p_data->'company',p.company),coalesce((p_data->>'onboarding_complete')::boolean,p.onboarding_complete));
 update public.profiles set full_name=case when p_data?'full_name' then trim(p_data->>'full_name') else full_name end,phone=coalesce(p_data->>'phone',phone),bio=coalesce(p_data->>'bio',bio),company=coalesce(p_data->'company',company),theme=coalesce(p_data->>'theme',theme),onboarding_complete=coalesce((p_data->>'onboarding_complete')::boolean,onboarding_complete) where id=u;
 if exists(select 1 from public.profiles x cross join public.onboarding o where x.id=u and x.onboarding_complete and (length(trim(x.full_name))<3 or (o.company_required and length(trim(coalesce(x.company->>'name','')))<1))) then perform app_private.fail('Preencha seu nome e os dados obrigatórios da empresa.');end if;
 return app_private.profile_json(u);
end $$;
revoke execute on function public.app_profile(jsonb) from public,anon;grant execute on function public.app_profile(jsonb) to authenticated;

create or replace function app_private.issue_certificate(p_actor uuid,p_course uuid) returns text language plpgsql security definer set search_path='' as $$
declare c public.courses;code_out text;name text;begin
 select * into c from public.courses where id=p_course for update;
 if not found or not c.certificate_enabled or c.status<>'published' or cardinality(c.required_lesson_ids)=0 or not app_private.entitled(p_actor,c.access_mode,c.plan_ids) or length(trim(c.signer_name))<3 or length(trim(c.signer_title))<2 then return null;end if;
 if not exists(select 1 from public.lessons where id=any(c.required_lesson_ids) and not is_preview) or coalesce((select sum(duration_seconds) from public.lessons where id=any(c.required_lesson_ids)),0)<=0 then return null;end if;
 if exists(select 1 from unnest(c.required_lesson_ids) x left join public.lessons l on l.id=x left join public.sections s on s.id=l.section_id left join public.modules m on m.id=s.module_id where l.id is null or l.status<>'published' or s.status<>'published' or m.status<>'published' or (m.access_mode<>'inherit' and not app_private.entitled(p_actor,m.access_mode,m.plan_ids)) or not exists(select 1 from public.lesson_progress p where p.user_id=p_actor and p.lesson_id=x and p.completed_at is not null)) then return null;end if;
 select full_name into name from public.profiles where id=p_actor;
 if length(trim(name))<3 then return null;end if;
 insert into public.certificates(user_id,course_id,curriculum_version,student_name,course_title,duration_minutes,lesson_ids,demo,signer_name,signer_title,signature_url)
 values(p_actor,c.id,c.curriculum_version,name,c.title,(select ceil(sum(duration_seconds)/60.0) from public.lessons where id=any(c.required_lesson_ids)),c.required_lesson_ids,(select demo from public.profiles where id=p_actor),c.signer_name,c.signer_title,c.signature_url)
 on conflict(user_id,course_id,curriculum_version) do nothing;
 select code into code_out from public.certificates where user_id=p_actor and course_id=c.id and curriculum_version=c.curriculum_version and revoked_at is null;
 return code_out;
end $$;
create function public.app_issue_certificate(p_course_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();code_out text;begin
 code_out:=app_private.issue_certificate(u,p_course_id);
 return jsonb_build_object('certificate_code',code_out,'reason',case when code_out is null then 'Certificado indisponível: confira conclusão, vigência e configuração do responsável.' end);
end $$;
revoke execute on function public.app_issue_certificate(uuid) from public,anon;grant execute on function public.app_issue_certificate(uuid) to authenticated;
create or replace function public.app_certificate(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if p_code is null or length(p_code)<>48 then perform app_private.fail('Certificado indisponível.');end if;
 select jsonb_build_object('id',id,'code',code,'student_name',student_name,'course_title',course_title,'duration_minutes',duration_minutes,'issued_at',issued_at,'revoked_at',revoked_at,'demo',demo,'signer_name',signer_name,'signer_title',signer_title,'signature_url',signature_url) into result from public.certificates where code=p_code;
 if result is null then perform app_private.fail('Certificado indisponível.');end if;return result;
end $$;
revoke execute on function public.app_certificate(text) from public,anon,authenticated;grant execute on function public.app_certificate(text) to anon,authenticated;
comment on function public.app_certificate(text) is 'anon-ok: código opaco, snapshot de emissão, sem email/CPF ou listagem';

create or replace function public.app_public_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name','Icarus','legal_ready',(select count(distinct kind)=2 from public.legal_versions where published and not demo),'registration_enabled',(select count(distinct kind)=2 from public.legal_versions where published and not demo),
 'legal_versions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'version',version,'title',title,'body',body,'demo',demo)) from public.legal_versions where published),'[]'::jsonb),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.plans p where active),'[]'::jsonb),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.onboarding_questions q where active),'[]'::jsonb))
$$;
revoke execute on function public.app_public_context() from public,anon,authenticated;grant execute on function public.app_public_context() to anon,authenticated;
comment on function public.app_public_context() is 'anon-ok: configuração pública e versões legais, sem segredos';
create or replace function public.app_bootstrap() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(true);oid uuid;begin
 for oid in select o.id from public.orders o join auth.users a on a.id=u and a.email_confirmed_at is not null and lower(a.email)=lower(o.buyer_data->>'email') where o.status='paid' and o.finalized_at is null and (o.user_id is null or o.user_id=u) loop perform app_private.finalize_order(oid,u);end loop;
 return jsonb_build_object('profile',app_private.profile_json(u),'plans',coalesce((select jsonb_agg(to_jsonb(p)-'created_at') from public.plans p where active),'[]'::jsonb),'settings',jsonb_build_object('name','Icarus','terms_url','/termos','privacy_url','/privacidade','onboarding',(select to_jsonb(o)-'singleton' from public.onboarding o limit 1),'onboarding_questions',coalesce((select jsonb_agg(to_jsonb(q) order by order_index,id) from public.onboarding_questions q where active),'[]'::jsonb),'capabilities',jsonb_build_object('checkout',false,'bunny',false)),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plan_id',plan_id,'status',status,'amount_cents',amount_cents,'created_at',created_at,'checkout_url',checkout_url) order by created_at desc) from public.orders where user_id=u),'[]'::jsonb));
end $$;
revoke execute on function public.app_bootstrap() from public,anon;grant execute on function public.app_bootstrap() to authenticated;

create function app_private.prevent_cycle() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.parent_id is not null and exists(with recursive ancestors as(select id,parent_id from public.material_folders where id=new.parent_id union select f.id,f.parent_id from public.material_folders f join ancestors a on f.id=a.parent_id)select 1 from ancestors where id=new.id) then perform app_private.fail('Uma pasta não pode ser sua própria ancestral.');end if;return new;
end $$;
create trigger app_folder_cycle before insert or update on public.material_folders for each row execute function app_private.prevent_cycle();
create function app_private.validate_path() returns trigger language plpgsql set search_path='' as $$ begin
 if new.storage_path is not null and (new.storage_path ~ '(^/|\.\.|://|[[:cntrl:]])' or length(new.storage_path)>500) then perform app_private.fail('Caminho de arquivo inválido.');end if;return new;
end $$;
create trigger app_lesson_path before insert or update on public.lessons for each row execute function app_private.validate_path();
create trigger app_material_path before insert or update on public.materials for each row execute function app_private.validate_path();
revoke all on all functions in schema app_private from public,anon,authenticated;
commit;
