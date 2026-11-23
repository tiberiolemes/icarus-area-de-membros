"""Delete only the recorded temporary locale UAT documents through native deletes."""
import json
from pathlib import Path

import frappe

frappe.init(site="tiberio.localhost")
frappe.connect()
frappe.set_user("Administrator")
frappe.flags.mute_emails = True
state = json.loads(Path("/tmp/i18nqa-fixtures.json").read_text())
ids, ledger = state["ids"], state["ledger"]
assert all(ids[k] == f"i18nqa-{k}@example.test" for k in ("student", "creator", "instructor"))
course = frappe.get_doc("LMS Course", ids["course"])
assert course.title.startswith("Homologação local de idioma — temporário")
priority = ["Notification Log", "Studio App", "Studio Page", "LMS Certificate", "LMS Certificate Evaluation", "LMS Certificate Request", "User Invitation", "Data Import", "Job Opportunity", "LMS Quiz Submission",
            "LMS Assignment Submission", "LMS Programming Exercise Submission", "Course Evaluator",
            "LMS Program", "LMS Batch Enrollment", "LMS Batch", "LMS Enrollment", "LMS Course",
            "Course Lesson", "Course Chapter", "LMS Quiz", "LMS Question", "LMS Assignment",
            "LMS Programming Exercise", "File", "Contact", "User"]
assert set(row[0] for row in ledger).issubset(priority)
removed = []
try:
    from frappe.sessions import clear_sessions
    qa_users = [name for dt, name in ledger if dt == "User"]
    assert len(qa_users) == 5
    for user in qa_users:
        clear_sessions(user=user)  # Only the five recorded synthetic accounts.
    for user in qa_users:
        for name in frappe.get_all("Notification Log", {"for_user": user}, pluck="name"):
            frappe.delete_doc("Notification Log", name)
    for doctype in priority:
        for dt, name in reversed(ledger):
            if dt == doctype and frappe.db.exists(dt, name):
                frappe.delete_doc(dt, name)
                removed.append([dt, name])
    frappe.db.commit()
    print(json.dumps({"removed": removed, "all_ledger_rows_absent": all(
        not frappe.db.exists(dt, name) for dt, name in ledger)}, ensure_ascii=False))
except Exception:
    frappe.db.rollback()
    raise
finally:
    frappe.destroy()
