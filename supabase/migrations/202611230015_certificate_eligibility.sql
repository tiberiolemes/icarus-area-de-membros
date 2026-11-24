begin;
create function ica_private.certificate_eligibility(p_actor uuid,p_course uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.ica_courses;p public.ica_profiles;issued public.ica_certificates;reason text;begin
 select * into c from public.ica_courses where id=p_course;
 select * into p from public.ica_profiles where id=p_actor;
 if p.id is null or p.suspended or p.password_setup_required then reason:='Seu acesso está indisponível ou exige a definição da senha.';
 elsif c.id is null or c.status<>'published' then reason:='Curso indisponível para emissão.';
 elsif not c.certificate_enabled then reason:='Este curso não emite certificado.';
 elsif not ica_private.entitled(p_actor,c.access_mode,c.plan_ids) then reason:='Seu plano ou sua vigência não permite emitir este certificado.';
 elsif length(trim(p.full_name))<3 then reason:='Preencha seu nome completo para emitir o certificado.';
 elsif length(trim(c.signer_name))<3 or length(trim(c.signer_title))<2 then reason:='O responsável pelo certificado ainda não foi configurado.';
 elsif cardinality(c.required_lesson_ids)=0 then reason:='O curso ainda não possui currículo obrigatório publicado.';
 elsif not exists(select 1 from public.ica_lessons where id=any(c.required_lesson_ids) and not is_preview) then reason:='A conclusão apenas de prévias não emite certificado.';
 elsif coalesce((select sum(duration_seconds) from public.ica_lessons where id=any(c.required_lesson_ids)),0)<=0 then reason:='A carga horária do curso ainda não foi configurada.';
 elsif exists(select 1 from unnest(c.required_lesson_ids) x left join public.ica_lessons l on l.id=x left join public.ica_sections s on s.id=l.section_id left join public.ica_modules m on m.id=s.module_id where l.id is null or l.status<>'published' or s.status<>'published' or m.status<>'published' or (m.access_mode<>'inherit' and not ica_private.entitled(p_actor,m.access_mode,m.plan_ids))) then reason:='Há aulas obrigatórias indisponíveis para seu acesso.';
 elsif exists(select 1 from unnest(c.required_lesson_ids) x where not exists(select 1 from public.ica_lesson_progress lp where lp.user_id=p_actor and lp.lesson_id=x and lp.completed_at is not null)) then reason:='Conclua todas as aulas obrigatórias para emitir o certificado.';
 end if;
 if reason is not null then return jsonb_build_object('can_issue',false,'certificate_reason',reason,'certificate_code',null);end if;
 select * into issued from public.ica_certificates where user_id=p_actor and course_id=c.id and curriculum_version=c.curriculum_version;
 if found then return jsonb_build_object('can_issue',false,'certificate_reason',case when issued.revoked_at is null then 'Certificado já emitido.' else 'Este certificado foi revogado.' end,'certificate_code',case when issued.revoked_at is null then issued.code end);end if;
 return jsonb_build_object('can_issue',true,'certificate_reason',null,'certificate_code',null);
end $$;
create or replace function ica_private.issue_certificate(p_actor uuid,p_course uuid) returns text language plpgsql security definer set search_path='' as $$
declare c public.ica_courses;eligibility jsonb;code_out text;begin
 select * into c from public.ica_courses where id=p_course for update;
 if not found then return null;end if;
 eligibility:=ica_private.certificate_eligibility(p_actor,p_course);
 if eligibility->>'certificate_code' is not null then return eligibility->>'certificate_code';end if;
 if not (eligibility->>'can_issue')::boolean then return null;end if;
 insert into public.ica_certificates(user_id,course_id,curriculum_version,student_name,course_title,duration_minutes,lesson_ids,demo,signer_name,signer_title,signature_url)
 values(p_actor,c.id,c.curriculum_version,(select full_name from public.ica_profiles where id=p_actor),c.title,(select ceil(sum(duration_seconds)/60.0) from public.ica_lessons where id=any(c.required_lesson_ids)),c.required_lesson_ids,(select demo from public.ica_profiles where id=p_actor),c.signer_name,c.signer_title,c.signature_url)
 on conflict(user_id,course_id,curriculum_version) do nothing;
 select code into code_out from public.ica_certificates where user_id=p_actor and course_id=c.id and curriculum_version=c.curriculum_version and revoked_at is null;
 return code_out;
end $$;
create or replace function ica_private.course_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'slug',c.slug,'title',c.title,'description',c.description,'cover_url',c.cover_url,'status',c.status,'access_mode',c.access_mode,'plan_ids',c.plan_ids,'certificate_enabled',c.certificate_enabled,
 'required_lessons',cardinality(c.required_lesson_ids),'total_lessons',q.total,'completed_lessons',q.done,'progress_percent',case when cardinality(c.required_lesson_ids)>0 then round(100.0*(select count(*) from public.ica_lesson_progress lp where lp.user_id=p_actor and lp.lesson_id=any(c.required_lesson_ids) and lp.completed_at is not null)/cardinality(c.required_lesson_ids)) else 0 end,'duration_seconds',q.duration,'can_access',ica_private.course_access(p_actor,c.id))||(ica_private.certificate_eligibility(p_actor,c.id)-'certificate_code')
 from public.ica_courses c cross join lateral(select count(*) total,count(*) filter(where lp.completed_at is not null) done,coalesce(sum(l.duration_seconds),0) duration from public.ica_lessons l join public.ica_sections s on s.id=l.section_id join public.ica_modules m on m.id=s.module_id left join public.ica_lesson_progress lp on lp.lesson_id=l.id and lp.user_id=p_actor where m.course_id=c.id and l.status='published' and s.status='published' and m.status='published')q where c.id=p_id
