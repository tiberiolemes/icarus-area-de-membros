begin;

-- Checkout e reautenticação usam o throttle por minuto já existente. Só a Edge (service_role) chama.
create function public.app_checkout_throttle(p_actor_id uuid,p_client_ip text,p_email text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_actor_id is not null then perform app_private.throttle(p_actor_id,'checkout',5);end if;
 -- Visitante não tem ator: a chave é um UUID derivado do IP e do email, sem gravar nenhum dos dois em texto.
 if nullif(trim(p_client_ip),'') is not null then perform app_private.throttle(md5('checkout-ip:'||trim(p_client_ip))::uuid,'checkout_ip',5);end if;
 if nullif(trim(p_email),'') is not null then perform app_private.throttle(md5('checkout-email:'||lower(trim(p_email)))::uuid,'checkout_email',3);end if;
end $$;
revoke execute on function public.app_checkout_throttle(uuid,text,text) from public,anon,authenticated;
grant execute on function public.app_checkout_throttle(uuid,text,text) to service_role;

create function public.app_reauth_throttle(p_actor_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_actor_id is null then perform app_private.fail();end if;
 perform app_private.throttle(p_actor_id,'reauth',5);
end $$;
revoke execute on function public.app_reauth_throttle(uuid) from public,anon,authenticated;
grant execute on function public.app_reauth_throttle(uuid) to service_role;

commit;
