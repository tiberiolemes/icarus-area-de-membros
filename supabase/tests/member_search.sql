\set ON_ERROR_STOP on
begin;
set local statement_timeout='15s';

create temporary table member_search_checks(name text primary key);
grant insert on member_search_checks to anon,authenticated,service_role;

create function pg_temp.ok(p_ok boolean,p_name text) returns void language plpgsql as $$
begin
 if p_ok is distinct from true then raise exception 'FAIL: %',p_name; end if;
 insert into member_search_checks values(p_name);
end $$;

create function pg_temp.denied(p_statement text,p_name text,p_expected text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute p_statement;
 exception when insufficient_privilege then actual := 'permission';
 when sqlstate 'P0001' then actual := sqlerrm;
 end;
 perform pg_temp.ok(actual=p_expected,p_name||' (retorno: '||coalesce(actual,'sem erro')||')');
end $$;

create function pg_temp.id(n integer) returns uuid language sql immutable as $$
 select ('cc270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

create function pg_temp.login(n integer,s integer default null) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object(
  'sub',pg_temp.id(n),'role','authenticated','aal','aal2','session_id',pg_temp.id(10+coalesce(s,n)),
  'app_metadata',jsonb_build_object('role','admin')
 )::text,true)
$$;

insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.id(n),'member-search-'||n||'@example.test',now(),'{"icarus_server_created":true}',
 jsonb_build_object('full_name','Pessoa '||n) from generate_series(1,4) n;
set constraints all immediate;
insert into auth.sessions(id,user_id,created_at,updated_at,aal)
select pg_temp.id(10+n),pg_temp.id(n),now(),now(),'aal2' from generate_series(1,4) n;
update public.profiles set role='instructor' where id=pg_temp.id(3);
update public.profiles set suspended=true where id=pg_temp.id(4);
insert into public.plans(id,name,slug,price_cents,access_months)
values (pg_temp.id(90),'Plano teste','search-fixture-plan',0,1);
insert into public.subscriptions(user_id,plan_id,ends_at,source)
values (pg_temp.id(2),pg_temp.id(90),now()+interval '1 day','courtesy');

insert into public.courses(id,slug,title,description,status,access_mode) values
 (pg_temp.id(100),'search-aberto','Busca Ágil','corpo sigiloso marcador','published','members'),
 (pg_temp.id(101),'search-restrito','Busca Ágil curso restrito','','published','subscribers'),
 (pg_temp.id(102),'search-arquivado','Busca Ágil curso arquivado','','archived','members');
insert into public.modules(id,course_id,slug,title,status,access_mode,plan_ids) values
 (pg_temp.id(110),pg_temp.id(100),'conteudo','Busca Ágil módulo','published','inherit','{}'),
 (pg_temp.id(111),pg_temp.id(101),'conteudo','Busca Ágil módulo restrito','published','inherit','{}'),
 (pg_temp.id(112),pg_temp.id(100),'tem-plano','Busca Ágil módulo por plano','published','plans',array[pg_temp.id(90)]),
 (pg_temp.id(113),pg_temp.id(100),'rascunho','Busca Ágil módulo rascunho','draft','inherit','{}'),
 (pg_temp.id(114),pg_temp.id(102),'conteudo','Busca Ágil módulo filho de arquivado','published','inherit','{}');
insert into public.sections(id,module_id,title,status,order_index) values
 (pg_temp.id(120),pg_temp.id(110),'Primeira seção','published',0),
 (pg_temp.id(121),pg_temp.id(111),'Seção restrita','published',0),
 (pg_temp.id(122),pg_temp.id(112),'Seção por plano','published',0),
 (pg_temp.id(123),pg_temp.id(113),'Seção em módulo rascunho','published',0),
 (pg_temp.id(124),pg_temp.id(110),'Segunda seção','published',1),
 (pg_temp.id(125),pg_temp.id(110),'Seção arquivada','archived',2),
 (pg_temp.id(126),pg_temp.id(114),'Seção em curso arquivado','published',0),
 (pg_temp.id(127),pg_temp.id(110),'Seção rascunho anterior','draft',0);
insert into public.lessons(id,section_id,slug,title,status,is_preview,body,video_id,storage_path) values
 (pg_temp.id(130),pg_temp.id(120),'principal','Aula de Busca Ágil','published',false,'<p>corpo sigiloso marcador</p>','5e000000-0000-4000-8000-0000000000fe','path-privado'),
 (pg_temp.id(131),pg_temp.id(121),'bloqueada','Busca Ágil aula restrita','published',false,'Marcador protegido','5e000000-0000-4000-8000-0000000000fe','path-privado'),
 (pg_temp.id(132),pg_temp.id(121),'previa','Prévia de Busca Ágil','published',true,'',null,null),
 (pg_temp.id(133),pg_temp.id(122),'plano','Busca Ágil aula por plano','published',false,'',null,null),
 (pg_temp.id(134),pg_temp.id(120),'rascunho','Busca Ágil aula rascunho','draft',false,'',null,null),
 (pg_temp.id(135),pg_temp.id(124),'principal','Busca Ágil duplicada posterior','published',false,'Leitura da segunda seção',null,null),
 (pg_temp.id(136),pg_temp.id(125),'secao-arquivada','Busca Ágil em seção arquivada','published',true,'',null,null),
 (pg_temp.id(137),pg_temp.id(123),'modulo-rascunho','Busca Ágil em módulo rascunho','published',true,'',null,null),
 (pg_temp.id(138),pg_temp.id(126),'curso-arquivado','Busca Ágil em curso arquivado','published',true,'',null,null),
 (pg_temp.id(139),pg_temp.id(120),'literal','Aula 100%_real','published',false,'',null,null),
 (pg_temp.id(140),pg_temp.id(120),'parecida','Aula 100XXreal','published',false,'',null,null),
 (pg_temp.id(141),pg_temp.id(127),'mesma-rota','Rota reservada em rascunho','draft',false,'',null,null),
 (pg_temp.id(142),pg_temp.id(124),'mesma-rota','Rota publicada','published',false,'',null,null);
insert into public.lessons(id,section_id,slug,title,status)
select pg_temp.id(200+n),pg_temp.id(120),'paginacao-'||n,'Paginação igual','published' from generate_series(10,31) n;

select pg_temp.ok(
 has_function_privilege('authenticated','public.app_member_search(text,integer)','EXECUTE')
 and not has_function_privilege('anon','public.app_member_search(text,integer)','EXECUTE')
 and not has_function_privilege('service_role','public.app_member_search(text,integer)','EXECUTE'),
 'grants efetivos exclusivos de authenticated'
);
set local role anon;
select pg_temp.denied('select public.app_member_search()','execução anônima','permission');
select pg_temp.denied('select public.app_lesson(pg_temp.id(135))','abertura direta anônima','permission');
set local role service_role;
select pg_temp.denied('select public.app_member_search()','execução service role','permission');
set local role authenticated;
select pg_temp.denied('select public.app_member_search()','credencial ausente','Sessão inválida. Entre novamente.');
select pg_temp.login(1,2);
select pg_temp.denied('select public.app_member_search()','sessão de outro ator','Sessão inválida ou segundo fator pendente.');
select pg_temp.login(4);
select pg_temp.denied('select public.app_member_search()','perfil suspenso','Acesso indisponível.');
select pg_temp.login(1);

select pg_temp.ok(public.app_member_search(U&'\00A0bUSCA áGil\00A0')='{
 "items":[
  {"kind":"course","title":"Busca Ágil","path":"/app/cursos/search-aberto"},
  {"kind":"lesson","title":"Busca Ágil duplicada posterior","path":"/app/cursos/search-aberto/conteudo/~cc270000-0000-4000-8000-000000000135"},
  {"kind":"module","title":"Busca Ágil módulo","path":"/app/cursos/search-aberto/conteudo"},
  {"kind":"lesson","title":"Aula de Busca Ágil","path":"/app/cursos/search-aberto/conteudo/~cc270000-0000-4000-8000-000000000130"},
  {"kind":"lesson","title":"Prévia de Busca Ágil","path":"/app/cursos/search-restrito/conteudo/~cc270000-0000-4000-8000-000000000132"}
 ],"total":5,"page":1,"page_size":20}', 'ordem por relevância, DTO mínimo, prévia, exclusões e claim de papel ignorada');
select pg_temp.ok(public.app_member_search('%_')->'items'='[
 {"kind":"lesson","title":"Aula 100%_real","path":"/app/cursos/search-aberto/conteudo/~cc270000-0000-4000-8000-000000000139"}
]', '% e _ só correspondem literalmente');
select pg_temp.ok(public.app_member_search('corpo sigiloso marcador')->>'total'='0','descrição e corpo fora da busca');
select pg_temp.ok(public.app_member_search('   ')=public.app_member_search('B')
 and public.app_member_search('B')->>'total'='0','consulta em branco ou curta não enumera');
select pg_temp.denied('select public.app_member_search(repeat(''A'',201))','limite da consulta','Busca inválida.');
select pg_temp.denied('select public.app_member_search(null)','consulta nula','Busca inválida.');
select pg_temp.denied('select public.app_member_search(''Busca'',0)','página zero','Busca inválida.');
select pg_temp.denied('select public.app_member_search(''Busca'',100001)','página acima do limite','Busca inválida.');
select pg_temp.denied('select public.app_member_search(''Busca'',null)','página nula','Busca inválida.');
select pg_temp.ok(public.app_member_search(repeat('Z',200),100000)->'items'='[]','fronteiras de termo e página válidas');
select pg_temp.ok(jsonb_array_length(public.app_member_search('paginação')->'items')=20,'limite de vinte itens');
select pg_temp.ok(
 public.app_member_search('paginação',2)='{
  "items":[
   {"kind":"lesson","title":"Paginação igual","path":"/app/cursos/search-aberto/conteudo/~cc270000-0000-4000-8000-000000000230"},
   {"kind":"lesson","title":"Paginação igual","path":"/app/cursos/search-aberto/conteudo/~cc270000-0000-4000-8000-000000000231"}
  ],"total":22,"page":2,"page_size":20}', 'desempate estável pelo caminho e total anterior ao limite');
select pg_temp.ok(public.app_member_search('paginação',3)->'items'='[]','página após o último item');
select pg_temp.ok(public.app_member_search('Rota publicada')->'items'->0->>'path'=
 '/app/cursos/search-aberto/conteudo/~cc270000-0000-4000-8000-000000000142','slug repetido aponta à aula publicada');
select pg_temp.ok(public.app_lesson(pg_temp.id(135))->'lesson'->>'body'='Leitura da segunda seção',
 'ID da busca abre o conteúdo da segunda seção');
select pg_temp.ok((select data->'can_access'='false' and data->'materials'='[]'
 and not (data->'lesson' ?| array['body','video_id','storage_path']) from public.app_lesson(pg_temp.id(131)) as data),
 'consulta direta a aula bloqueada omite conteúdo e materiais');
select pg_temp.denied('select public.app_lesson(pg_temp.id(141))','consulta direta a aula rascunho','Aula indisponível.');

select pg_temp.login(2);
select pg_temp.ok(public.app_member_search('busca ágil')->>'total'='10','assinatura libera o curso, módulos e aulas conforme os gates');
select pg_temp.login(3);
select pg_temp.ok(public.app_member_search('busca ágil')->>'total'='9','instrutor segue os gates distintos de módulo e aula');
select pg_temp.ok(public.app_member_search('Rota publicada')->>'total'='1','rascunho com mesmo slug não exclui o resultado publicado para a equipe');

reset role;
update public.subscriptions set revoked_at=now() where user_id=pg_temp.id(2);
update public.app_sessions set revoked_at=now() where id=pg_temp.id(11);
insert into public.rate_limits(actor_id,bucket,window_start,count)
values (pg_temp.id(2),'member_search',date_trunc('minute',now()),59)
on conflict (actor_id,bucket,window_start) do update set count=excluded.count;
set local role authenticated;
select pg_temp.login(1);
select pg_temp.denied('select public.app_member_search(''Busca'')','sessão revogada','Sessão expirada. Entre novamente.');
select pg_temp.login(2);
select pg_temp.ok(public.app_member_search('busca ágil')->>'total'='5','revogação de assinatura reavalia o acesso');
select pg_temp.denied('select public.app_member_search(''Busca'')','limite por ator','Muitas solicitações. Aguarde um minuto.');

reset role;
select count(*) from member_search_checks;
rollback;