$$;
create or replace function public.app_issue_certificate(p_course_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();code_out text;eligibility jsonb;begin
 code_out:=ica_private.issue_certificate(u,p_course_id);
 eligibility:=ica_private.certificate_eligibility(u,p_course_id);
 return jsonb_build_object('certificate_code',code_out,'reason',case when code_out is null then eligibility->>'certificate_reason' end);
end $$;
create or replace function public.app_progress(p_lesson_id uuid,p_position_seconds numeric default 0,p_complete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();l public.ica_lessons;cid uuid;p public.ica_lesson_progress;cert text;begin
 if not ica_private.lesson_access(u,p_lesson_id) then perform ica_private.fail('Aula indisponível para seu acesso.');end if;
 if p_position_seconds is null or p_position_seconds<0 or p_position_seconds='NaN'::numeric or p_position_seconds>86400 then perform ica_private.fail('Posição inválida.');end if;
 select * into l from public.ica_lessons where id=p_lesson_id;
 if l.status<>'published' or not exists(select 1 from public.ica_sections s join public.ica_modules m on m.id=s.module_id join public.ica_courses c on c.id=m.course_id where s.id=l.section_id and s.status='published' and m.status='published' and c.status='published') then perform ica_private.fail('Prévia não registra conclusão.');end if;
 insert into public.ica_lesson_progress(user_id,lesson_id,position_seconds,completed_at) values(u,l.id,least(p_position_seconds,l.duration_seconds),case when p_complete then now() end)
 on conflict(user_id,lesson_id) do update set position_seconds=greatest(public.ica_lesson_progress.position_seconds,excluded.position_seconds),completed_at=coalesce(public.ica_lesson_progress.completed_at,excluded.completed_at),updated_at=now() returning * into p;
 select m.course_id into cid from public.ica_sections s join public.ica_modules m on m.id=s.module_id where s.id=l.section_id;
 if p_complete then cert:=ica_private.issue_certificate(u,cid);end if;
 return jsonb_build_object('completed',p.completed_at is not null,'position_seconds',p.position_seconds,'course_progress_percent',ica_private.course_json(u,cid)->'progress_percent','certificate_code',cert,'certificate_reason',case when p_complete and cert is null then ica_private.certificate_eligibility(u,cid)->>'certificate_reason' end);
end $$;
revoke execute on function ica_private.certificate_eligibility(uuid,uuid),ica_private.issue_certificate(uuid,uuid),ica_private.course_json(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.app_issue_certificate(uuid),public.app_progress(uuid,numeric,boolean) from public,anon;
grant execute on function public.app_issue_certificate(uuid),public.app_progress(uuid,numeric,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
