"""Native temporary invitation/passwordless sessions; renders email, never sends it."""
import json
from unittest.mock import patch

import frappe
from frappe.utils.password import has_password
from frappe.www.login import _generate_temporary_login_link

frappe.init(site="tiberio.localhost")
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.mute_emails and not frappe.db.exists("Email Account", {"enable_outgoing": 1})
email = "i18nqa-firstpass@example.test"
invited = "i18nqa-invited@example.test"
assert not frappe.db.exists("User", email) and not frappe.db.exists("User", invited)
captured = {}


def render_only(**kwargs):
    assert kwargs["template"] == "user_invitation"
    captured["invitation_link"] = kwargs["args"]["invite_link"]
    args = {**kwargs["args"], "invite_link": "http://tiberio.localhost:8088/convite-sintetico"}
    captured["email_subject"] = kwargs["subject"]
    captured["email_rendered"] = frappe.render_template("templates/emails/user_invitation.html", args)


try:
    user = frappe.get_doc({"doctype": "User", "email": email,
        "first_name": "Pessoa administradora temporária", "username": "i18nqa-firstpass",
        "language": "en", "send_welcome_email": 0, "user_type": "System User",
        "roles": [{"role": "System Manager"}, {"role": "Moderator"}]}).insert()
    assert not has_password(email) and user.language == "pt-BR"
    link = _generate_temporary_login_link(email, 60)
    with patch.object(frappe, "sendmail", render_only):
        invitation = frappe.get_doc({"doctype": "User Invitation", "email": invited,
            "app_name": "lms", "redirect_to_path": "lms", "roles": [{"role": "LMS Student"}]}).insert()
    frappe.db.commit()
    print(json.dumps({"passwordless_link": link, **captured,
        "ledger": [["User", email], ["User Invitation", invitation.name], ["User", invited]],
        "email_sent": False}, ensure_ascii=False))
except Exception:
    frappe.db.rollback()
    raise
finally:
    frappe.destroy()
