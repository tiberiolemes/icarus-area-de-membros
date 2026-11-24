begin;
create function ica_private.post_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'space_id',p.space_id,'author_name',a.full_name,'author_id',a.id,'author_role',a.role,'plan_name',(select pl.name from public.ica_subscriptions s join public.ica_plans pl on pl.id=s.plan_id where s.user_id=a.id and s.starts_at<=now() and s.ends_at>now() and s.revoked_at is null order by s.ends_at desc limit 1),'title',p.title,'body',p.body,'status',p.status,'created_at',p.created_at,'updated_at',p.updated_at,'image_id',(select id from public.ica_uploads where post_id=p.id and path=p.image_path),'vote_count',(select count(*) from public.ica_votes where post_id=p.id),'voted',exists(select 1 from public.ica_votes where post_id=p.id and actor_id=p_actor),'reply_count',(select count(*) from public.ica_replies r where r.post_id=p.id and (r.status='approved' or r.author_id=p_actor or ica_private.is_staff(p_actor,array['admin','moderator']))),'can_edit',p.author_id=p_actor)
 from public.ica_posts p join public.ica_profiles a on a.id=p.author_id where p.id=p_id
$$;
create function ica_private.reply_json(p_actor uuid,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'post_id',r.post_id,'author_name',a.full_name,'author_id',a.id,'author_role',a.role,'plan_name',null,'body',r.body,'status',r.status,'created_at',r.created_at,'vote_count',(select count(*) from public.ica_votes where reply_id=r.id),'voted',exists(select 1 from public.ica_votes where reply_id=r.id and actor_id=p_actor),'can_edit',false) from public.ica_replies r join public.ica_profiles a on a.id=r.author_id where r.id=p_id
$$;
create function public.app_feed(p_space_id uuid default null,p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();begin
 if p_page<1 or p_page>100000 or length(p_query)>200 then perform ica_private.fail('Busca inválida.');end if;
 if p_space_id is not null and not ica_private.space_access(u,p_space_id) then perform ica_private.fail('Espaço indisponível.');end if;
 return jsonb_build_object('spaces',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'can_access',true) order by order_index,id) from public.ica_spaces s where ica_private.space_access(u,s.id)),'[]'::jsonb),'items',coalesce((select jsonb_agg(ica_private.post_json(u,x.id)) from(select id from public.ica_posts where (p_space_id is null or space_id=p_space_id) and ica_private.post_access(u,id) and (title ilike '%'||p_query||'%' or body ilike '%'||p_query||'%') order by created_at desc,id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.ica_posts where (p_space_id is null or space_id=p_space_id) and ica_private.post_access(u,id) and (title ilike '%'||p_query||'%' or body ilike '%'||p_query||'%')),'page',p_page,'page_size',20);
end $$;
revoke execute on function public.app_feed(uuid,text,integer) from public,anon;grant execute on function public.app_feed(uuid,text,integer) to authenticated;
create function public.app_post(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();begin
 if not ica_private.post_access(u,p_id) then perform ica_private.fail('Publicação indisponível.');end if;
 return jsonb_build_object('post',ica_private.post_json(u,p_id),'replies',coalesce((select jsonb_agg(ica_private.reply_json(u,r.id) order by r.created_at,r.id) from public.ica_replies r where r.post_id=p_id and (r.status='approved' or r.author_id=u or ica_private.is_staff(u,array['admin','moderator']))),'[]'::jsonb),'can_moderate',ica_private.is_staff(u,array['admin','moderator']));
end $$;
revoke execute on function public.app_post(uuid) from public,anon;grant execute on function public.app_post(uuid) to authenticated;
create function public.app_save_post(p_id uuid,p_space_id uuid,p_title text,p_body text,p_image_path text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();id_out uuid;begin
 perform ica_private.throttle(u,'post',6);
 if not ica_private.space_access(u,p_space_id) then perform ica_private.fail('Espaço indisponível.');end if;
 if p_image_path is not null and not exists(select 1 from public.ica_uploads where path=p_image_path and actor_id=u and post_id=p_id and kind='post-image') then perform ica_private.fail('Imagem não autorizada.');end if;
 if p_id is null then
  insert into public.ica_posts(author_id,space_id,title,body,image_path) values(u,p_space_id,trim(p_title),trim(p_body),p_image_path) returning id into id_out;
 else
  update public.ica_posts set space_id=p_space_id,title=trim(p_title),body=trim(p_body),image_path=p_image_path,status='pending',updated_at=now() where id=p_id and author_id=u and status not in ('removed','archived') returning id into id_out;
  if id_out is null then perform ica_private.fail('Publicação indisponível.');end if;
  perform ica_private.audit(u,'resubmit','posts',id_out);
 end if;
 return jsonb_build_object('id',id_out,'status','pending');
end $$;
revoke execute on function public.app_save_post(uuid,uuid,text,text,text) from public,anon;grant execute on function public.app_save_post(uuid,uuid,text,text,text) to authenticated;
create function public.app_reply(p_post_id uuid,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();id_out uuid;begin
 perform ica_private.throttle(u,'reply',12);
 if not ica_private.post_access(u,p_post_id) or not exists(select 1 from public.ica_posts where id=p_post_id and status='approved') then perform ica_private.fail('Publicação indisponível para respostas.');end if;
 insert into public.ica_replies(post_id,author_id,body) values(p_post_id,u,trim(p_body)) returning id into id_out;return jsonb_build_object('id',id_out,'status','pending');
end $$;
revoke execute on function public.app_reply(uuid,text) from public,anon;grant execute on function public.app_reply(uuid,text) to authenticated;
create function ica_private.visible_target(p_actor uuid,p_type text,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when p_type='post' then exists(select 1 from public.ica_posts where id=p_id and status='approved' and ica_private.post_access(p_actor,id)) when p_type='reply' then exists(select 1 from public.ica_replies where id=p_id and status='approved' and ica_private.post_access(p_actor,post_id)) else false end
$$;
create function public.app_vote(p_target_type text,p_target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();voted boolean;count_out integer;begin
 perform ica_private.throttle(u,'vote',30);
 if not ica_private.visible_target(u,p_target_type,p_target_id) then perform ica_private.fail('Conteúdo indisponível.');end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_target_type||p_target_id::text,0));
 if p_target_type='post' then
  delete from public.ica_votes where actor_id=u and post_id=p_target_id;
  if not found then insert into public.ica_votes(actor_id,post_id) values(u,p_target_id);voted:=true;else voted:=false;end if;
  select count(*) into count_out from public.ica_votes where post_id=p_target_id;
 else
  delete from public.ica_votes where actor_id=u and reply_id=p_target_id;
  if not found then insert into public.ica_votes(actor_id,reply_id) values(u,p_target_id);voted:=true;else voted:=false;end if;
  select count(*) into count_out from public.ica_votes where reply_id=p_target_id;
 end if;return jsonb_build_object('vote_count',count_out,'voted',voted);
end $$;
revoke execute on function public.app_vote(text,uuid) from public,anon;grant execute on function public.app_vote(text,uuid) to authenticated;
create function public.app_report(p_target_type text,p_target_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();id_out uuid;begin
 perform ica_private.throttle(u,'report',5);
 if not ica_private.visible_target(u,p_target_type,p_target_id) then perform ica_private.fail('Conteúdo indisponível.');end if;
 insert into public.ica_reports(actor_id,post_id,reply_id,reason) values(u,case when p_target_type='post' then p_target_id end,case when p_target_type='reply' then p_target_id end,trim(p_reason)) returning id into id_out;
 return jsonb_build_object('id',id_out);
end $$;
revoke execute on function public.app_report(text,uuid,text) from public,anon;grant execute on function public.app_report(text,uuid,text) to authenticated;
create function public.app_moderate(p_target_type text,p_target_id uuid,p_decision text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.require_role(array['admin','moderator']);state text;begin
 if length(trim(p_reason))<3 or length(p_reason)>2000 then perform ica_private.fail('Informe o motivo da decisão.');end if;
 state:=case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'hide' then 'hidden' when 'remove' then 'removed' when 'approved' then 'approved' when 'rejected' then 'rejected' end;
 if p_target_type='report' then
  if p_decision not in ('resolved','dismissed') then perform ica_private.fail('Decisão inválida.');end if;
  update public.ica_reports set status=p_decision where id=p_target_id;state:=p_decision;
 elsif p_target_type='post' and state is not null then update public.ica_posts set status=state,updated_at=now() where id=p_target_id and status<>'archived';
 elsif p_target_type='reply' and state is not null then update public.ica_replies set status=state where id=p_target_id and status<>'archived';
 else perform ica_private.fail('Decisão inválida.');end if;
 if not found then perform ica_private.fail('Conteúdo indisponível.');end if;
 insert into public.ica_moderation_events(actor_id,target_type,target_id,decision,reason) values(u,p_target_type,p_target_id,p_decision,trim(p_reason));
 perform ica_private.audit(u,'moderate:'||p_decision,p_target_type,p_target_id,trim(p_reason));
 return jsonb_build_object('id',p_target_id,'status',state);
end $$;
revoke execute on function public.app_moderate(text,uuid,text,text) from public,anon;grant execute on function public.app_moderate(text,uuid,text,text) to authenticated;

create function ica_private.ticket_json(p_actor uuid,p_id uuid,p_messages boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',t.id,'subject',t.subject,'priority',t.priority,'status',t.status,'created_at',t.created_at,'updated_at',t.updated_at,'messages',case when p_messages then coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'author_name',a.full_name,'author_id',a.id,'body',m.body,'created_at',m.created_at,'attachments','[]'::jsonb) order by m.created_at,m.id) from public.ica_ticket_messages m join public.ica_profiles a on a.id=m.author_id where m.ticket_id=t.id),'[]'::jsonb) else '[]'::jsonb end,'attachments',case when p_messages then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',file_name,'file_type',content_type,'size_bytes',size_bytes,'created_at',created_at) order by created_at,id) from public.ica_uploads where ticket_id=t.id),'[]'::jsonb) else '[]'::jsonb end) from public.ica_tickets t where t.id=p_id and ica_private.ticket_access(p_actor,t.id)
$$;
create function public.app_tickets(p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();begin
 if p_page<1 or p_page>100000 then perform ica_private.fail('Página inválida.');end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(ica_private.ticket_json(u,x.id)) from(select id from public.ica_tickets where ica_private.ticket_access(u,id) order by created_at desc,id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),'total',(select count(*) from public.ica_tickets where ica_private.ticket_access(u,id)),'page',p_page,'page_size',20);
end $$;
revoke execute on function public.app_tickets(integer) from public,anon;grant execute on function public.app_tickets(integer) to authenticated;
create function public.app_ticket(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();begin if not ica_private.ticket_access(u,p_id) then perform ica_private.fail('Ticket indisponível.');end if;return ica_private.ticket_json(u,p_id,true);end $$;
revoke execute on function public.app_ticket(uuid) from public,anon;grant execute on function public.app_ticket(uuid) to authenticated;
create function public.app_create_ticket(p_subject text,p_priority text,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();id_out uuid;begin
 perform ica_private.throttle(u,'ticket',4);
 insert into public.ica_tickets(user_id,subject,priority) values(u,trim(p_subject),p_priority) returning id into id_out;
 insert into public.ica_ticket_messages(ticket_id,author_id,body) values(id_out,u,trim(p_body));return jsonb_build_object('id',id_out);
end $$;
revoke execute on function public.app_create_ticket(text,text,text) from public,anon;grant execute on function public.app_create_ticket(text,text,text) to authenticated;
create function public.app_ticket_reply(p_id uuid,p_body text,p_status text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=ica_private.actor();id_out uuid;state text;begin
 perform ica_private.throttle(u,'ticket_reply',12);
 if not ica_private.ticket_access(u,p_id) then perform ica_private.fail('Ticket indisponível.');end if;
 if p_status is not null and p_status not in ('open','pending','closed') then perform ica_private.fail('Situação inválida.');end if;
 if p_status='pending' and not ica_private.is_staff(u,array['admin','support']) then perform ica_private.fail();end if;
 insert into public.ica_ticket_messages(ticket_id,author_id,body) values(p_id,u,trim(p_body)) returning id into id_out;
 update public.ica_tickets set status=coalesce(p_status,'open'),updated_at=now() where id=p_id returning status into state;
 perform ica_private.audit(u,'reply:'||state,'tickets',p_id);return jsonb_build_object('id',id_out,'status',state);
end $$;
revoke execute on function public.app_ticket_reply(uuid,text,text) from public,anon;grant execute on function public.app_ticket_reply(uuid,text,text) to authenticated;
revoke all on all functions in schema ica_private from public,anon,authenticated;
commit;
