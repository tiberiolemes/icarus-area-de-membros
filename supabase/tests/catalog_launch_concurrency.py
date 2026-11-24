"""Run only against the networkless, disposable 029 QA container."""

import json
import queue
import subprocess
import threading
import time

PSQL = [
    "docker", "exec", "-i", "icarus-catalog-launch-qa-029", "psql",
    "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "launch_final",
]


def uid(n):
    return f"02910000-0000-4000-8000-{n:012}"


def sql(statement):
    result = subprocess.run(PSQL, input=statement, capture_output=True, text=True, timeout=12)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def actor(n):
    claims = json.dumps({"sub": uid(n), "session_id": uid(n + 10),
                         "role": "authenticated", "aal": "aal2"})
    return f"set local role authenticated; set local request.jwt.claims = '{claims}';"


def call(n, statement):
    return sql(f"begin; {actor(n)} {statement}; commit;")


def status(entity, n, state="published"):
    return f"""select public.app_admin_save('{entity}','{uid(n)}','{{"status":"{state}"}}');"""


def subscribe(key):
    return f"select public.app_subscribe_catalog_launch('{key}');"


class Session:
    def __init__(self, name):
        self.name = "icarus-launch-" + name
        self.lines = queue.Queue()
        self.process = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.STDOUT, text=True)
        self.reader = threading.Thread(target=self.read, daemon=True)
        self.reader.start()
        self.send(f"set application_name='{self.name}'; set statement_timeout='10s';")

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=4)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.reader.join()

    def read(self):
        with self.process.stdout as output:
            for line in output:
                self.lines.put(line.strip())
        self.lines.put(None)

    def send(self, statement):
        self.process.stdin.write(statement + "\n")
        self.process.stdin.flush()

    def wait(self, marker):
        while True:
            line = self.lines.get(timeout=12)
            assert line is not None and not line.startswith("ERROR:"), line
            if line == marker:
                return


def race(holder_actor, holder_sql, waiter_actor, waiter_sql, finish="commit"):
    with Session("holder") as holder, Session("waiter") as waiter:
        holder.send(f"begin; {actor(holder_actor)} {holder_sql}\n\\echo holding")
        holder.wait("holding")
        waiter.send(f"begin; {actor(waiter_actor)} {waiter_sql}\ncommit;\n\\echo finished")
        statement = f"""
          select exists(select from pg_stat_activity w join pg_stat_activity h
            on h.pid = any(pg_blocking_pids(w.pid))
            where w.application_name='{waiter.name}' and h.application_name='{holder.name}');
        """
        deadline = time.monotonic() + 5
        while sql(statement) != "t":
            assert time.monotonic() < deadline, "espera pelo lock não comprovada"
            time.sleep(0.02)
        holder.send(f"{finish};\n\\echo released")
        holder.wait("released")
        waiter.wait("finished")


def assert_state(key, enrolled, sent):
    result = sql(f"""
      select (select count(*) from ica_private.catalog_launch_signups where launch_id='{key}'),
             (select count(*) from public.ica_notifications where event_key='catalog_launch' and source_id='{key}'),
             (select released_at is not null from ica_private.catalog_launches where id='{key}');
    """)
    assert result == f"{enrolled}|{sent}|t", result


def main():
    users = ",".join(
        f"('{uid(n)}','launch-race-{n}@example.test',now(),"
        f"""'{{"icarus_server_created":true}}','{{"full_name":"Ator teste"}}')"""
        for n in range(1, 4)
    )
    sessions = ",".join(f"('{uid(n+10)}','{uid(n)}',now(),now(),'aal2')" for n in range(1, 4))
    courses = ",".join(f"('{uid(n)}','race-{n}','Curso teste','draft','members')" for n in range(101, 107))
    sql(f"""
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values {users};
      insert into auth.sessions(id,user_id,created_at,updated_at,aal) values {sessions};
      update public.ica_profiles set role='instructor' where id in ('{uid(2)}','{uid(3)}');
      insert into public.ica_courses(id,slug,title,status,access_mode) values {courses};
      insert into public.ica_modules(id,course_id,slug,title) values
       ('{uid(201)}','{uid(105)}','module-a','Módulo A'),
       ('{uid(202)}','{uid(106)}','module-b','Módulo B');
    """)
    keys = {}
    for entity, numbers in (("courses", range(101, 105)), ("modules", range(201, 203))):
        column = "course_id" if entity == "courses" else "module_id"
        for n in numbers:
            call(2, f"select public.app_admin_save_catalog_launch('{entity}','{uid(n)}','Título','Resumo',null,true)")
            keys[n] = sql(f"select id from ica_private.catalog_launches where {column}='{uid(n)}';")

    with Session("profile-lock") as holder, Session("editor") as editor:
        holder.send(f"""begin;
          select from public.ica_profiles where id='{uid(2)}' for update;
          select from public.ica_courses where id='{uid(104)}' for update;
          \\echo holding""")
        holder.wait("holding")
        editor.send(f"""begin; {actor(2)}
          do $$ begin
            begin perform public.app_admin_save_catalog_launch('courses','{uid(104)}','Não salvar','Resumo',null,false);
              raise exception 'A edição foi aceita enquanto o perfil estava travado';
            exception when sqlstate 'P0001' then
              if sqlerrm <> 'Sua conta está sendo atualizada. Tente novamente em instantes.' then raise; end if;
            end;
          end $$;
          commit;
          \\echo retriable""")
        editor.wait("retriable")
        holder.send("rollback;\n\\echo released")
        holder.wait("released")
    assert sql(f"""select title,enabled,
      (select count(*) from public.ica_audit_events where action='catalog_launch_update' and target_id='{uid(104)}')
      from ica_private.catalog_launches where id='{keys[104]}';""") == "Título|t|0"
    print("perfil e recurso travados: a guarda retorna erro recuperável antes de editar ou auditar")

    race(1, subscribe(keys[101]), 2, status("courses", 101))
    assert_state(keys[101], enrolled=1, sent=1)
    print("inscrição antes da publicação: publicação esperou e enviou uma vez")

    reject_late = f"""
      do $$ begin
        begin perform public.app_subscribe_catalog_launch('{keys[102]}');
          raise exception 'Inscrição tardia foi aceita';
        exception when sqlstate 'P0001' then
          if sqlerrm <> 'Lançamento indisponível.' then raise; end if;
        end;
      end $$;
    """
    race(2, status("courses", 102), 1, reject_late)
    assert_state(keys[102], enrolled=0, sent=0)
    print("publicação antes da inscrição: inscrição esperou e foi negada")

    race(1, subscribe(keys[103]), 2, status("courses", 103), finish="rollback")
    assert_state(keys[103], enrolled=0, sent=0)
    print("rollback de inscrição concorrente: nenhum aviso órfão")

    race(1, subscribe(keys[104]), 1, subscribe(keys[104]))
    call(2, status("courses", 104))
    assert_state(keys[104], enrolled=1, sent=1)
    print("duas inscrições concorrentes do mesmo titular: uma inscrição e um aviso")

    for parent, child in ((105, 201), (106, 202)):
        call(2, status("courses", parent))
        call(1, subscribe(keys[child]))
        call(2, status("courses", parent, "draft"))

    race(2, status("courses", 105), 3, status("modules", 201))
    assert_state(keys[201], enrolled=1, sent=1)
    print("pai antes do filho em concorrência: um aviso e nenhum deadlock")

    race(2, status("modules", 202), 3, status("courses", 106))
    assert_state(keys[202], enrolled=1, sent=1)
    print("filho antes do pai em concorrência: um aviso e nenhum deadlock")


if __name__ == "__main__":
    main()
