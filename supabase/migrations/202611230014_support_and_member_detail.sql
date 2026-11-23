begin;
alter table public.tickets drop constraint tickets_priority_check;
alter table public.tickets drop constraint tickets_status_check;
update public.tickets set status=case status when 'pending' then 'waiting_member' when 'closed' then 'resolved' else status end where status in ('pending','closed');
alter table public.tickets add constraint tickets_priority_check check(priority in ('low','normal','high','urgent'));
alter table public.tickets add constraint tickets_status_check check(status in ('open','in_progress','waiting_member','resolved'));

create or replace function public.app_create_ticket(p_subject text,p_priority text,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();id_out uuid;begin
 perform app_private.throttle(u,'ticket',4);
 if p_priority is null or p_priority not in ('low','normal','high','urgent') then perform app_private.fail('Selecione uma prioridade válida.');end if;
 insert into public.tickets(user_id,subject,priority) values(u,trim(p_subject),p_priority) returning id into id_out;
 insert into public.ticket_messages(ticket_id,author_id,body) values(id_out,u,trim(p_body));return jsonb_build_object('id',id_out);
end $$;
create or replace function public.app_ticket_reply(p_id uuid,p_body text,p_status text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();id_out uuid;state text;staff boolean:=app_private.is_staff(u,array['admin','support']);begin
 perform app_private.throttle(u,'ticket_reply',12);
 if not app_private.ticket_access(u,p_id) then perform app_private.fail('Ticket indisponível.');end if;
 if p_status is not null and p_status not in ('open','in_progress','waiting_member','resolved') then perform app_private.fail('Situação inválida.');end if;
 if not staff and p_status is not null and p_status<>'open' then perform app_private.fail('Você pode responder ou reabrir seu próprio ticket.');end if;
 state:=coalesce(p_status,case when staff then 'waiting_member' else 'open' end);
 insert into public.ticket_messages(ticket_id,author_id,body) values(p_id,u,trim(p_body)) returning id into id_out;
 update public.tickets set status=state,updated_at=now() where id=p_id;
 perform app_private.audit(u,'reply:'||state,'tickets',p_id);return jsonb_build_object('id',id_out,'status',state);
end $$;
revoke execute on function public.app_create_ticket(text,text,text),public.app_ticket_reply(uuid,text,text) from public,anon;
grant execute on function public.app_create_ticket(text,text,text),public.app_ticket_reply(uuid,text,text) to authenticated;

create function public.app_admin_member_detail(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.require_role(array['admin']);begin
 if not exists(select 1 from public.profiles where id=p_id) then perform app_private.fail('Membro indisponível.');end if;
 return jsonb_build_object('profile',app_private.profile_json(p_id),
 'subscriptions',jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.starts_at desc,x.id) from(
  select s.id,s.starts_at,jsonb_build_object('id',s.id,'plan_id',s.plan_id,'plan_name',p.name,'starts_at',s.starts_at,'ends_at',s.ends_at,'revoked_at',s.revoked_at,'source',s.source,'order_id',s.order_id,'status',case when s.revoked_at is not null then 'revoked' when s.ends_at<=now() then 'expired' when s.starts_at>now() then 'scheduled' else 'active' end) dto
  from public.subscriptions s join public.plans p on p.id=s.plan_id where s.user_id=p_id order by s.starts_at desc,s.id limit 20)x),'[]'::jsonb),'total',(select count(*) from public.subscriptions where user_id=p_id),'page',1,'page_size',20),
 'courses',jsonb_build_object('items',coalesce((select jsonb_agg(app_private.course_json(p_id,x.id) order by x.title,x.id) from(
  select c.id,c.title from public.courses c where exists(select 1 from public.lesson_progress lp join public.lessons l on l.id=lp.lesson_id join public.sections s on s.id=l.section_id join public.modules m on m.id=s.module_id where lp.user_id=p_id and m.course_id=c.id) or exists(select 1 from public.certificates ce where ce.user_id=p_id and ce.course_id=c.id) order by c.title,c.id limit 20)x),'[]'::jsonb),
  'total',(select count(*) from public.courses c where exists(select 1 from public.lesson_progress lp join public.lessons l on l.id=lp.lesson_id join public.sections s on s.id=l.section_id join public.modules m on m.id=s.module_id where lp.user_id=p_id and m.course_id=c.id) or exists(select 1 from public.certificates ce where ce.user_id=p_id and ce.course_id=c.id)),'page',1,'page_size',20),
 'orders',jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.created_at desc,x.id) from(
  select o.id,o.created_at,jsonb_build_object('id',o.id,'plan_id',o.plan_id,'amount_cents',o.amount_cents,'access_months',o.access_months,'method',o.method,'installments',o.installments,'status',o.status,'paid_at',o.paid_at,'finalized_at',o.finalized_at,'created_at',o.created_at) dto from public.orders o where o.user_id=p_id order by o.created_at desc,o.id limit 20)x),'[]'::jsonb),'total',(select count(*) from public.orders where user_id=p_id),'page',1,'page_size',20),
 'tickets',jsonb_build_object('items',coalesce((select jsonb_agg(x.dto order by x.created_at desc,x.id) from(
  select t.id,t.created_at,jsonb_build_object('id',t.id,'subject',t.subject,'priority',t.priority,'status',t.status,'created_at',t.created_at,'updated_at',t.updated_at) dto from public.tickets t where t.user_id=p_id order by t.created_at desc,t.id limit 20)x),'[]'::jsonb),'total',(select count(*) from public.tickets where user_id=p_id),'page',1,'page_size',20));
end $$;
revoke execute on function public.app_admin_member_detail(uuid) from public,anon;
grant execute on function public.app_admin_member_detail(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
