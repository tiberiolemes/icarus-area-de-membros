"""Exercise the real RPCs with synthetic claims in a disposable, offline PostgreSQL.

Apply migrations through 026 and 028 to an isolated container named
icarus-certificate-profile-lock-qa with --rm --network none and tmpfs PGDATA.
Run with python3; optionally pass one flow name: issue, complete, playback.
"""
import json
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
from uuid import uuid4


CONTAINER = "icarus-certificate-profile-lock-qa"
RETRY = "Sua conta está sendo atualizada. Tente novamente em instantes."
FLOWS = ("issue", "complete", "playback")


def command(args):
    return subprocess.check_output(args, text=True, timeout=10).strip()


def isolated_psql():
    endpoint = command(["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
    if not endpoint.startswith("unix://") or not Path(endpoint[7:]).is_socket():
        raise RuntimeError("A local Docker socket is required")
    docker = ["docker", "--host", endpoint]
    host = json.loads(command(docker + ["inspect", CONTAINER, "--format", "{{json .HostConfig}}"]))
    if host["NetworkMode"] != "none" or not host["AutoRemove"] or host["PortBindings"] or host["Binds"] or (
        set(host.get("Tmpfs") or {}) != {"/var/lib/postgresql/data"}
    ):
        raise RuntimeError("The database must be disposable, offline, and on tmpfs")
    mounts = json.loads(command(docker + ["inspect", CONTAINER, "--format", "{{json .Mounts}}"]))
    if any(m["Type"] != "tmpfs" for m in mounts):
        raise RuntimeError("Unexpected persistent mount")
    return docker + ["exec", "-i", CONTAINER, "psql", "-XqAt", "-U", "postgres", "-d", "postgres",
                     "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]


def sql(psql, statement):
    result = subprocess.run(psql, input=statement, text=True, capture_output=True, timeout=12)
    if result.returncode:
        raise RuntimeError(result.stderr.splitlines()[0])
    return result.stdout.strip()


class Session:
    def __init__(self, psql, user=None, sid=None, deadlock_timeout="5s"):
        self.process = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.STDOUT, text=True)
        self.lines = queue.Queue()
        threading.Thread(target=self.read, daemon=True).start()
        self.send(f"begin; set local statement_timeout='9s'; set local deadlock_timeout='{deadlock_timeout}';")
        if user is not None:
            claims = json.dumps({"sub": str(user), "session_id": str(sid), "role": "authenticated", "aal": "aal2"})
            self.send(f"set local role authenticated; set local request.jwt.claims='{claims}';")
        self.start("select pg_backend_pid()")
        self.pid = self.result()

    def read(self):
        for line in self.process.stdout:
            self.lines.put(line.strip())
        self.lines.put(None)

    def send(self, query):
        self.process.stdin.write(query + "\n")
        self.process.stdin.flush()

    def start(self, query):
        self.send(query + ";\n\\echo finished")

    def result(self, error=None):
        received = []
        deadline = time.monotonic() + 11
        while True:
            line = self.lines.get(timeout=max(0.01, deadline - time.monotonic()))
            if line is None or line == "finished":
                break
            if line:
                received.append(line)
        if error:
            code, message = error
            if line is None and any(f"ERROR:  {code}:" in text and message in text for text in received):
                return
            raise AssertionError(f"expected {code} {message}; got {received[:1]}")
        if line is None:
            raise AssertionError(f"SQL stopped: {received[:1]}")
        return json.loads(received[-1]) if received else None

    def finish(self, action="commit"):
        self.start(action)
        self.result()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.process.stdin.close()
        self.process.wait(timeout=12)


def wait_for(psql, waiter, blocker):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if sql(psql, f"select {blocker.pid}=any(pg_blocking_pids({waiter.pid}));") == "t":
            return
        time.sleep(0.05)
    raise AssertionError("Expected PostgreSQL blocker was not observed")


class Fixture:
    def __init__(self, psql, flow):
        self.psql, self.flow = psql, flow
        self.member, self.admin, self.member_sid, self.admin_sid = [uuid4() for _ in range(4)]
        self.course, self.module, self.section, self.lesson = [uuid4() for _ in range(4)]
        self.nonce = uuid4().hex

    def seed(self):
        sql(self.psql, f"""
          begin;
          insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
          select id,id||'@example.test',now(),'{{"icarus_server_created":true}}','{{"full_name":"Ator de teste"}}'
          from (values ('{self.member}'::uuid),('{self.admin}'::uuid)) fixture(id);
          set constraints all immediate;
          update public.profiles set role='admin' where id='{self.admin}';
          insert into auth.sessions(id,user_id,created_at,updated_at,aal) values
            ('{self.member_sid}','{self.member}',now(),now(),'aal2'),
            ('{self.admin_sid}','{self.admin}',now(),now(),'aal2');
          insert into public.app_sessions(id,user_id,expires_at) values
            ('{self.member_sid}','{self.member}',now()+interval '5 minutes'),
            ('{self.admin_sid}','{self.admin}',now()+interval '5 minutes');
          insert into public.reauth_nonces(token_hash,actor_id,session_id,expires_at)
          values (encode(extensions.digest('{self.nonce}','sha256'),'hex'),
            '{self.admin}','{self.admin_sid}',now()+interval '5 minutes');
          insert into public.courses(id,slug,title,status,access_mode,certificate_enabled,signer_name,signer_title)
          values ('{self.course}','race-{self.course}','Curso teste','published','members',true,'Pessoa Responsável','Instrutora');
          insert into public.modules(id,course_id,slug,title,status)
          values ('{self.module}','{self.course}','modulo','Módulo','published');
          insert into public.sections(id,module_id,title,status) values ('{self.section}','{self.module}','Seção','published');
          insert into public.lessons(id,section_id,slug,title,duration_seconds,status)
          values ('{self.lesson}','{self.section}','aula','Aula','600','published');
          {"insert into public.lesson_progress(user_id,lesson_id,position_seconds,completed_at) "
           f"values ('{self.member}','{self.lesson}',600,now());" if self.flow == "issue" else ""}
          commit;
        """)

    @property
    def request(self):
        if self.flow == "issue":
            return f"select public.app_issue_certificate('{self.course}')"
        if self.flow == "complete":
            return f"select public.app_progress('{self.lesson}',600,true)"
        return f"select public.app_progress('{self.lesson}',42,false)"

    @property
    def suspend(self):
        return (f"select public.app_admin_member('{self.member}','{{\"suspended\":true}}',"
                f"'Suspensão de teste','{self.nonce}')")

    def state(self):
        return json.loads(sql(self.psql, f"""
          select jsonb_build_object(
            'progress',(select jsonb_build_array(position_seconds,completed_at is not null)
                        from public.lesson_progress where user_id='{self.member}'),
            'certificates',(select count(*) from public.certificates where user_id='{self.member}'),
            'notifications',(select count(*) from public.notifications
                              where user_id='{self.member}' and event_key='certificate_issued'),
            'suspended',(select suspended from public.profiles where id='{self.member}'),
            'revoked',(select revoked_at is not null from public.app_sessions where id='{self.member_sid}'));
        """))

    def cleanup(self):
        users = f"('{self.member}','{self.admin}')"
        sql(self.psql, f"""
          begin;
          delete from public.notifications where user_id in {users};
          delete from public.certificates where user_id in {users};
          delete from public.lesson_progress where user_id in {users};
          delete from public.audit_events where actor_id in {users};
          delete from public.reauth_nonces where actor_id in {users};
          delete from public.app_sessions where user_id in {users};
          delete from auth.sessions where user_id in {users};
          delete from public.lessons where id='{self.lesson}';
          delete from public.sections where id='{self.section}';
          delete from public.modules where id='{self.module}';
          delete from public.courses where id='{self.course}';
          delete from public.profiles where id in {users};
          delete from auth.users where id in {users};
          commit;
        """)


def run_race(psql, flow, admin_first, rollback_member=False):
    fixture = Fixture(psql, flow)
    fixture.seed()
    try:
        initial = fixture.state()
        with Session(psql, fixture.admin, fixture.admin_sid) as admin, (
            Session(psql, fixture.member, fixture.member_sid, deadlock_timeout="200ms")
        ) as member:
            if admin_first:
                member.start("select public.app_touch_session()")
                member.result()
                admin.start(fixture.suspend)
                wait_for(psql, admin, member)
                member.start(fixture.request)
                member.result(error=("P0001", RETRY))
            else:
                if flow == "issue":
                    with Session(psql) as editor:
                        editor.start(f"select 1 from public.courses where id='{fixture.course}' for update")
                        editor.result()
                        member.start(fixture.request)
                        wait_for(psql, member, editor)
                        admin.start(fixture.suspend)
                        wait_for(psql, admin, member)
                        editor.finish("rollback")
                else:
                    member.start(fixture.request)
                result = member.result()
                if flow != "issue":
                    admin.start(fixture.suspend)
                    wait_for(psql, admin, member)
                if flow == "playback":
                    assert result["position_seconds"] == 42 and result["completed"] is False
                    assert result["certificate_code"] is None
                else:
                    assert result["certificate_code"]
                    member.start(f"select public.app_issue_certificate('{fixture.course}')")
                    assert member.result()["certificate_code"] == result["certificate_code"]
                member.finish("rollback" if rollback_member else "commit")
            assert admin.result()["suspended"] is True
            admin.finish()
        expected = {**initial, "suspended": True, "revoked": True}
        if not (admin_first or rollback_member):
            if flow in ("issue", "complete"):
                expected.update(progress=[600, True], certificates=1, notifications=1)
            else:
                expected.update(progress=[42, False])
        assert fixture.state() == expected, f"{flow}: progress, certificate, notification or suspension diverged"
        with Session(psql, fixture.member, fixture.member_sid) as member:
            member.start(fixture.request)
            member.result(error=("P0001", "Acesso indisponível."))
    finally:
        fixture.cleanup()


def main():
    flows = tuple(sys.argv[1:]) or FLOWS
    if any(flow not in FLOWS for flow in flows):
        raise ValueError(f"Choose from {FLOWS}")
    psql = isolated_psql()
    for flow in flows:
        run_race(psql, flow, admin_first=True)
        print(f"{flow} admin-first: observed wait, retry and no partial writes")
        run_race(psql, flow, admin_first=False)
        print(f"{flow} member-first: observed wait, persisted result, revoked session")
    if "complete" in flows:
        run_race(psql, "complete", admin_first=False, rollback_member=True)
        print("complete rollback: observed wait, no progress, certificate or notification")


if __name__ == "__main__":
    main()
