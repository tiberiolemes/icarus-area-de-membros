begin;
create or replace function ica_private.auth_user_created() returns trigger language plpgsql security definer set search_path='' as $$
declare versions uuid[];v uuid;server_created boolean:=coalesce(new.raw_app_meta_data->>'icarus_server_created','false')='true';local_demo boolean:=coalesce(new.raw_app_meta_data->>'icarus_local_demo','false')='true';begin
 -- Auth Admin writes app_metadata; signup user_metadata cannot authorize this branch.
 if local_demo and not exists(select 1 from ica_private.local_demo_guard where singleton and enabled) then perform ica_private.fail('Demonstração local desabilitada.');end if;
 if new.email_confirmed_at is null and new.invited_at is null and not server_created then
  if (select count(distinct kind) from public.ica_legal_versions where published and not demo)<>2 then perform ica_private.fail('Cadastro público indisponível.');end if;
  begin select array_agg(x::uuid) into versions from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'legal_version_ids','[]')) x;exception when others then perform ica_private.fail('Aceite os termos atuais.');end;
  if (select count(distinct kind) from public.ica_legal_versions where published and not demo and id=any(versions))<>2 then perform ica_private.fail('Aceite os termos atuais.');end if;
 end if;
 insert into public.ica_profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),160));
 foreach v in array coalesce(versions,'{}') loop insert into public.ica_legal_acceptances(user_id,legal_version_id,marketing_opt_in) values(new.id,v,coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean,false));end loop;
 return new;
end $$;
revoke execute on function ica_private.auth_user_created() from public,anon,authenticated;
commit;
