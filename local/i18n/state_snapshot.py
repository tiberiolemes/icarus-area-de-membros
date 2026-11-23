"""Read-only, sanitized study-state fingerprint; run with the bench Python via stdin."""
import hashlib
import json

import frappe

SITE = "tiberio.localhost"
VOLATILE = {"modified", "modified_by", "creation", "last_login", "last_active", "last_ip",
            "last_known_versions", "__last_sync_on", "__unsaved", "_user_tags", "_comments",
            "_assign", "_liked_by", "language"}
ORIGINAL_DESCRIPTION = "<p>Área local de avaliação do Frappe LMS. Material inicial baseado na edição pública do padrão de desenvolvimento.</p><p>Vídeo técnico de teste, sem gravações, depoimentos ou alunos reais.</p>"


def digest(value):
    data = json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode()
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    if isinstance(value, dict):
        return {key: canonical(item) for key, item in value.items() if key not in VOLATILE}
    if isinstance(value, list):
        return [canonical(item) for item in value]
    if value == ORIGINAL_DESCRIPTION:
        return value.replace("do Frappe LMS", "da plataforma Tibério Lemes")
    return value


frappe.init(site=SITE, sites_path="/home/frappe/frappe-bench/sites")
frappe.connect()
frappe.set_user("Administrator")
try:
    result = {"site": SITE, "records": {}}
    for doctype in ("LMS Course", "Course Chapter", "Course Lesson", "LMS Enrollment",
                    "LMS Course Progress", "LMS Certificate", "User"):
        records = {}
        for name in frappe.get_all(doctype, pluck="name", order_by="name"):
            doc = canonical(frappe.get_doc(doctype, name).as_dict())
            records[digest(name)] = digest(doc)
        result["records"][doctype] = {"count": len(records), "fingerprints": records}
    auth = frappe.db.sql("SELECT doctype, name, fieldname, password, encrypted FROM `__Auth` ORDER BY doctype,name,fieldname", as_dict=True)
    result["auth_fingerprint"] = digest(auth)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
finally:
    frappe.db.rollback()
    frappe.destroy()
