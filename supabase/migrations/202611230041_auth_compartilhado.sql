begin;
-- Projeto Supabase compartilhado: auth.users recebe cadastros de outros sistemas.
-- Só quem tem marcador do Icarus ganha perfil e passa pela validação; os demais são ignorados.
drop trigger app_user_created on auth.users;
drop function ica_private.auth_user_created();

create or replace function ica_private.validate_auth_signup() returns trigger language plpgsql security definer set search_path='' as $$
declare final_user auth.users;versions uuid[];v uuid;server_created boolean;local_demo boolean;begin
 select * into final_user from auth.users where id=new.id;
 if not found then return null;end if;
 server_created:=coalesce(final_user.raw_app_meta_data->>'icarus_server_created','false')='true';
 local_demo:=coalesce(final_user.raw_app_meta_data->>'icarus_local_demo','false')='true';
 -- O signUp do Icarus sempre envia legal_version_ids; contas criadas pelo servidor levam marcador no app_metadata.
 if not (server_created or local_demo or coalesce(final_user.raw_user_meta_data ? 'legal_version_ids',false)) then return null;end if;
 insert into public.ica_profiles(id,full_name) values(final_user.id,left(coalesce(final_user.raw_user_meta_data->>'full_name',''),160)) on conflict (id) do nothing;
 if local_demo and not exists(select 1 from ica_private.local_demo_guard where singleton and enabled) then perform ica_private.fail('Demonstração local desabilitada.');end if;
 -- Email confirmation alone never authorizes public signup (Auth can auto-confirm).
 if not server_created and final_user.invited_at is null then
  if (select count(distinct kind) from public.ica_legal_versions where published and not demo)<>2 then perform ica_private.fail('Cadastro público indisponível.');end if;
  begin
   select array_agg(x::uuid) into versions from jsonb_array_elements_text(coalesce(final_user.raw_user_meta_data->'legal_version_ids','[]')) x;
  exception when others then perform ica_private.fail('Aceite os termos atuais.');end;
  if (select count(distinct kind) from public.ica_legal_versions where published and not demo and id=any(versions))<>2 then perform ica_private.fail('Aceite os termos atuais.');end if;
  for v in select id from public.ica_legal_versions where published and not demo and id=any(versions) loop
   insert into public.ica_legal_acceptances(user_id,legal_version_id,marketing_opt_in) values(final_user.id,v,coalesce((final_user.raw_user_meta_data->>'marketing_opt_in')::boolean,false));
  end loop;
 end if;
 update public.ica_profiles set password_setup_required=coalesce(final_user.raw_app_meta_data->>'icarus_password_setup_required','false')='true' where id=final_user.id;
 return null;
end $$;
revoke execute on function ica_private.validate_auth_signup() from public,anon,authenticated;
commit;
