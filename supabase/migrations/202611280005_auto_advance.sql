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

commit;
