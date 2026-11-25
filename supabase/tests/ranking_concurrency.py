"""Run both lock orders against migrations through 033 on the offline certificate QA database."""

from uuid import uuid4

from certificate_profile_lock_concurrency import Session, isolated_psql, sql


def run_race(psql, kind, admin_first, rollback=False):
    author, actor, admin, actor_sid, admin_sid, space, post = [uuid4() for _ in range(7)]
    nonce = uuid4().hex
    people = f"('{author}','{actor}','{admin}')"
    status = "pending" if kind == "post" else "approved"
    actor_role = "moderator" if kind == "post" else "member"
    sql(psql, f"""
      begin;
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
      select id,id||'@example.test',now(),'{{"icarus_server_created":true}}','{{"full_name":"Nome inicial"}}'
      from (values ('{author}'::uuid),('{actor}'::uuid),('{admin}'::uuid)) fixture(id);
      set constraints all immediate;
      update public.profiles set role='admin' where id='{admin}';
      update public.profiles set role='{actor_role}' where id='{actor}';
      insert into auth.sessions(id,user_id,created_at,updated_at,aal) values
        ('{actor_sid}','{actor}',now(),now(),'aal2'), ('{admin_sid}','{admin}',now(),now(),'aal2');
      insert into public.app_sessions(id,user_id,expires_at) values
        ('{actor_sid}','{actor}',now()+interval '5 minutes'),
        ('{admin_sid}','{admin}',now()+interval '5 minutes');
      insert into public.reauth_nonces(token_hash,actor_id,session_id,expires_at)
      values (encode(extensions.digest('{nonce}','sha256'),'hex'),'{admin}','{admin_sid}',now()+interval '5 minutes');
      insert into public.spaces(id,name,status,access_mode) values ('{space}','Fórum teste','published','members');
      insert into public.posts(id,space_id,author_id,title,body,status)
      values ('{post}','{space}','{author}','Post de teste','Conteúdo de teste','{status}');
      commit;
    """)

    relation = f"source_id='{post}' and recipient_id='{author}' and kind='{kind}'"
    expected_actor = actor if kind == "like" else author
    if kind == "post":
        effect = f"(select status='approved' from public.posts where id='{post}')"
    else:
        effect = f"exists(select from public.votes where post_id='{post}' and actor_id='{actor}')"

    def check_visible(expected):
        assert sql(psql, f"""
          select ({effect}) is {str(expected).lower()} and
            (select count(*) from app_private.ranking_events where {relation})={int(expected)} and
            not exists(select from app_private.ranking_events where {relation} and actor_id<>'{expected_actor}');
        """) == "t"

    def rename(session):
        session.start(f"""select public.app_admin_member('{author}', '{{"full_name":"Nome editado"}}',
                      'Edição de teste','{nonce}')""")
        assert session.result()["full_name"] == "Nome editado"

    def act(session, active=True):
        if kind == "post":
            decision, state = ("approve", "approved") if active else ("hide", "hidden")
            session.start(f"select public.app_moderate('post','{post}','{decision}','Decisão de teste')")
            assert session.result()["status"] == state
        else:
            session.start(f"select public.app_vote('post','{post}')")
            assert session.result()["voted"] is active

    try:
        with Session(psql, admin, admin_sid) as editor, Session(psql, actor, actor_sid) as other:
            editor.send("set local lock_timeout='1s';")
            other.send("set local lock_timeout='1s';")
            if admin_first:
                rename(editor)
                act(other)
            else:
                act(other)
                rename(editor)
                editor.finish()
            check_visible(False)
            other.finish("rollback" if rollback else "commit")
            check_visible(not rollback)
            if not rollback:
                event_time = f"select occurred_at from app_private.ranking_events where {relation}"
                first = sql(psql, event_time)
                # Cada chamada HTTP tem sua própria transação, mesmo ao repetir a ação.
                for active in (False, True):
                    with Session(psql, actor, actor_sid) as retry:
                        retry.send("set local lock_timeout='1s';")
                        act(retry, active)
                        retry.finish()
                check_visible(True)
                assert sql(psql, event_time) == first
            if admin_first:
                assert sql(psql, f"select full_name from public.profiles where id='{author}'") == "Nome inicial"
                editor.finish()
            assert sql(psql, f"select full_name from public.profiles where id='{author}'") == "Nome editado"
    finally:
        sql(psql, f"""
          begin;
          delete from public.votes where post_id='{post}';
          delete from public.moderation_events where target_id='{post}';
          delete from public.audit_events where actor_id in {people};
          delete from public.rate_limits where actor_id in {people};
          delete from public.posts where id='{post}';
          delete from public.spaces where id='{space}';
          delete from public.reauth_nonces where actor_id in {people};
          delete from public.app_sessions where user_id in {people};
          delete from auth.sessions where user_id in {people};
          delete from public.profiles where id in {people};
          delete from auth.users where id in {people};
          commit;
        """)
        assert sql(psql, f"""
          select not exists(select from auth.users where id in {people})
            and not exists(select from app_private.ranking_subjects where profile_id in {people})
            and not exists(select from app_private.ranking_events where recipient_id in {people} or actor_id in {people});
        """) == "t"


def main():
    psql = isolated_psql()
    for kind in ("post", "like"):
        for admin_first, rollback in ((True, False), (False, False), (True, True)):
            run_race(psql, kind, admin_first, rollback)
            print(f"{kind}: admin_first={admin_first} rollback={rollback}; verified and cleaned")


if __name__ == "__main__":
    main()
