\set ON_ERROR_STOP on
begin;

create temp table throttle_checks(name text primary key);
grant insert on throttle_checks to anon,authenticated,service_role;

create function pg_temp.ok(condition boolean,label text) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %',label; end if;
 insert into throttle_checks values(label);
end $$;
create function pg_temp.denied(statement text,label text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when insufficient_privilege or sqlstate 'P0001' then perform pg_temp.ok(true,label); return;
 end;
 raise exception 'FAIL (autorizou): %',label;
end $$;
-- Simula a virada da janela de um minuto do throttle sem esperar o relógio.
create function pg_temp.next_window(bucket text) returns void language sql as $$
 update public.rate_limits set window_start=window_start-interval '1 minute' where rate_limits.bucket=next_window.bucket
$$;

select pg_temp.ok(not has_function_privilege(role,'public.app_checkout_throttle(uuid,text,text)','EXECUTE'),'checkout throttle fechado para '||role)
from unnest(array['anon','authenticated']) role;
select pg_temp.ok(not has_function_privilege(role,'public.app_reauth_throttle(uuid)','EXECUTE'),'reauth throttle fechado para '||role)
from unnest(array['anon','authenticated']) role;
select pg_temp.ok(has_function_privilege('service_role','public.app_checkout_throttle(uuid,text,text)','EXECUTE')
 and has_function_privilege('service_role','public.app_reauth_throttle(uuid)','EXECUTE'),'Edge executa os dois throttles');

set local role anon;
select pg_temp.denied($$select public.app_checkout_throttle(null,'203.0.113.7','visitante@demo.icarus.invalid')$$,'anon não chama o throttle do checkout');
reset role;
set local role authenticated;
select pg_temp.denied($$select public.app_reauth_throttle('03300000-0000-4000-8000-000000000001')$$,'authenticated não chama o throttle da reautenticação');
reset role;

set local role service_role;
-- Visitante: cinco tentativas por minuto do mesmo IP, trocando o email a cada uma como um script faria.
select public.app_checkout_throttle(null,'203.0.113.7','visitante'||n||'@demo.icarus.invalid') from generate_series(1,5) n;
select pg_temp.denied($$select public.app_checkout_throttle(null,'203.0.113.7','visitante6@demo.icarus.invalid')$$,'sexta tentativa do mesmo IP no minuto é recusada');
select public.app_checkout_throttle(null,'198.51.100.9','outro@demo.icarus.invalid');
select pg_temp.ok(true,'outro IP continua comprando');
-- Mesmo email vindo de IPs diferentes: três por minuto.
select public.app_checkout_throttle(null,'192.0.2.'||n,'repetido@demo.icarus.invalid') from generate_series(1,3) n;
select pg_temp.denied($$select public.app_checkout_throttle(null,'192.0.2.99','Repetido@Demo.Icarus.Invalid')$$,'quarto pedido do mesmo email no minuto é recusado, sem diferenciar maiúsculas');
-- Comprador logado também conta pelo próprio ID.
select public.app_checkout_throttle('03300000-0000-4000-8000-000000000002','192.0.3.'||n,'conta'||n||'@demo.icarus.invalid') from generate_series(1,5) n;
select pg_temp.denied($$select public.app_checkout_throttle('03300000-0000-4000-8000-000000000002','192.0.3.99','conta99@demo.icarus.invalid')$$,'conta logada limitada pelo ID');
reset role;
select pg_temp.next_window('checkout_ip');
set local role service_role;
select public.app_checkout_throttle(null,'203.0.113.7','depois@demo.icarus.invalid');
select pg_temp.ok(true,'mesmo IP volta a comprar na janela seguinte');

-- Reautenticação: cinco tentativas de senha por minuto para o mesmo usuário.
select public.app_reauth_throttle('03300000-0000-4000-8000-000000000001') from generate_series(1,5);
select pg_temp.denied($$select public.app_reauth_throttle('03300000-0000-4000-8000-000000000001')$$,'sexta tentativa de senha no minuto é recusada');
select public.app_reauth_throttle('03300000-0000-4000-8000-000000000003');
select pg_temp.ok(true,'outro usuário não é afetado');
select pg_temp.denied($$select public.app_reauth_throttle(null)$$,'reautenticação sem usuário é recusada');
reset role;
select pg_temp.next_window('reauth');
set local role service_role;
select public.app_reauth_throttle('03300000-0000-4000-8000-000000000001');
select pg_temp.ok(true,'usuário volta a confirmar a senha na janela seguinte');
reset role;

select count(*) from throttle_checks;
rollback;
