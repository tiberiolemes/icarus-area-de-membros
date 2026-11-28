begin;

-- Preferência do aluno para a conta inteira; profile_json já devolve a coluna por to_jsonb(p).
alter table public.profiles add column auto_advance boolean not null default false;

create or replace function public.app_profile(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();p public.profiles;begin
 perform app_private.validate_keys(p_data,array['full_name','phone','bio','company','theme','onboarding_complete','avatar_id','auto_advance']);
 if p_data?'auto_advance' and jsonb_typeof(p_data->'auto_advance')<>'boolean' then perform app_private.fail('Preferência de avanço automático inválida.');end if;
 select * into p from public.profiles where id=u for update;
 perform app_private.validate_company(coalesce(p_data->'company',p.company),coalesce((p_data->>'onboarding_complete')::boolean,p.onboarding_complete));
 if p_data?'avatar_id' and p_data->>'avatar_id' is not null and not exists(select 1 from public.uploads where id=(p_data->>'avatar_id')::uuid and profile_id=u and actor_id=u and kind='avatar' and state='ready') then perform app_private.fail('Foto de perfil inválida.');end if;
 update public.profiles set full_name=case when p_data?'full_name' then trim(p_data->>'full_name') else full_name end,phone=coalesce(p_data->>'phone',phone),bio=coalesce(p_data->>'bio',bio),company=coalesce(p_data->'company',company),theme=coalesce(p_data->>'theme',theme),onboarding_complete=coalesce((p_data->>'onboarding_complete')::boolean,onboarding_complete),avatar_id=case when p_data?'avatar_id' then (p_data->>'avatar_id')::uuid else avatar_id end,auto_advance=coalesce((p_data->>'auto_advance')::boolean,auto_advance) where id=u;
 if exists(select 1 from public.profiles x cross join public.onboarding o where x.id=u and x.onboarding_complete and (length(trim(x.full_name))<3 or (o.company_required and length(trim(coalesce(x.company->>'name','')))<1))) then perform app_private.fail('Preencha seu nome e os dados obrigatórios da empresa.');end if;
 return app_private.profile_json(u);
end $$;
revoke execute on function public.app_profile(jsonb) from public,anon;grant execute on function public.app_profile(jsonb) to authenticated;

-- Recriada a partir de 202611230028_certificate_profile_lock.sql: certificate_issued diz se esta conclusão emitiu o certificado.
create or replace function public.app_progress(p_lesson_id uuid,p_position_seconds numeric default 0,p_complete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();l public.lessons;cid uuid;p public.lesson_progress;cert text;existed boolean;begin
 perform app_private.lock_lesson_engagement_actor(u);
 if not app_private.lesson_access(u,p_lesson_id) then perform app_private.fail('Aula indisponível para seu acesso.');end if;
 if p_position_seconds is null or p_position_seconds<0 or p_position_seconds='NaN'::numeric or p_position_seconds>86400 then perform app_private.fail('Posição inválida.');end if;
 select * into l from public.lessons where id=p_lesson_id;
 if l.status<>'published' or not exists(select 1 from public.sections s join public.modules m on m.id=s.module_id join public.courses c on c.id=m.course_id where s.id=l.section_id and s.status='published' and m.status='published' and c.status='published') then perform app_private.fail('Prévia não registra conclusão.');end if;
 insert into public.lesson_progress(user_id,lesson_id,position_seconds,completed_at) values(u,l.id,least(p_position_seconds,l.duration_seconds),case when p_complete then now() end)
 on conflict(user_id,lesson_id) do update set position_seconds=greatest(public.lesson_progress.position_seconds,excluded.position_seconds),completed_at=coalesce(public.lesson_progress.completed_at,excluded.completed_at),updated_at=now() returning * into p;
 select m.course_id into cid from public.sections s join public.modules m on m.id=s.module_id where s.id=l.section_id;
 -- O ator está travado desde o início: o certificado que já existia não conta como emissão desta conclusão.
 if p_complete then
  existed:=exists(select 1 from public.certificates x join public.courses c on c.id=x.course_id where x.user_id=u and x.course_id=cid and x.curriculum_version=c.curriculum_version and x.revoked_at is null);
  cert:=app_private.issue_certificate(u,cid);
 end if;
 return jsonb_build_object('completed',p.completed_at is not null,'position_seconds',p.position_seconds,'course_progress_percent',app_private.course_json(u,cid)->'progress_percent','certificate_code',cert,'certificate_issued',cert is not null and not coalesce(existed,true),'certificate_reason',case when p_complete and cert is null then app_private.certificate_eligibility(u,cid)->>'certificate_reason' end);
end $$;
revoke execute on function public.app_progress(uuid,numeric,boolean) from public,anon;
grant execute on function public.app_progress(uuid,numeric,boolean) to authenticated;

commit;
