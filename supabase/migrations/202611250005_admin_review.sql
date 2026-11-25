begin;
-- 2.5.1: denúncias com o conteúdo denunciado e pedidos LGPD com titular e atendimento auditado.
-- A lista genérica app_admin_list segue igual; estas RPCs devolvem o mesmo formato {items,total,page,page_size}.

create function public.app_admin_reports(p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.require_role(array['admin','moderator']);result jsonb;begin
 if p_query is null or p_page is null or p_page<1 or p_page>100000 or length(p_query)>200 then perform app_private.fail('Busca inválida.');end if;
 with base as (
  select r.id,r.reason,r.status,r.created_at,reporter.full_name reporter_name,
   case when r.reply_id is null then 'post' else 'reply' end target_type,
   coalesce(r.post_id,rp.post_id) post_id,r.reply_id,p.title,
   left(coalesce(rp.body,p.body),280) excerpt,author.full_name author_name,author.id author_id,
   coalesce(rp.status,p.status) target_status
  from public.reports r
  left join public.replies rp on rp.id=r.reply_id
  left join public.posts p on p.id=coalesce(r.post_id,rp.post_id)
  left join public.profiles author on author.id=coalesce(rp.author_id,p.author_id)
  left join public.profiles reporter on reporter.id=r.actor_id
  where p_query='' or concat_ws(' ',r.reason,p.title,coalesce(rp.body,p.body),author.full_name) ilike '%'||p_query||'%'
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)-'seq' order by x.seq) from(
   select b.*,row_number() over(order by b.status='pending' desc,b.created_at desc,b.id) seq from base b
   order by b.status='pending' desc,b.created_at desc,b.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),
  'total',(select count(*) from base),'page',p_page,'page_size',20) into result;
 return result;
end $$;

create function public.app_admin_privacy_requests(p_query text default '',p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.require_role(array['admin']);result jsonb;begin
 if p_query is null or p_page is null or p_page<1 or p_page>100000 or length(p_query)>200 then perform app_private.fail('Busca inválida.');end if;
 with base as (
  select q.id,q.user_id,q.kind,q.status,q.created_at,titular.full_name
  from public.privacy_requests q left join public.profiles titular on titular.id=q.user_id
  where p_query='' or concat_ws(' ',q.kind,q.status,titular.full_name,
   case q.kind when 'export' then 'Exportação de dados' when 'deletion' then 'Exclusão de conta' end,
   case q.status when 'pending' then 'Recebido' when 'processing' then 'Em análise' when 'completed' then 'Concluído' when 'rejected' then 'Recusado' end
  ) ilike '%'||p_query||'%'
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)-'seq' order by x.seq) from(
   select b.*,row_number() over(order by b.status in ('pending','processing') desc,b.created_at desc,b.id) seq from base b
   order by b.status in ('pending','processing') desc,b.created_at desc,b.id limit 20 offset (p_page-1)*20)x),'[]'::jsonb),
  'total',(select count(*) from base),'page',p_page,'page_size',20) into result;
 return result;
end $$;

-- Registra o atendimento; não exporta nem exclui dados por conta própria.
create function public.app_admin_set_privacy_request(p_id uuid,p_status text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.require_role(array['admin']);current_status text;begin
 if p_status is null or p_status not in ('processing','completed','rejected') then perform app_private.fail('Situação inválida.');end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>2000 then perform app_private.fail('Informe o motivo do registro.');end if;
 select status into current_status from public.privacy_requests where id=p_id for update;
 if current_status is null then perform app_private.fail('Pedido indisponível.');end if;
 if current_status not in ('pending','processing') then perform app_private.fail('Este pedido já foi encerrado.');end if;
 if current_status=p_status then perform app_private.fail('O pedido já está nessa situação.');end if;
 update public.privacy_requests set status=p_status where id=p_id;
 perform app_private.audit(u,'privacy:'||p_status,'privacy_request',p_id,trim(p_reason));
 return jsonb_build_object('id',p_id,'status',p_status);
end $$;

revoke execute on function public.app_admin_reports(text,integer),public.app_admin_privacy_requests(text,integer),public.app_admin_set_privacy_request(uuid,text,text) from public,anon;
grant execute on function public.app_admin_reports(text,integer),public.app_admin_privacy_requests(text,integer),public.app_admin_set_privacy_request(uuid,text,text) to authenticated;
commit;
