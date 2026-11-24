begin;
-- Reauth nonces are ephemeral credentials; native Auth logout deletes their session.
alter table public.ica_reauth_nonces drop constraint ica_reauth_nonces_session_id_fkey;
alter table public.ica_reauth_nonces add constraint ica_reauth_nonces_session_id_fkey foreign key(session_id) references public.ica_app_sessions(id) on delete cascade;
commit;
