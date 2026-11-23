"""Live locale/branding/security regressions; no successful study-data writes."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "local"))
from verify import Session

checks = []


def check(name, condition):
    assert condition, name
    checks.append(name)


def visible_messages(data):
    values = []
    for raw in json.loads(data.get("_server_messages", "[]")):
        row = json.loads(raw) if isinstance(raw, str) else raw
        values.append(str(row.get("message", "")))
    if isinstance(data.get("message"), str):
        values.append(data["message"])
    return "\n".join(values)


guest = Session()
for query in ("_lang=en", "lang=en", ""):
    status, html = guest.request("/login?" + query, headers={
        "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "preferred_language=en; system_language=en; user_language=en"})
    check("Guest em pt-BR com cookie/header inglês e parâmetro " + (query or "ausente"),
          status == 200 and bool(re.search(rb'<html[^>]+lang="pt-BR"', html)))
status, html = guest.request("/pagina-inexistente-homologacao", headers={"Accept": "text/html", "Accept-Language": "en"})
check("404 nativo mantém status e idioma", status == 404 and b'lang="pt-BR"' in html)
status, html = guest.request("/private/files/i18nqa-nao-existe.pdf", headers={"Accept": "text/html", "Accept-Language": "en"})
check("Arquivo privado mantém 403 sem cabeçalho inglês do Werkzeug", status == 403 and b'lang="pt-BR"' in html and b'Forbidden' not in html)
status, result = guest.call("lms.lms.api.upsert_chapter", {"course": "inexistente", "title": "Sem gravação"}, post=True)
check("Guest continua sem permissão de escrita", status == 403)
status, result = guest.call("login", {"usr": "i18nqa-nunca-criado@example.test", "pwd": "senha-invalida-de-teste"}, post=True)
message = visible_messages(result)
check("Login inválido mantém 401 e mensagem traduzida", status == 401 and "inválid" in message.lower() and "Invalid" not in message)
secrets = json.loads((ROOT / ".local/secrets.json").read_text())
student, admin = Session(), Session()
student.login("aluno@example.test", secrets["student"])
admin.login("Administrator", secrets["admin"])
status, result = student.call("lms.lms.api.upsert_chapter", {
    "course": "desenvolvimento-com-agentes-de-ia-estudo-inicial", "title": "Sem gravação"}, post=True)
check("Erro de autorização traduzido sem liberar aluno", status == 403 and "Você não tem permissão" in visible_messages(result))
student.csrf = "token-invalido-de-homologacao"
status, result = student.call("lms.lms.api.upsert_chapter", {
    "course": "desenvolvimento-com-agentes-de-ia-estudo-inicial", "title": "Sem gravação"}, post=True)
message = visible_messages(result)
check("CSRF inválido continua rejeitado antes da ação e em português",
      status in (400, 403) and result.get("exc_type") == "CSRFTokenError" and "inválid" in message.lower())
status, result = admin.call("frappe.client.get", {"doctype": "LMS Course", "name": "i18nqa-documento-inexistente"})
message = visible_messages(result)
check("Erro 404 interpola nome sem perder tradução", status == 404 and "i18nqa-documento-inexistente" in message
      and "encontrad" in message.lower() and "{0}" not in message and "not found" not in message)
status, manifest = guest.call("lms.lms.api.get_pwa_manifest")
check("PWA usa identidade local", status == 200 and manifest["name"] == "Tibério Lemes" and manifest["short_name"] == "Tibério Lemes")
check("PWA usa ícones locais", all("tiberio" in row["src"] for row in manifest["icons"]))
status, html = admin.request("/flow", headers={"Accept": "text/html"})
check("Flow serve favicon local", status == 200 and b'/assets/lms/images/assinatura-tiberio.svg' in html
      and b'/assets/frappe/images/flow.png' not in html)
print(json.dumps({"count": len(checks), "passed": checks}, ensure_ascii=False, indent=2))
