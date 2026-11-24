begin;

create table public.ica_lesson_presentations (
 lesson_id uuid primary key references public.ica_lessons(id),
 presentation jsonb not null check (jsonb_typeof(presentation)='object' and pg_column_size(presentation)<=65536)
);

create table public.ica_lesson_checklist_items (
 user_id uuid not null references public.ica_profiles(id),
 lesson_id uuid not null references public.ica_lesson_presentations(lesson_id),
 item_id text not null check (item_id collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
 primary key (user_id,lesson_id,item_id)
);
create index ica_lesson_checklist_items_definition on public.ica_lesson_checklist_items(lesson_id,item_id);

alter table public.ica_lesson_presentations enable row level security;
alter table public.ica_lesson_checklist_items enable row level security;
revoke all on public.ica_lesson_presentations,public.ica_lesson_checklist_items
 from public,anon,authenticated,service_role;

create function ica_private.valid_lesson_presentation_text(p_value jsonb,p_limit integer)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p_value) is not distinct from 'string'
  and length(p_value#>>'{}')<=p_limit
  and ica_private.trim_lesson_engagement_text(p_value#>>'{}')<>''
$$;

create function ica_private.validate_lesson_presentation(p_presentation jsonb)
returns void language plpgsql set search_path='' as $$
declare
 block_name text;
 block jsonb;
 item jsonb;
 start_seconds numeric;
 duration_seconds numeric;
 previous_start numeric := -1;
 previous_end numeric := 0;
 item_ids text[] := '{}';
begin
 if pg_column_size(p_presentation)>65536 then
  perform ica_private.fail('A apresentação excede o limite de 64 KiB.');
 end if;
 perform ica_private.validate_keys(p_presentation,array['subtitle','chapters','takeaways','formula','checklist','cta']);
 if p_presentation?'subtitle'
   and not ica_private.valid_lesson_presentation_text(p_presentation->'subtitle',200) then
  perform ica_private.fail('Subtítulo inválido.');
 end if;

 foreach block_name in array array['chapters','takeaways','checklist'] loop
  if not p_presentation?block_name then continue; end if;
  block := p_presentation->block_name;
  if jsonb_typeof(block)<>'array' then perform ica_private.fail('Lista editorial inválida.'); end if;
  if jsonb_array_length(block)>(case when block_name='takeaways' then 20 else 40 end) then
   perform ica_private.fail('A lista excede o limite de itens.');
  end if;

  for item in select value from jsonb_array_elements(block) loop
   case block_name
   when 'chapters' then
    perform ica_private.validate_keys(item,array['title','start_seconds','duration_seconds']);
    if not ica_private.valid_lesson_presentation_text(item->'title',160)
      or jsonb_typeof(item->'start_seconds') is distinct from 'number'
      or (item?'duration_seconds' and jsonb_typeof(item->'duration_seconds')<>'number') then
     perform ica_private.fail('Capítulo inválido.');
    end if;
    start_seconds := (item->>'start_seconds')::numeric;
    duration_seconds := (item->>'duration_seconds')::numeric;
    if start_seconds<=previous_start or start_seconds<previous_end or start_seconds>=86400
      or (duration_seconds is not null and (duration_seconds<=0 or duration_seconds>86400-start_seconds)) then
     perform ica_private.fail('Informe capítulos em ordem crescente, sem sobreposição e dentro de 24 horas.');
    end if;
    previous_start := start_seconds;
    previous_end := start_seconds+coalesce(duration_seconds,0);
   when 'takeaways' then
    perform ica_private.validate_keys(item,array['icon','title','body']);
    if coalesce(item->>'icon','') not in ('tune','layers')
      or not ica_private.valid_lesson_presentation_text(item->'title',160)
      or not ica_private.valid_lesson_presentation_text(item->'body',2000) then
     perform ica_private.fail('Destaque inválido.');
    end if;
   when 'checklist' then
    perform ica_private.validate_keys(item,array['id','label']);
    if not ica_private.valid_lesson_presentation_text(item->'id',64)
      or (item->>'id') collate "C" !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
      or (item->>'id')=any(item_ids)
      or not ica_private.valid_lesson_presentation_text(item->'label',300) then
     perform ica_private.fail('Item de checklist inválido ou duplicado.');
    end if;
    item_ids := array_append(item_ids,item->>'id');
   end case;
  end loop;
 end loop;

 if p_presentation?'formula' then
  block := p_presentation->'formula';
  perform ica_private.validate_keys(block,array['label','reference','expression','description']);
  if not ica_private.valid_lesson_presentation_text(block->'label',160)
    or not ica_private.valid_lesson_presentation_text(block->'expression',1000)
    or (block?'reference' and not ica_private.valid_lesson_presentation_text(block->'reference',200))
    or (block?'description' and not ica_private.valid_lesson_presentation_text(block->'description',2000)) then
   perform ica_private.fail('Fórmula inválida.');
  end if;
 end if;
 if p_presentation?'cta' then
  block := p_presentation->'cta';
  perform ica_private.validate_keys(block,array['label','context','title','body','button','url']);
  if (block?'label' and not ica_private.valid_lesson_presentation_text(block->'label',120))
    or (block?'context' and not ica_private.valid_lesson_presentation_text(block->'context',200))
    or not ica_private.valid_lesson_presentation_text(block->'title',160)
    or not ica_private.valid_lesson_presentation_text(block->'body',2000)
    or not ica_private.valid_lesson_presentation_text(block->'button',80) then
   perform ica_private.fail('Texto do banner inválido.');
  end if;
  if not ica_private.valid_lesson_presentation_text(block->'url',2048)
    or (block->>'url') collate "C" !~* '^https://(wa[.]me|((api|chat|web|www)[.])?whatsapp[.]com)([/?#]([A-Za-z0-9._~!$&''()*+,;=:@/?#-]|%[0-9A-Fa-f]{2})*)?$' then
   perform ica_private.fail('Informe um link HTTPS oficial do WhatsApp.');
  end if;
 end if;
end $$;

create function public.app_lesson_presentation(p_lesson_id uuid,p_edit boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := ica_private.actor();
 result jsonb;
begin
 if p_edit is null then perform ica_private.fail('Modo editorial inválido.'); end if;
 if p_edit and not ica_private.is_staff(actor_id,ica_private.entity_roles('lessons')) then
  perform ica_private.fail();
 end if;
 select jsonb_build_object('presentation',p.presentation,'checked_ids',coalesce((
  select jsonb_agg(c.item_id order by i.ord)
  from jsonb_array_elements(p.presentation->'checklist') with ordinality i(item,ord)
  join public.ica_lesson_checklist_items c
   on c.user_id=actor_id and c.lesson_id=p_lesson_id and c.item_id=i.item->>'id'
 ),'[]'::jsonb)) into result
 from public.ica_lessons l left join public.ica_lesson_presentations p on p.lesson_id=l.id
 where l.id=p_lesson_id and ica_private.lesson_access(actor_id,l.id);
 if not found then perform ica_private.fail('Aula indisponível para seu acesso.'); end if;
 return result;
end $$;

create function public.app_admin_save_lesson_presentation(p_lesson_id uuid,p_presentation jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := ica_private.require_role(ica_private.entity_roles('lessons'));
 next_presentation jsonb := nullif(nullif(p_presentation,'null'::jsonb),'{}'::jsonb);
 previous_presentation jsonb;
 lesson_status text;
begin
 if next_presentation is not null then
  perform ica_private.validate_lesson_presentation(next_presentation);
 end if;
 perform ica_private.lock_lesson_engagement_actor(actor_id);
 perform ica_private.throttle(actor_id,'lesson_presentation_save',30);
 -- A mesma linha existe antes da primeira apresentação e serializa edição e marcações.
 select status into lesson_status from public.ica_lessons where id=p_lesson_id for no key update;
 if not found or not ica_private.lesson_access(actor_id,p_lesson_id) then
  perform ica_private.fail('Aula indisponível para seu acesso.');
 end if;
 if not ica_private.is_staff(actor_id,ica_private.entity_roles('lessons')) then perform ica_private.fail(); end if;
 if lesson_status='archived' then perform ica_private.fail('Restaure a aula antes de editar a apresentação.'); end if;
 select presentation into previous_presentation from public.ica_lesson_presentations where lesson_id=p_lesson_id;
 if previous_presentation is distinct from next_presentation then
  delete from public.ica_lesson_checklist_items c where c.lesson_id=p_lesson_id and c.item_id in (
   select value->>'id' from jsonb_array_elements(previous_presentation->'checklist')
   except
   select value->>'id' from jsonb_array_elements(next_presentation->'checklist')
  );
  if next_presentation is null then
   delete from public.ica_lesson_presentations where lesson_id=p_lesson_id;
  else
   insert into public.ica_lesson_presentations(lesson_id,presentation) values (p_lesson_id,next_presentation)
    on conflict (lesson_id) do update set presentation=excluded.presentation;
  end if;
  perform ica_private.audit(actor_id,'update','lesson_presentation',p_lesson_id);
 end if;
 return jsonb_build_object('lesson_id',p_lesson_id);
end $$;

create function public.app_lesson_checklist_item(p_lesson_id uuid,p_item_id text,p_checked boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid := ica_private.lesson_engagement_actor(p_lesson_id);
begin
 if p_checked is null or p_item_id is null or length(p_item_id)>64
   or p_item_id collate "C" !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
  perform ica_private.fail('Informe a marcação de um item válido.');
 end if;
 perform ica_private.lock_lesson_engagement_actor(actor_id);
 perform ica_private.throttle(actor_id,'lesson_checklist',60);
 perform 1 from public.ica_lessons where id=p_lesson_id for share;
 if not ica_private.lesson_access(actor_id,p_lesson_id) then
  perform ica_private.fail('Aula indisponível para seu acesso.');
 end if;
 if not exists (
  select 1 from public.ica_lesson_presentations
  where lesson_id=p_lesson_id and (presentation->'checklist') @> jsonb_build_array(jsonb_build_object('id',p_item_id))
 ) then perform ica_private.fail('Item de checklist indisponível.'); end if;
 if p_checked then
  insert into public.ica_lesson_checklist_items(user_id,lesson_id,item_id) values (actor_id,p_lesson_id,p_item_id)
   on conflict (user_id,lesson_id,item_id) do nothing;
 else
  delete from public.ica_lesson_checklist_items
   where user_id=actor_id and lesson_id=p_lesson_id and item_id=p_item_id;
 end if;
 return jsonb_build_object('checked',p_checked);
end $$;

revoke execute on function ica_private.valid_lesson_presentation_text(jsonb,integer),
 ica_private.validate_lesson_presentation(jsonb)
 from public,anon,authenticated,service_role;

revoke execute on function public.app_lesson_presentation(uuid,boolean),
 public.app_admin_save_lesson_presentation(uuid,jsonb),public.app_lesson_checklist_item(uuid,text,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.app_lesson_presentation(uuid,boolean),
 public.app_admin_save_lesson_presentation(uuid,jsonb),public.app_lesson_checklist_item(uuid,text,boolean)
 to authenticated;

create or replace function public.app_export_data() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := ica_private.actor();
begin
 perform ica_private.throttle(u,'export',2);
 return jsonb_build_object(
  'profile',ica_private.profile_json(u),
  'subscriptions',coalesce((select jsonb_agg(to_jsonb(s)-'order_id') from public.ica_subscriptions s where user_id=u),'[]'::jsonb),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.ica_lesson_progress p where user_id=u),'[]'::jsonb),
  'certificates',coalesce((select jsonb_agg(to_jsonb(c)) from public.ica_certificates c where user_id=u),'[]'::jsonb),
  'posts',coalesce((select jsonb_agg(to_jsonb(p)-'archived_by') from public.ica_posts p where author_id=u),'[]'::jsonb),
  'replies',coalesce((select jsonb_agg(to_jsonb(r)) from public.ica_replies r where author_id=u),'[]'::jsonb),
  'ticket_messages',coalesce((select jsonb_agg(to_jsonb(m)) from public.ica_ticket_messages m where author_id=u),'[]'::jsonb),
  'orders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'amount_cents',amount_cents,'status',status,'created_at',created_at)) from public.ica_orders where user_id=u),'[]'::jsonb),
  'legal_acceptances',coalesce((select jsonb_agg(to_jsonb(a)) from public.ica_legal_acceptances a where user_id=u),'[]'::jsonb),
  'privacy_requests',coalesce((select jsonb_agg(to_jsonb(p)) from public.ica_privacy_requests p where user_id=u),'[]'::jsonb),
  'lesson_favorites',coalesce((
   select jsonb_agg(jsonb_build_object('lesson_id',f.lesson_id) order by f.lesson_id)
   from public.ica_lesson_favorites f where f.user_id=u
  ),'[]'::jsonb),
  'lesson_notes',coalesce((
   select jsonb_agg(jsonb_build_object('id',n.id,'lesson_id',n.lesson_id,'body',n.body,
    'position_seconds',n.position_seconds,'updated_at',n.updated_at) order by n.updated_at desc,n.id)
   from public.ica_lesson_notes n where n.user_id=u
  ),'[]'::jsonb),
  'lesson_checklist_items',coalesce((
   select jsonb_agg(jsonb_build_object('lesson_id',c.lesson_id,'item_id',c.item_id) order by c.lesson_id,c.item_id)
   from public.ica_lesson_checklist_items c where c.user_id=u
  ),'[]'::jsonb),
  'lesson_comments',coalesce((
   select jsonb_agg(jsonb_build_object('id',c.id,'lesson_id',c.lesson_id,'body',c.body,'parent_id',p.id,
    'status',c.status,'is_instructor',c.is_instructor,'created_at',c.created_at) order by c.created_at,c.id)
   from public.ica_lesson_comments c
   left join public.ica_lesson_comments p on p.lesson_id=c.lesson_id and p.id=c.parent_id and p.author_id=u
   where c.author_id=u
  ),'[]'::jsonb)
 );
end $$;

revoke execute on function public.app_export_data() from public,anon,authenticated,service_role;
grant execute on function public.app_export_data() to authenticated;

notify pgrst,'reload schema';
commit;
