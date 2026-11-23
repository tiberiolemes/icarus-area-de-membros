"""Exercise real HTTP sessions and native backend authorization on synthetic local data."""
import http.cookiejar
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8088"
COURSE = "desenvolvimento-com-agentes-de-ia-estudo-inicial"


class Session:
    def __init__(self):
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None

    def request(self, path, data=None, headers=None):
        headers = {"Accept": "application/json", **(headers or {})}
        if self.csrf:
            headers["X-Frappe-CSRF-Token"] = self.csrf
        payload = None if data is None else urllib.parse.urlencode({
            k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in data.items()
        }).encode()
        try:
            with self.client.open(urllib.request.Request(BASE + path, payload, headers), timeout=45) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def call(self, method, values=None, post=False):
        path = "/api/method/" + method
        if values and not post:
            path += "?" + urllib.parse.urlencode(values)
        status, body = self.request(path, values if post else None)
        return status, json.loads(body)

    def login(self, user, password):
        status, data = self.call("login", {"usr": user, "pwd": password}, post=True)
        assert status == 200, ("login", status)
        status, html = self.request("/lms")
        token = re.search(rb'"csrf_token"\s*:\s*"([^\"]+)"', html)
        if not token:
            token = re.search(rb'csrf_token"\]\s*=\s*"([^\"]+)"', html)
        assert token, "CSRF token not found in native page boot"
        self.csrf = token.group(1).decode()


def main():
    credentials = json.loads((Path(__file__).resolve().parents[1] / ".local/secrets.json").read_text())
    guest, student, other, admin = [Session() for _ in range(4)]
    student.login("aluno@example.test", credentials["student"])
    other.login("outro@example.test", credentials["other"])
    admin.login("Administrator", credentials["admin"])
    results = []

    def check(name, condition):
        assert condition, name
        results.append(name)

    lesson_args = {"course": COURSE, "chapter": 1, "lesson": 1}
    status, data = guest.call("lms.lms.utils.get_lesson", lesson_args)
    check("guest cannot read private lesson content", status == 200 and not data.get("message"))
    status, data = other.call("lms.lms.utils.get_lesson", lesson_args)
    check("unenrolled student cannot read lesson content", not data.get("message", {}).get("content"))
    status, data = student.call("lms.lms.utils.get_lesson", lesson_args)
    first = data.get("message", {})
    check("enrolled student reads first lesson", status == 200 and bool(first.get("content")))
    blocks = json.loads(first["content"])["blocks"]
    material_url = next(re.search(r'href="([^"]+)"', b["data"]["text"]).group(1)
                        for b in blocks if "Baixar roteiro" in b.get("data", {}).get("text", ""))
    material_url = material_url.replace("&amp;", "&")
    status, body = student.request(material_url)
    check("enrolled student downloads private study material", status == 200 and b"Roteiro inicial" in body)
    status, body = guest.request(material_url)
    check("guest cannot download private study material", status == 403)
    status, data = admin.call("lms.lms.utils.get_lesson", {"course": COURSE, "chapter": 1, "lesson": 2})
    video_blocks = json.loads(data["message"]["content"])["blocks"]
    video_url = next(b["data"]["file_url"] for b in video_blocks if b["type"] == "upload")
    for actor, label in [(guest, "guest"), (other, "unenrolled student")]:
        status, _ = actor.request(video_url)
        check(f"{label} cannot stream private video", status == 403)
    if "--video" in sys.argv:
        status, body = student.request(video_url, headers={"Range": "bytes=0-1023"})
        check("enrolled student receives video byte range", status == 206 and len(body) == 1024)
    if "--initial" in sys.argv:
        status, data = student.call("lms.lms.utils.get_lesson", {"course": COURSE, "chapter": 1, "lesson": 2})
        check("sequential lesson remains locked before completion", data.get("message", {}).get("locked") == 1 and not data.get("message", {}).get("content"))
    status, data = admin.call("frappe.client.get_list", {"doctype": "LMS Course", "filters": json.dumps({"title": "Rascunho privado de validação"})})
    draft = data["message"][0]["name"]
    status, data = student.call("lms.lms.utils.get_lesson", {"course": draft, "chapter": 1, "lesson": 1})
    check("student cannot read unpublished unassigned course", not data.get("message"))
    status, data = student.call("lms.lms.api.upsert_chapter", {"course": COURSE, "title": "Unauthorized"}, post=True)
    check("student cannot administer chapters", status == 403)
    status, data = student.call("frappe.client.get", {"doctype": "LMS Settings", "name": "LMS Settings"})
    check("student cannot read administrative settings", status in (403, 417))
    status, data = student.call("lms.lms.api.get_heatmap_data", {"member": "outro@example.test"})
    check("student cannot inspect another student activity", status == 403)
    status, data = student.call("frappe.client.insert", {"doc": {"doctype": "LMS Course Progress", "member": "outro@example.test", "course": COURSE, "lesson": first["name"], "status": "Complete"}}, post=True)
    check("student cannot forge another student's progress", status in (403, 417))
    status, data = admin.call("frappe.client.get_list", {"doctype": "LMS Course Progress", "filters": json.dumps({"member": "outro@example.test", "course": COURSE})})
    check("forged progress was not persisted", status == 200 and data.get("message") == [])
    invalid = Session()
    status, data = invalid.call("login", {"usr": "Administrator", "pwd": "admin"}, post=True)
    check("example admin password is rejected", status == 401)
    print(json.dumps({"passed": results, "count": len(results)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
