"""Render native Guest error states in one read-only process; no maintenance downtime."""
import json
from html.parser import HTMLParser

import frappe
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip and data.strip():
            self.parts.append(data.strip())


import frappe.app
frappe.app._sites_path = "/home/frappe/frappe-bench/sites"
request = Request(EnvironBuilder(path="/homologacao-local?_lang=en", base_url="http://tiberio.localhost:8088",
    headers={"Accept-Language": "en-US,en;q=0.9", "Cookie": "preferred_language=en"}).get_environ())
frappe.app.init_request(request)
assert frappe.session.user == "Guest"
from frappe.translate import get_language
from frappe.website.page_renderers.not_permitted_page import NotPermittedPage
from frappe.website.page_renderers.not_found_page import NotFoundPage
from frappe.utils.response import handle_session_stopped

assert get_language() == "pt-BR"
assert frappe.local.lang == "pt-BR"
results = []
try:
    for status, render, expected in [
        (403, lambda: NotPermittedPage(exception=frappe._("Not Permitted")).render(), "permitido"),
        (404, lambda: NotFoundPage("/pagina-inexistente-homologacao").render(), "encontrad"),
        (503, handle_session_stopped, "atualiz"),
    ]:
        response = render()
        text = Text()
        text.feed(response.get_data(as_text=True))
        visible = "\n".join(text.parts)
        assert response.status_code == status
        assert expected in visible.lower(), visible[:300]
        assert 'lang="pt-BR"' in response.get_data(as_text=True)
        results.append({"status": status, "language": frappe.local.lang, "text": visible,
                        "method": "native renderer, isolated process, no site maintenance flag changed"})
    print(json.dumps({"states": results, "count": len(results)}, ensure_ascii=False))
finally:
    frappe.db.rollback()
    frappe.destroy()
