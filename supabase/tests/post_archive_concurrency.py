"""Finite SQL races on isolated QA only; synthetic claims are not Native Auth/HTTP UAT.

Requires migrations 19/20 with SRC-01 installed by the coordinator. No DDL is executed.
Storage metadata fixtures exercise SQL finalization, not file bytes or magic checks.
"""
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import threading
import time
import uuid


CONTAINER = "supabase_db_icarus-courses-install-qa"
ROOT = Path(__file__).resolve().parents[2]
PSQL = ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-U", "postgres",
        "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"]
LIMITS = "set statement_timeout='8s';set lock_timeout='8s';set idle_in_transaction_session_timeout='15s';"


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise RuntimeError("Destination inspection failed")
    return result.stdout.strip()


def guard_destination():
    if os.environ.get("ICARUS_DB_CONTAINER", CONTAINER) != CONTAINER:
        raise RuntimeError("Only isolated QA is allowed")
    if os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_TLS_VERIFY"):
        raise RuntimeError("Docker host overrides are not allowed")
    checkout = command(["git", "-C", str(ROOT), "rev-parse", "--show-toplevel"])
    package = json.loads((ROOT / "package.json").read_text())
    config = (ROOT / "supabase/config.toml").read_text()
    if Path(checkout).resolve() != ROOT or package.get("name") != "icarus-area-de-membros" or not re.search(
        r'^project_id\s*=\s*"icarus-courses-local"\s*$', config, re.MULTILINE
    ):
        raise RuntimeError("Unexpected project root")
    endpoint = json.loads(command(["docker", "context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]))
    if not endpoint.startswith("unix://") or not Path(endpoint[7:]).is_socket():
        raise RuntimeError("A local Docker context is required")
    identity = json.loads(command([
        "docker", "inspect", CONTAINER, "--format",
        '{"name":{{json .Name}},"ports":{{json .NetworkSettings.Ports}},"mounts":{{json .Mounts}}}',
    ]))
    if identity["name"] != "/" + CONTAINER or identity["ports"] != {
        "5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "58622"}]
    }:
        raise RuntimeError("Unexpected database name or bind")
    data = [m for m in identity["mounts"] if m["Destination"] == "/var/lib/postgresql/data"]
    if len(data) != 1 or data[0].get("Type") != "volume" or data[0].get("Name") != CONTAINER:
        raise RuntimeError("Unexpected database volume")


class RaceCheck:
    def __init__(self):
        self.tag = uuid.uuid4().hex
        self.users = [str(uuid.uuid4()) for _ in range(2)]
        self.sids = [str(uuid.uuid4()) for _ in range(3)]  # A1/A2/B differ in every race.
        self.space = str(uuid.uuid4())
        self.posts = [str(uuid.uuid4()) for _ in range(8)]
        self.replies = [str(uuid.uuid4()) for _ in self.posts]
        self.uploads = [str(uuid.uuid4()) for _ in range(3)]
        self.paths = [f"post-image/{post}/{upload}.png" for post, upload in
                      zip([self.posts[0], self.posts[4], self.posts[5]], self.uploads)]
        self.assertions = self.waits = self.cases = 0
        self.fixture_attempted = False
        self.nonces = [uuid.uuid4().hex for _ in range(2)]
        self.connections = []
        directory = ROOT / ".local"
        directory.mkdir(mode=0o700, exist_ok=True)
        self.log_path = directory / f"post-archive-race-{self.tag}.log"
        self.log = os.fdopen(os.open(self.log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w")

    def check(self, ok, label):
        self.log.write(f"{label}={str(bool(ok)).lower()}\n")
        self.log.flush()
        if not ok:
            raise RuntimeError(label)
        self.assertions += 1

    def sql(self, statement, readonly=False):
        transaction = "begin read only;" if readonly else "begin;"
        result = subprocess.run(PSQL, input=LIMITS + transaction + statement + ";commit;",
                                capture_output=True, text=True, timeout=15)
        # Never log SQL/claims, user data or raw database errors.
        if result.returncode:
            state = re.search(r"ERROR:\s+([A-Z0-9]{5})\b", result.stderr)
            self.log.write(f"sql_failure_state={state.group(1) if state else 'unknown'}\n")
            self.log.flush()
            raise RuntimeError("SQL command failed")
        return [line for line in result.stdout.splitlines() if line]

    def boolean(self, expression):
        return self.sql("select " + expression, readonly=True) == ["t"]

    def setup(self):
        self.check(self.boolean("to_regprocedure('public.app_archive_post(uuid,boolean)') is not null "
                   "and coalesce((select lower(prosrc) like '%for key share nowait%' from pg_proc "
                   "where oid=to_regprocedure('public.app_archive_post(uuid,boolean)')),false) "
                   "and (select count(*)=2 from information_schema.columns where table_schema='public' "
                   "and table_name='ica_posts' and (column_name,data_type) in "
                   "(('archived_by','uuid'),('archive_source','text')))"), "schema_ready")
        users = ",".join(
            f"('{user}','archive-{self.tag}-{n}@example.test',now(),"
            f"'{{\"icarus_server_created\":true,\"icarus_archive_race\":\"{self.tag}\"}}',"
            f"'{{\"full_name\":\"DEMONSTRAÇÃO corrida {self.tag}\"}}')"
            for n, user in enumerate(self.users))
        sessions = ",".join(f"('{sid}','{user}',now(),now(),'aal2')" for sid, user in
                            zip(self.sids, [self.users[0], self.users[0], self.users[1]]))
        app_sessions = ",".join(f"('{sid}','{user}',now()+interval '1 hour')" for sid, user in
                                zip(self.sids, [self.users[0], self.users[0], self.users[1]]))
        posts = ",".join(f"('{p}','{self.space}','{self.users[0]}','DEMONSTRAÇÃO {self.tag}',"
                         f"'DEMONSTRAÇÃO texto preservado {self.tag}','approved')" for p in self.posts)
        replies = ",".join(f"('{r}','{p}','{self.users[1]}','DEMONSTRAÇÃO resposta {self.tag}','approved')"
                           for p, r in zip(self.posts, self.replies))
        uploads = ",".join(
            f"('{u}','{self.users[0]}','post-image','{p}','{p}','{path}',"
            f"'DEMONSTRACAO.png','image/png',100,'{state}')"
            for u, p, path, state in zip(self.uploads, [self.posts[0], self.posts[4], self.posts[5]],
                                         self.paths, ["ready", "pending", "pending"]))
        self.fixture_attempted = True
        self.sql(f"""
          insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values {users};
          set constraints all immediate;
          update public.ica_profiles set role='admin' where id='{self.users[1]}';
          insert into auth.sessions(id,user_id,created_at,updated_at,aal) values {sessions};
          insert into public.ica_app_sessions(id,user_id,expires_at) values {app_sessions};
          insert into public.ica_reauth_nonces(token_hash,actor_id,session_id,expires_at) values
            (encode(extensions.digest('{self.nonces[0]}','sha256'),'hex'),'{self.users[1]}','{self.sids[2]}',now()+interval '5 minutes'),
            (encode(extensions.digest('{self.nonces[1]}','sha256'),'hex'),'{self.users[1]}','{self.sids[2]}',now()+interval '5 minutes');
          insert into public.ica_spaces(id,name,status,access_mode) values('{self.space}','DEMONSTRAÇÃO {self.tag}','published','members');
          insert into public.ica_posts(id,space_id,author_id,title,body,status) values {posts};
          insert into public.ica_replies(id,post_id,author_id,body,status) values {replies};
          insert into public.ica_votes(actor_id,post_id) values('{self.users[1]}','{self.posts[0]}');
          insert into public.ica_votes(actor_id,reply_id) values('{self.users[0]}','{self.replies[0]}');
          insert into public.ica_uploads(id,actor_id,kind,resource_id,post_id,path,file_name,content_type,size_bytes,state) values {uploads};
          insert into storage.objects(bucket_id,name,metadata) select 'icarus-private',path,'{{"size":100,"mimetype":"image/png"}}'::jsonb
            from public.ica_uploads where id in ({quoted(self.uploads)});
          update public.ica_posts set image_path='{self.paths[0]}' where id='{self.posts[0]}'
        """)

    def archive(self, index, archived=True):
        return f"public.app_archive_post('{self.posts[index]}',{str(archived).lower()})"

    def finalize(self, index):
        return f"public.app_upload_finalize('{self.users[0]}','{self.uploads[index]}')"

    def observe_wait(self, blocker, waiter):
        deadline = time.monotonic() + 5
        blocked = False
        while time.monotonic() < deadline:
            blocked = self.boolean(f"coalesce((select wait_event_type='Lock' and {blocker.pid}=any(pg_blocking_pids(pid)) "
                                   f"from pg_stat_activity where pid={waiter.pid} and application_name='{waiter.name}'),false)")
            if blocked or waiter.process.poll() is not None:
                break
            time.sleep(0.05)
        self.check(blocked, "observed_blocking_pid")
        self.waits += 1

    def race(self, first, second, first_session=0, second_session=1, service_first=False,
             service_second=False, denied=False):
        one = Session(self, first_session, service_first)
        two = Session(self, second_session, service_second)
        try:
            self.check(one.sid != two.sid and one.pid != two.pid, "distinct_sessions")
            one.start(first)
            result_one = one.result()
            two.start(second)
            self.observe_wait(one, two)
            one.commit()
            result_two = two.result(denied=denied)
            if not denied:
                two.commit()
            self.cases += 1
            return result_one, result_two
        finally:
            two.close()
            one.close()

    def run(self):
        self.setup()
        original = self.sql(f"select md5(row(id,space_id,author_id,title,body,image_path,created_at)::text) from public.ica_posts where id='{self.posts[0]}'", readonly=True)
        first, second = self.race(self.archive(0), self.archive(0))
        expected = {"id": self.posts[0], "status": "archived", "archived": True}
        self.check(first == second == expected, "duplicate_archive_results")
        self.check(self.boolean(f"(select count(*)=1 from public.ica_audit_events where target_type='posts' and target_id='{self.posts[0]}' and action='archive')"), "duplicate_audit_once")
        self.check(original == self.sql(f"select md5(row(id,space_id,author_id,title,body,image_path,created_at)::text) from public.ica_posts where id='{self.posts[0]}'", readonly=True), "duplicate_content_preserved")
        self.check(self.boolean(f"(select count(*)=1 from public.ica_replies where post_id='{self.posts[0]}') and "
                               f"(select count(*)=1 from public.ica_votes where post_id='{self.posts[0]}') and "
                               f"(select count(*)=1 from public.ica_votes where reply_id='{self.replies[0]}')"), "duplicate_relations_preserved")
        actions = [
            (1, f"public.app_reply('{self.posts[1]}','DEMONSTRAÇÃO resposta nova')", 2, False),
            (2, f"public.app_vote('reply','{self.replies[2]}')", 2, False),
            (3, f"public.app_upload_access('{self.users[0]}','post-image','{self.posts[3]}','DEMONSTRACAO.png','image/png',100)", 1, True),
        ]
        for index, operation, session, service in actions:
            result, _ = self.race(self.archive(index), operation, second_session=session,
                                  service_second=service, denied=True)
            self.check(result["status"] == "archived" and self.boolean(
                f"(select status='archived' from public.ica_posts where id='{self.posts[index]}') and "
                f"(select count(*)=1 from public.ica_replies where post_id='{self.posts[index]}') and "
                f"not exists(select 1 from public.ica_votes where reply_id='{self.replies[index]}') and "
                f"not exists(select 1 from public.ica_uploads where post_id='{self.posts[index]}')"), "archive_winner_no_interaction")
        self.race(self.archive(4), self.finalize(1), service_second=True, denied=True)
        self.check(self.boolean(f"(select status='archived' and image_path is null from public.ica_posts where id='{self.posts[4]}') and "
                               f"(select state='pending' from public.ica_uploads where id='{self.uploads[1]}')"), "archive_winner_no_finalize")
        finalized, archived = self.race(self.finalize(2), self.archive(5), first_session=1,
                                        second_session=0, service_first=True)
        self.check(finalized["state"] == "ready" and archived["status"] == "archived" and self.boolean(
            f"(select status='archived' and previous_status='pending' and image_path='{self.paths[2]}' from public.ica_posts where id='{self.posts[5]}')"), "finalize_winner_previous_pending")
        restore = Session(self, 0, False)
        try:
            restore.start(self.archive(5, False))
            result = restore.result()
            restore.commit()
            self.check(result["status"] == "pending" and not result["archived"] and self.boolean(
                f"(select status='pending' from public.ica_posts where id='{self.posts[5]}')"), "restore_not_approved")
        finally:
            restore.close()
        self.suspension_races()

    def suspension_races(self):
        def suspend(nonce):
            return (f"public.app_admin_member('{self.users[0]}','{{\"suspended\":true}}'::jsonb,"
                    f"'DEMONSTRAÇÃO corrida {self.tag}','{nonce}')")

        author, admin = Session(self, 0, False), Session(self, 2, False)
        try:
            # Force the old cycle: actor holds A's preexisting session, then admin
            # holds A's profile and waits on that session before archive continues.
            author.send("reset role;select ica_private.actor();set local role authenticated;\n\\echo actor_ready\n")
            self.check(author.until("actor_ready") == [self.users[0]], "author_session_locked")
            admin.start(suspend(self.nonces[0]))
            self.observe_wait(author, admin)
            author.start(self.archive(6))
            author.result(denied=True)  # Only P0001 is accepted; 40P01 fails.
            suspended = admin.result()
            admin.commit()
            self.check(suspended["suspended"] and self.boolean(
                f"(select suspended from public.ica_profiles where id='{self.users[0]}') and "
                f"(select bool_and(revoked_at is not null) from public.ica_app_sessions where user_id='{self.users[0]}') and "
                f"(select status='approved' and archived_by is null from public.ica_posts where id='{self.posts[6]}') and "
                f"not exists(select 1 from public.ica_audit_events where target_id='{self.posts[6]}') and "
                f"(select count(*)=1 from public.ica_audit_events where actor_id='{self.users[1]}' and target_id='{self.users[0]}' and action='member-change')"
            ), "nowait_releases_session_without_partial_archive")
            self.cases += 1
        finally:
            admin.close()
            author.close()

        # Reset only our fixture to stage the inverse order with its second nonce.
        self.sql(f"update public.ica_profiles set suspended=false where id='{self.users[0]}';"
                 f"update public.ica_app_sessions set revoked_at=null where user_id='{self.users[0]}'")
        author, admin = Session(self, 0, False), Session(self, 2, False)
        try:
            author.start(self.archive(7))
            archived = author.result()
            admin.start(suspend(self.nonces[1]))
            self.observe_wait(author, admin)
            author.commit()
            suspended = admin.result()
            admin.commit()
            self.check(archived["status"] == "archived" and suspended["suspended"] and self.boolean(
                f"(select status='archived' and archived_by='{self.users[0]}' and previous_status='approved' "
                f"from public.ica_posts where id='{self.posts[7]}') and "
                f"(select bool_and(revoked_at is not null) from public.ica_app_sessions where user_id='{self.users[0]}') and "
                f"(select count(*)=1 from public.ica_audit_events where target_id='{self.posts[7]}' and action='archive') and "
                f"(select count(*)=2 from public.ica_audit_events where actor_id='{self.users[1]}' and target_id='{self.users[0]}' and action='member-change')"
            ), "archive_then_suspension_complete")
            self.cases += 1
        finally:
            admin.close()
            author.close()

    def cleanup(self):
        for connection in reversed(self.connections):
            connection.close()
        if not self.fixture_attempted:
            return
        users, posts, replies, sids = map(quoted, [self.users, self.posts, self.replies, self.sids])
        relations = [f"select id from {table} where id in ({ids})" for table, ids in [
            ("auth.users", users), ("public.ica_profiles", users), ("auth.sessions", sids),
            ("public.ica_app_sessions", sids), ("public.ica_posts", posts), ("public.ica_replies", replies),
            ("public.ica_spaces", f"'{self.space}'"), ("public.ica_uploads", quoted(self.uploads))]]
        relations += [f"select actor_id from {table} where actor_id in ({users})" for table in
                      ["public.ica_votes", "public.ica_reports", "public.ica_audit_events", "public.ica_rate_limits", "public.ica_uploads", "public.ica_reauth_nonces", "public.ica_moderation_events"]]
        relations += [f"select id from storage.objects where bucket_id='icarus-private' and name in ({quoted(self.paths)})"]
        empty = "not exists(" + " union all ".join(relations) + ")"
        owned = self.sql(f"select count(*) from auth.users where id in ({users}) and raw_app_meta_data->>'icarus_archive_race'='{self.tag}'", readonly=True)
        if owned == ["0"]:
            # Setup may have rolled back or never committed: do not delete collisions.
            self.check(self.boolean(empty), "cleanup_empty")
            return
        self.check(owned == ["2"], "cleanup_owned_users")
        # A UUID collision or changed fixture ownership stops all deletion.
        self.sql(f"""
          do $$ begin
            if exists(select 1 from auth.users where id in ({users}) and
              (raw_app_meta_data->>'icarus_archive_race' is distinct from '{self.tag}' or email not like 'archive-{self.tag}-%@example.test'))
              or exists(select 1 from public.ica_spaces where id='{self.space}' and name<>'DEMONSTRAÇÃO {self.tag}')
              or exists(select 1 from public.ica_posts where id in ({posts}) and
                (author_id<>'{self.users[0]}' or space_id<>'{self.space}' or title<>'DEMONSTRAÇÃO {self.tag}'))
            then raise exception 'Fixture ownership mismatch';end if;
          end $$;
          -- Supabase protects direct deletes; scope its supported flag to our metadata-only fixtures.
          set local storage.allow_delete_query='true';
          delete from storage.objects where bucket_id='icarus-private' and name in ({quoted(self.paths)});
          delete from public.ica_votes where actor_id in ({users}) and (post_id in ({posts}) or reply_id in ({replies}));
          delete from public.ica_reports where actor_id in ({users}) and (post_id in ({posts}) or reply_id in ({replies}));
          delete from public.ica_moderation_events where actor_id in ({users}) and target_id in ({posts},{replies});
          delete from public.ica_audit_events where actor_id in ({users}) and target_id in ({posts},{replies},{users});
          delete from public.ica_uploads where actor_id='{self.users[0]}' and post_id in ({posts});
          delete from public.ica_replies where id in ({replies}) and author_id='{self.users[1]}' and post_id in ({posts});
          delete from public.ica_posts where id in ({posts}) and author_id='{self.users[0]}' and space_id='{self.space}';
          delete from public.ica_spaces where id='{self.space}' and name='DEMONSTRAÇÃO {self.tag}';
          delete from public.ica_rate_limits where actor_id in ({users});
          delete from public.ica_reauth_nonces where actor_id in ({users}) and session_id in ({sids});
          delete from public.ica_app_sessions where id in ({sids}) and user_id in ({users});
          delete from auth.sessions where id in ({sids}) and user_id in ({users});
          delete from public.ica_profiles where id in ({users});
          delete from auth.users where id in ({users}) and raw_app_meta_data->>'icarus_archive_race'='{self.tag}'
        """)
        self.check(self.boolean(empty), "cleanup_empty")


class Session:
    def __init__(self, runner, index, service):
        self.runner, self.sid = runner, runner.sids[index]
        self.name = f"icarus-archive-{runner.tag}-{uuid.uuid4().hex[:8]}"
        self.pid = None
        self.closed = False
        self.lines = queue.Queue()
        self.errors = os.fdopen(os.open(runner.log_path.with_name(self.name + ".log"), os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600), "w+")
        self.process = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.errors, text=True, bufsize=1)
        runner.connections.append(self)
        threading.Thread(target=self.read, daemon=True).start()
        actor = runner.users[1 if index == 2 else 0]
        claims = json.dumps({"sub": actor, "role": "authenticated", "aal": "aal2", "session_id": self.sid})
        headers = json.dumps({"x-icarus-session-id": self.sid, "x-icarus-aal": "aal2"})
        self.send(LIMITS + f"set application_name='{self.name}';begin;"
                  f"set local \"request.jwt.claims\"='{claims}';set local \"request.headers\"='{headers}';"
                  f"set local role {'service_role' if service else 'authenticated'};select pg_backend_pid();\n\\echo ready\n")
        self.pid = int(self.until("ready")[-1])

    def read(self):
        for line in self.process.stdout:
            self.lines.put(line.rstrip("\n"))
        self.lines.put(None)

    def send(self, text):
        self.process.stdin.write(text)
        self.process.stdin.flush()

    def until(self, marker):
        lines = []
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            line = self.lines.get(timeout=max(0.01, deadline - time.monotonic()))
            if line is None:
                raise RuntimeError("SQL session ended")
            if line == marker:
                return lines
            if line:
                lines.append(line)
        raise RuntimeError("SQL session timed out")

    def start(self, expression):
        self.send(f"select {expression};\n\\echo result\n")

    def result(self, denied=False):
        try:
            lines = self.until("result")
        except RuntimeError:
            self.process.wait(timeout=3)
            self.errors.flush()
            self.errors.seek(0)
            if denied and self.process.returncode != 0 and re.search(r"ERROR:\s+P0001\b", self.errors.read()):
                self.runner.check(True, "expected_state_denial")
                return None
            raise
        if denied:
            raise RuntimeError("Expected state denial did not occur")
        return json.loads(lines[-1])

    def commit(self):
        self.send("commit;\n\\echo committed\n")
        self.until("committed")

    def close(self):
        if self.closed:
            return
        try:
            if self.process.poll() is None:
                try:
                    self.send("rollback;\n\\q\n")
                    self.process.stdin.close()
                except BrokenPipeError:
                    pass
                try:
                    self.process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    # Fence only the exact backend created by this runner, never by cwd.
                    pid_guard = f"and pid={self.pid}" if self.pid is not None else ""
                    self.runner.sql(f"select pg_terminate_backend(pid) from pg_stat_activity where application_name='{self.name}' {pid_guard}")
                    self.process.terminate()
                    self.process.wait(timeout=3)
        finally:
            self.errors.close()
            self.closed = True


def quoted(values):
    # Inputs are generated UUIDs or generated fixture paths, never external text.
    return ",".join(f"'{value}'" for value in values)


def main():
    runner = None
    passed = False
    cleanup = False
    try:
        guard_destination()
        runner = RaceCheck()
        runner.run()
        passed = True
    except Exception as error:
        if runner:
            runner.log.write(f"failure_type={type(error).__name__}\n")
    finally:
        if runner:
            try:
                runner.cleanup()
                cleanup = True
            except Exception as error:
                runner.log.write(f"cleanup_failure_type={type(error).__name__}\n")
            runner.log.close()
    print(f"passed={str(passed and cleanup).lower()}")
    print(f"assertions={runner.assertions if runner else 0}")
    print(f"cases={runner.cases if runner else 0}")
    print(f"observed_waits={runner.waits if runner else 0}")
    print(f"cleanup={str(cleanup).lower()}")
    return 0 if passed and cleanup else 1


if __name__ == "__main__":
    raise SystemExit(main())
