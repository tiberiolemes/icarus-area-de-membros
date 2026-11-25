begin;
-- Reauth nonces are ephemeral credentials; native Auth logout deletes their session.
alter table public.reauth_nonces drop constraint reauth_nonces_session_id_fkey;
alter table public.reauth_nonces add constraint reauth_nonces_session_id_fkey foreign key(session_id) references public.app_sessions(id) on delete cascade;
commit;
