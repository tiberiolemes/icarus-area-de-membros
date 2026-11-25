begin;

create or replace function app_private.issue_certificate(p_actor uuid,p_course uuid) returns text language plpgsql security definer set search_path='' as $$
declare c public.courses;eligibility jsonb;code_out text;begin
 -- Adquira o perfil antes do curso, na mesma ordem da emissão por progresso.
 perform app_private.lock_lesson_engagement_actor(p_actor);
 select * into c from public.courses where id=p_course for update;
 if not found then return null;end if;
 eligibility:=app_private.certificate_eligibility(p_actor,p_course);
 if eligibility->>'certificate_code' is not null then return eligibility->>'certificate_code';end if;
 if not (eligibility->>'can_issue')::boolean then return null;end if;
 insert into public.certificates(user_id,course_id,curriculum_version,student_name,course_title,duration_minutes,lesson_ids,demo,signer_name,signer_title,signature_url)
 values(p_actor,c.id,c.curriculum_version,(select full_name from public.profiles where id=p_actor),c.title,(select ceil(sum(duration_seconds)/60.0) from public.lessons where id=any(c.required_lesson_ids)),c.required_lesson_ids,(select demo from public.profiles where id=p_actor),c.signer_name,c.signer_title,c.signature_url)
 on conflict(user_id,course_id,curriculum_version) do nothing;
 select code into code_out from public.certificates where user_id=p_actor and course_id=c.id and curriculum_version=c.curriculum_version and revoked_at is null;
 return code_out;
end $$;

create or replace function public.app_progress(p_lesson_id uuid,p_position_seconds numeric default 0,p_complete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();l public.lessons;cid uuid;p public.lesson_progress;cert text;begin
 perform app_private.lock_lesson_engagement_actor(u);
 if not app_private.lesson_access(u,p_lesson_id) then perform app_private.fail('Aula indisponível para seu acesso.');end if;
 if p_position_seconds is null or p_position_seconds<0 or p_position_seconds='NaN'::numeric or p_position_seconds>86400 then perform app_private.fail('Posição inválida.');end if;
 select * into l from public.lessons where id=p_lesson_id;
 if l.status<>'published' or not exists(select 1 from public.sections s join public.modules m on m.id=s.module_id join public.courses c on c.id=m.course_id where s.id=l.section_id and s.status='published' and m.status='published' and c.status='published') then perform app_private.fail('Prévia não registra conclusão.');end if;
 insert into public.lesson_progress(user_id,lesson_id,position_seconds,completed_at) values(u,l.id,least(p_position_seconds,l.duration_seconds),case when p_complete then now() end)
 on conflict(user_id,lesson_id) do update set position_seconds=greatest(public.lesson_progress.position_seconds,excluded.position_seconds),completed_at=coalesce(public.lesson_progress.completed_at,excluded.completed_at),updated_at=now() returning * into p;
 select m.course_id into cid from public.sections s join public.modules m on m.id=s.module_id where s.id=l.section_id;
 if p_complete then cert:=app_private.issue_certificate(u,cid);end if;
 return jsonb_build_object('completed',p.completed_at is not null,'position_seconds',p.position_seconds,'course_progress_percent',app_private.course_json(u,cid)->'progress_percent','certificate_code',cert,'certificate_reason',case when p_complete and cert is null then app_private.certificate_eligibility(u,cid)->>'certificate_reason' end);
end $$;

revoke execute on function app_private.issue_certificate(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.app_progress(uuid,numeric,boolean) from public,anon;
grant execute on function public.app_progress(uuid,numeric,boolean) to authenticated;

commit;
