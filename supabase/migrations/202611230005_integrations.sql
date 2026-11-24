begin;
create function ica_private.service_actor(p_actor uuid) returns void language plpgsql stable security definer set search_path='' as $$ begin
 if p_actor is null or not exists(select 1 from public.ica_profiles where id=p_actor and not suspended) then perform ica_private.fail('Acesso indisponível.');end if;
end $$;
create function public.app_confirm_reauth(p_actor_id uuid,p_session_id uuid,p_token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare expires timestamptz:=now()+interval '5 minutes';begin
 perform ica_private.service_actor(p_actor_id);
 if not exists(select 1 from public.ica_app_sessions a join auth.sessions s on s.id=a.id and s.user_id=a.user_id join public.ica_profiles p on p.id=a.user_id where a.id=p_session_id and a.user_id=p_actor_id and a.expires_at>now() and a.last_activity_at+case when p.role='member' then interval '2 hours' else interval '30 minutes' end>now() and a.revoked_at is null) then perform ica_private.fail('Sessão expirada.');end if;
 insert into public.ica_reauth_nonces(token_hash,actor_id,session_id,expires_at) values(p_token_hash,p_actor_id,p_session_id,expires);
 return jsonb_build_object('expires_at',expires);
end $$;
revoke execute on function public.app_confirm_reauth(uuid,uuid,text) from public,anon,authenticated;grant execute on function public.app_confirm_reauth(uuid,uuid,text) to service_role;

create function ica_private.finalize_order(p_order uuid,p_actor uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.ica_orders;u uuid;begin
 select * into o from public.ica_orders where id=p_order for update;
 if not found then perform ica_private.fail('Pedido indisponível.');end if;
 if o.status<>'paid' then return jsonb_build_object('id',o.id,'status',o.status,'finalized',false);end if;
 select a.id into u from auth.users a join public.ica_profiles p on p.id=a.id where lower(a.email)=lower(o.buyer_data->>'email') and a.email_confirmed_at is not null and not p.suspended and (p_actor is null or a.id=p_actor) and (o.user_id is null or a.id=o.user_id) order by a.created_at limit 1;
 if u is null then return jsonb_build_object('id',o.id,'status',o.status,'finalized',false);end if;
 insert into public.ica_subscriptions(user_id,plan_id,starts_at,ends_at,source,order_id) values(u,o.plan_id,o.paid_at,o.paid_at+make_interval(months=>o.access_months),'order',o.id) on conflict(order_id) do nothing;
 update public.ica_orders set user_id=u,finalized_at=coalesce(finalized_at,now()) where id=o.id;
 update public.ica_invitation_outbox set status='completed',completed_at=coalesce(completed_at,now()) where order_id=o.id;
 return jsonb_build_object('id',o.id,'status','paid','finalized',true);
end $$;
create function public.app_finalize_paid_order(p_order_id uuid,p_actor_id uuid default null) returns jsonb language sql security definer set search_path='' as $$ select ica_private.finalize_order(p_order_id,p_actor_id) $$;
revoke execute on function public.app_finalize_paid_order(uuid,uuid) from public,anon,authenticated;grant execute on function public.app_finalize_paid_order(uuid,uuid) to service_role;
create function public.app_payment_outbox(p_order_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('invite_pending',o.status='paid' and o.finalized_at is null and x.status='pending','invite_email',case when o.status='paid' and o.finalized_at is null and x.status='pending' then o.buyer_data->>'email' end) from public.ica_orders o left join public.ica_invitation_outbox x on x.order_id=o.id where o.id=p_order_id
$$;
revoke execute on function public.app_payment_outbox(uuid) from public,anon,authenticated;grant execute on function public.app_payment_outbox(uuid) to service_role;
create function public.app_payment_context(p_order_id uuid,p_gateway_id text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('order_id',id,'gateway_id',gateway_id) from public.ica_orders where (p_order_id is not null and id=p_order_id) or (p_order_id is null and p_gateway_id is not null and gateway_id=p_gateway_id) limit 1
$$;
revoke execute on function public.app_payment_context(uuid,text) from public,anon,authenticated;grant execute on function public.app_payment_context(uuid,text) to service_role;

create function public.app_checkout_begin(p_actor_id uuid,p_plan_id uuid,p_attempt_key text,p_method text,p_installments integer,p_buyer_data jsonb,p_legal_version_ids uuid[],p_marketing_opt_in boolean,p_receipt_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare pl public.ica_plans;o public.ica_orders;email text;buyer jsonb;fresh boolean:=false;v uuid;begin
 perform ica_private.validate_keys(p_buyer_data,array['name','email','document','phone']);
 if p_actor_id is not null then
  perform ica_private.service_actor(p_actor_id);
  select a.email into email from auth.users a where id=p_actor_id and email_confirmed_at is not null;
  if email is null then perform ica_private.fail('Confirme seu email antes de continuar.');end if;
 else email:=lower(trim(p_buyer_data->>'email'));end if;
 buyer:=p_buyer_data||jsonb_build_object('email',lower(email));
 if email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(email)>254 or length(trim(coalesce(buyer->>'name','')))<3 or length(buyer->>'name')>160 or coalesce(buyer->>'document','')!~ '^[0-9]{11}([0-9]{3})?$' or length(coalesce(buyer->>'phone',''))>40 then perform ica_private.fail('Confira os dados do comprador.');end if;
 if p_method not in ('PIX','CREDIT_CARD') or p_installments not between 1 and 12 or (p_method='PIX' and p_installments<>1) or p_attempt_key is null or length(p_attempt_key) not between 16 and 160 or p_receipt_hash is null or p_receipt_hash !~ '^[a-f0-9]{64}$' then perform ica_private.fail('Dados de pagamento inválidos.');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_attempt_key,0));
 select * into o from public.ica_orders where attempt_key=p_attempt_key for update;
 if found then
  if o.user_id is distinct from p_actor_id or o.plan_id<>p_plan_id or o.method<>p_method or o.installments<>p_installments or o.buyer_data<>buyer then perform ica_private.fail('Tentativa de pagamento já utilizada.');end if;
 else
  select * into pl from public.ica_plans where id=p_plan_id and active and price_cents>0 for share;
  if not found then perform ica_private.fail('Oferta indisponível.');end if;
  if (select count(distinct kind) from public.ica_legal_versions where id=any(p_legal_version_ids) and published and not demo)<>2 then perform ica_private.fail('Aceite os termos atuais antes de pagar.');end if;
  insert into public.ica_orders(user_id,plan_id,attempt_key,amount_cents,access_months,method,installments,buyer_data,receipt_hash) values(p_actor_id,pl.id,p_attempt_key,pl.price_cents,pl.access_months,p_method,p_installments,buyer,p_receipt_hash) returning * into o;
  foreach v in array p_legal_version_ids loop
   if not exists(select 1 from public.ica_legal_versions where id=v and published and not demo) then perform ica_private.fail('Versão legal inválida.');end if;
   insert into public.ica_legal_acceptances(user_id,order_id,legal_version_id,marketing_opt_in) values(p_actor_id,o.id,v,coalesce(p_marketing_opt_in,false));
  end loop;fresh:=true;
 end if;
 return jsonb_build_object('id',o.id,'order_id',o.id,'status',o.status,'amount_cents',o.amount_cents,'plan_name',(select name from public.ica_plans where id=o.plan_id),'gateway_id',o.gateway_id,'checkout_url',o.checkout_url,'buyer_data',o.buyer_data,'create_gateway',fresh,'reconciliation_required',not fresh and o.gateway_id is null);
end $$;
revoke execute on function public.app_checkout_begin(uuid,uuid,text,text,integer,jsonb,uuid[],boolean,text) from public,anon,authenticated;grant execute on function public.app_checkout_begin(uuid,uuid,text,text,integer,jsonb,uuid[],boolean,text) to service_role;
create function public.app_checkout_gateway(p_order_id uuid,p_gateway_id text,p_checkout_url text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.ica_orders;begin
 if p_gateway_id is null or length(p_gateway_id) not between 3 and 200 or p_checkout_url is null or p_checkout_url !~ '^https://' or length(p_checkout_url)>2000 then perform ica_private.fail('Vínculo de pagamento inválido.');end if;
 select * into o from public.ica_orders where id=p_order_id for update;
 if not found or (o.gateway_id is not null and (o.gateway_id<>p_gateway_id or o.checkout_url<>p_checkout_url)) then perform ica_private.fail('Vínculo de pagamento indisponível.');end if;
 update public.ica_orders set gateway_id=p_gateway_id,checkout_url=p_checkout_url where id=o.id;
 return jsonb_build_object('id',o.id,'status',o.status);
end $$;
revoke execute on function public.app_checkout_gateway(uuid,text,text) from public,anon,authenticated;grant execute on function public.app_checkout_gateway(uuid,text,text) to service_role;
create function public.app_process_payment(p_event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.ica_orders;eid text:=p_event->>'id';kind text:=p_event->>'type';old_event public.ica_payment_events;final jsonb;begin
 perform ica_private.validate_keys(p_event,array['id','type','order_id','gateway_id','amount_cents','method']);
 if eid is null or length(eid) not between 3 and 200 or kind is null or kind not in ('paid','refunded','chargeback','expired','cancelled') or not(p_event ?& array['order_id','gateway_id','amount_cents','method']) then perform ica_private.fail('Evento de pagamento inválido.');end if;
 select * into o from public.ica_orders where id=(p_event->>'order_id')::uuid for update;
 if not found or o.gateway_id is null or o.gateway_id is distinct from p_event->>'gateway_id' or o.amount_cents is distinct from (p_event->>'amount_cents')::integer or o.method is distinct from p_event->>'method' then perform ica_private.fail('Evento não corresponde ao pedido.');end if;
 select * into old_event from public.ica_payment_events where id=eid;
 if found then
  if old_event.order_id<>o.id or old_event.event_type<>kind then perform ica_private.fail('Evento já utilizado.');end if;
  return jsonb_build_object('order_id',o.id,'status',o.status,'duplicate',true,'invite_pending',false);
 end if;
 insert into public.ica_payment_events(id,order_id,event_type) values(eid,o.id,kind);
 if kind='paid' and o.status in ('pending','paid') then
  update public.ica_orders set status='paid',paid_at=coalesce(paid_at,now()) where id=o.id;
  insert into public.ica_invitation_outbox(order_id) values(o.id) on conflict do nothing;
  final:=ica_private.finalize_order(o.id,o.user_id);
 elsif kind in ('refunded','chargeback') then
  update public.ica_orders set status=case when status='chargeback' then status else kind end where id=o.id;
  update public.ica_subscriptions set revoked_at=coalesce(revoked_at,now()) where order_id=o.id;
  update public.ica_invitation_outbox set status='completed',completed_at=now() where order_id=o.id;
 elsif kind in ('expired','cancelled') and o.status='pending' then update public.ica_orders set status=kind where id=o.id;
 end if;
 perform ica_private.audit(null,'payment:'||kind,'orders',o.id);
 select * into o from public.ica_orders where id=o.id;
 return jsonb_build_object('order_id',o.id,'status',o.status,'duplicate',false)||coalesce(public.app_payment_outbox(o.id),jsonb_build_object('invite_pending',false));
end $$;
revoke execute on function public.app_process_payment(jsonb) from public,anon,authenticated;grant execute on function public.app_process_payment(jsonb) to service_role;
create function public.app_order_status(p_order_id uuid,p_actor_id uuid,p_receipt_hash text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.ica_orders;begin
 if p_actor_id is not null then perform ica_private.service_actor(p_actor_id);end if;
 select * into o from public.ica_orders where id=p_order_id and ((p_actor_id is not null and user_id=p_actor_id) or (p_receipt_hash is not null and receipt_hash=p_receipt_hash));
 if not found then perform ica_private.fail('Pedido indisponível.');end if;
 return jsonb_build_object('order_id',o.id,'status',o.status,'amount_cents',o.amount_cents,'checkout_url',o.checkout_url,'access_granted',o.status='paid' and o.finalized_at is not null);
end $$;
revoke execute on function public.app_order_status(uuid,uuid,text) from public,anon,authenticated;grant execute on function public.app_order_status(uuid,uuid,text) to service_role;

alter table public.ica_uploads add column state text not null default 'pending' check(state in ('pending','ready'));
create function public.app_upload_access(p_actor_id uuid,p_kind text,p_resource_id uuid,p_file_name text,p_content_type text,p_size_bytes bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare id_out uuid:=gen_random_uuid();path_out text;ext text;begin
 perform ica_private.service_actor(p_actor_id);perform ica_private.throttle(p_actor_id,'upload',12);
 if p_file_name is null or length(p_file_name) not between 1 and 200 or p_file_name ~ '[/\\[:cntrl:]]' or p_size_bytes is null or p_size_bytes not between 1 and 52428800 then perform ica_private.fail('Arquivo inválido ou maior que 50 MB.');end if;
 ext:=lower(substring(p_file_name from '\.([A-Za-z0-9]+)$'));
 if not ((p_content_type='application/pdf' and ext='pdf') or (p_content_type='application/zip' and ext='zip') or (p_content_type='text/plain' and ext in ('txt','md','skill')) or (p_content_type='image/jpeg' and ext in ('jpg','jpeg')) or (p_content_type='image/png' and ext='png') or (p_content_type='image/webp' and ext='webp') or (p_content_type='video/mp4' and ext='mp4') or (p_content_type='audio/mpeg' and ext='mp3')) then perform ica_private.fail('Tipo de arquivo não permitido.');end if;
 if p_kind='ticket-attachment' then
  if not ica_private.ticket_access(p_actor_id,p_resource_id) then perform ica_private.fail();end if;
 elsif p_kind='post-image' then
  if p_content_type not in ('image/jpeg','image/png','image/webp') or p_size_bytes>10485760 or not exists(select 1 from public.ica_posts where id=p_resource_id and author_id=p_actor_id and status not in ('removed','archived') and ica_private.space_access(p_actor_id,space_id)) then perform ica_private.fail();end if;
 elsif p_kind in ('lesson','material','course-cover') then
  if not ica_private.is_staff(p_actor_id,array['admin','instructor']) then perform ica_private.fail();end if;
  if (p_kind='lesson' and not exists(select 1 from public.ica_lessons where id=p_resource_id)) or (p_kind='material' and not exists(select 1 from public.ica_materials where id=p_resource_id)) or (p_kind='course-cover' and (p_content_type not in ('image/jpeg','image/png','image/webp') or not exists(select 1 from public.ica_courses where id=p_resource_id))) then perform ica_private.fail();end if;
 else perform ica_private.fail('Destino de upload inválido.');end if;
 path_out:=p_kind||'/'||p_resource_id::text||'/'||id_out::text||'.'||ext;
 insert into public.ica_uploads(id,actor_id,kind,resource_id,ticket_id,post_id,lesson_id,material_id,course_id,path,file_name,content_type,size_bytes) values(id_out,p_actor_id,p_kind,p_resource_id,case when p_kind='ticket-attachment' then p_resource_id end,case when p_kind='post-image' then p_resource_id end,case when p_kind='lesson' then p_resource_id end,case when p_kind='material' then p_resource_id end,case when p_kind='course-cover' then p_resource_id end,path_out,p_file_name,p_content_type,p_size_bytes);
 return jsonb_build_object('id',id_out,'bucket','icarus-private','path',path_out,'storage_path',path_out,'content_type',p_content_type,'size_bytes',p_size_bytes);
end $$;
revoke execute on function public.app_upload_access(uuid,text,uuid,text,text,bigint) from public,anon,authenticated;grant execute on function public.app_upload_access(uuid,text,uuid,text,text,bigint) to service_role;
create function public.app_upload_finalize(p_actor_id uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare x public.ica_uploads;begin
 perform ica_private.service_actor(p_actor_id);
 select * into x from public.ica_uploads where id=p_id and actor_id=p_actor_id for update;
 if not found or not exists(select 1 from storage.objects where bucket_id='icarus-private' and name=x.path) then perform ica_private.fail('Upload ainda não foi concluído.');end if;
 if x.kind='post-image' then
  if not exists(select 1 from public.ica_posts where id=x.post_id and author_id=p_actor_id and status not in ('removed','archived') and ica_private.space_access(p_actor_id,space_id)) then perform ica_private.fail();end if;
  update public.ica_posts set image_path=x.path,status='pending',updated_at=now() where id=x.post_id;
 elsif x.kind='material' then
  if not ica_private.is_staff(p_actor_id,array['admin','instructor']) then perform ica_private.fail();end if;
  update public.ica_materials set storage_path=x.path,file_type=x.content_type,size_bytes=x.size_bytes where id=x.material_id;
 elsif x.kind='lesson' then
  if not ica_private.is_staff(p_actor_id,array['admin','instructor']) then perform ica_private.fail();end if;
  update public.ica_lessons set storage_path=x.path where id=x.lesson_id;
 elsif x.kind='course-cover' then
  if not ica_private.is_staff(p_actor_id,array['admin','instructor']) then perform ica_private.fail();end if;
  update public.ica_courses set cover_url=x.path where id=x.course_id;
 elsif x.kind='ticket-attachment' then if not ica_private.ticket_access(p_actor_id,x.ticket_id) then perform ica_private.fail();end if;
 end if;
 update public.ica_uploads set state='ready' where id=x.id;return jsonb_build_object('id',x.id,'path',x.path,'state','ready');
end $$;
revoke execute on function public.app_upload_finalize(uuid,uuid) from public,anon,authenticated;grant execute on function public.app_upload_finalize(uuid,uuid) to service_role;
create function public.app_upload_cancel(p_actor_id uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform ica_private.service_actor(p_actor_id);
 delete from public.ica_uploads x where x.id=p_id and x.actor_id=p_actor_id and state='pending' and not exists(select 1 from storage.objects where bucket_id='icarus-private' and name=x.path);
 if not found then perform ica_private.fail('Upload não pode ser cancelado.');end if;return jsonb_build_object('id',p_id,'cancelled',true);
end $$;
revoke execute on function public.app_upload_cancel(uuid,uuid) from public,anon,authenticated;grant execute on function public.app_upload_cancel(uuid,uuid) to service_role;
create function public.app_media_access(p_actor_id uuid,p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare path_out text;video text;begin
 perform ica_private.service_actor(p_actor_id);
 if p_kind='lesson' and ica_private.lesson_access(p_actor_id,p_id) then select storage_path,video_id into path_out,video from public.ica_lessons where id=p_id;
 elsif p_kind='material' and ica_private.material_access(p_actor_id,p_id) then select storage_path into path_out from public.ica_materials where id=p_id;
 elsif p_kind='ticket-attachment' then select path into path_out from public.ica_uploads where id=p_id and state='ready' and ticket_id is not null and ica_private.ticket_access(p_actor_id,ticket_id);
 elsif p_kind='post-image' then select x.path into path_out from public.ica_uploads x join public.ica_posts p on p.id=x.post_id where x.id=p_id and x.state='ready' and p.image_path=x.path and ica_private.post_access(p_actor_id,p.id);
 elsif p_kind='course-cover' then select cover_url into path_out from public.ica_courses where id=p_id and (status='published' or ica_private.is_staff(p_actor_id,array['admin','instructor']));
 else perform ica_private.fail('Arquivo indisponível.');end if;
 if path_out is null and video is null then perform ica_private.fail('Arquivo não configurado.');end if;
 return jsonb_build_object('storage_path',path_out,'video_id',video,'provider',case when video is not null then 'bunny' else 'supabase' end,'bucket','icarus-private','can_access',true);
end $$;
revoke execute on function public.app_media_access(uuid,text,uuid) from public,anon,authenticated;grant execute on function public.app_media_access(uuid,text,uuid) to service_role;
revoke all on all functions in schema ica_private from public,anon,authenticated;
commit;
