begin;

-- A leitura do modelo de certificado confere a sessão do admin, que bloqueia a linha da sessão.
-- Como stable, o PostgREST a chamava numa transação só de leitura e a tela mostrava erro.
alter function public.app_admin_certificate_defaults() volatile;

notify pgrst, 'reload schema';
commit;
