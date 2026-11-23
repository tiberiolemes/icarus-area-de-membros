"""Local platform identity and language. No fixtures, credentials or public endpoints."""
import json
from pathlib import Path

import frappe

SITE = "tiberio.localhost"
LANGUAGE = "pt-BR"
BRAND = "Tibério Lemes"
LOGO = "/assets/lms/images/assinatura-tiberio.svg"
INITIAL_DESCRIPTION = "<p>Área local de avaliação do Frappe LMS. Material inicial baseado na edição pública do padrão de desenvolvimento.</p><p>Vídeo técnico de teste, sem gravações, depoimentos ou alunos reais.</p>"


def force_request_language():
    # Native Guest negotiation otherwise prefers the browser/cookie over site defaults.
    if frappe.local.site == SITE:
        frappe.local.lang = LANGUAGE


def user_language(doc, method=None):
    if frappe.local.site == SITE:
        doc.language = LANGUAGE


def website_context(context):
    if frappe.local.site == SITE:
        from frappe.translate import get_messages_for_boot

        context.translated_messages = get_messages_for_boot()
        context.update({"brand_html": BRAND, "footer_powered": BRAND})
        # Website hooks run after StudioApp.get_context: its app_name is an API ID,
        # and its favicon is authored content. Keep both; renderer defaults own the fallback.
        if "app_route" not in context or "app_pages" not in context:
            context.update({"app_name": BRAND, "favicon": LOGO})


def boot_identity(bootinfo):
    if frappe.local.site != SITE:
        return
    bootinfo.app_name = BRAND
    bootinfo.lang = LANGUAGE
    # Only vendor advertising is omitted. About, keyboard shortcuts and health remain.
    navbar = bootinfo.get("navbar_settings")
    if navbar:
        navbar.help_dropdown = [row for row in navbar.help_dropdown
                               if not is_vendor_promotion(row)]


def is_vendor_link(route):
    from urllib.parse import urlparse

    hostname = (urlparse(route or "").hostname or "").lower()
    return any(hostname == domain or hostname.endswith("." + domain)
               for domain in ("frappe.io", "frappecloud.com", "frappeframework.com"))


def is_vendor_promotion(row):
    # Documentation and source attribution remain usable; remove the vendor support ad.
    from urllib.parse import urlparse

    route = row.get("route", "")
    return is_vendor_link(route) and (
        row.get("item_label") in ("Frappe Support", "Frappe Cloud")
        or urlparse(route).path.rstrip("/") in ("/support", "/pricing", "/marketplace/apps"))


def _save_settings(doctype, values):
    doc = frappe.get_single(doctype)
    changed = {key: value for key, value in values.items()
               if doc.meta.has_field(key) and doc.get(key) != value}
    if changed:
        doc.update(changed)
        doc.save()
    return len(changed)


def apply(catalog_path="/opt/local/i18n/merged-pt-BR.json"):
    """bench execute only, clean/existing site; safe to repeat, one transaction.

    The caller owns commit/rollback. Does not call seed, send email or change user
    content, passwords, roles, signup policy, enrollment, certificates or progress.
    Only the exact original synthetic fixture description can be rebranded.
    """
    if frappe.local.site != SITE:
        raise RuntimeError("This localization is restricted to tiberio.localhost")
    frappe.only_for("System Manager")
    translations = json.loads(Path(catalog_path).read_text())
    if not isinstance(translations, dict) or not translations or not all(isinstance(k, str) and k.strip()
            and isinstance(v, str) and v.strip() for k, v in translations.items()):
        raise ValueError("Invalid or empty translation catalog")
    from frappe.utils import sanitize_html

    # Translation.validate applies this too; compare the stored form for idempotence.
    translations = {source: sanitize_html(target) for source, target in translations.items()}
    if not all(target.strip() for target in translations.values()):
        raise ValueError("Translation became empty after native HTML sanitization")
    changed = _save_settings("System Settings", {
        "language": LANGUAGE, "time_zone": "America/Sao_Paulo", "country": "Brazil",
        "date_format": "dd/mm/yyyy", "time_format": "HH:mm:ss", "number_format": "#.###,##",
        "first_day_of_the_week": "Sunday", "app_name": BRAND, "otp_issuer_name": BRAND,
        "disable_product_suggestion": 1,
    })
    changed += _save_settings("Website Settings", {
        "app_name": BRAND, "website_title": BRAND + " — área de membros", "app_logo": LOGO,
        "banner_image": LOGO, "favicon": LOGO, "brand_html": BRAND, "footer_powered": BRAND,
    })
    changed += _save_settings("Navbar Settings", {"app_logo": LOGO})
    navbar = frappe.get_single("Navbar Settings")
    rows = navbar.get("help_dropdown") or []
    kept = [row for row in rows if not is_vendor_promotion(row)]
    if len(kept) != len(rows):
        navbar.update({"help_dropdown": kept})
        navbar.save()
        changed += 1
    # Standard app metadata only; never rename the internal Desktop Icon ID.
    if frappe.db.exists("Desktop Icon", "Frappe Learning"):
        icon = frappe.get_doc("Desktop Icon", "Frappe Learning")
        if icon.get("standard") and icon.get("app") == "lms":
            values = {"label": BRAND, "logo_url": LOGO}
            delta = {key: value for key, value in values.items() if icon.get(key) != value}
            if delta:
                # DesktopIcon.save exports JSON in developer mode; update presentation only.
                for key, value in delta.items():
                    frappe.db.set_value("Desktop Icon", "Frappe Learning", key, value, update_modified=False)
                changed += len(delta)
    fixture_changed = 0
    fixture = "desenvolvimento-com-agentes-de-ia-estudo-inicial"
    if frappe.db.get_value("LMS Course", fixture, "description") == INITIAL_DESCRIPTION:
        frappe.db.set_value("LMS Course", fixture, "description", INITIAL_DESCRIPTION.replace(
            "do Frappe LMS", "da plataforma Tibério Lemes"), update_modified=False)
        fixture_changed = 1
    # Set the language alone, including Guest/Administrator, without User.save side effects.
    users = frappe.get_all("User", filters={"language": ["!=", LANGUAGE]}, pluck="name")
    users += frappe.get_all("User", filters={"language": ["is", "not set"]}, pluck="name")
    for name in set(users):
        frappe.db.set_value("User", name, "language", LANGUAGE, update_modified=False)
        frappe.clear_cache(user=name)
    existing = {}
    for row in frappe.get_all(
        "Translation", filters={"language": LANGUAGE},
        fields=["name", "source_text", "translated_text", "context"]):
        existing.setdefault((row.source_text, row.context or ""), []).append(row)
    added = updated = 0
    for source, target in translations.items():
        rows = existing.get((source, ""), [])
        if rows:
            for row in rows:
                if row.translated_text != target:
                    doc = frappe.get_doc("Translation", row.name)
                    doc.translated_text = target
                    doc.save()
                    updated += 1
        else:
            frappe.get_doc({"doctype": "Translation", "language": LANGUAGE,
                            "source_text": source, "translated_text": target}).insert()
            added += 1
    from frappe.translate import clear_cache, set_default_language

    set_default_language(LANGUAGE)
    clear_cache()
    frappe.clear_cache()
    return {"settings_changed": changed, "users_changed": len(set(users)),
            "translations_added": added, "translations_updated": updated,
            "fixture_changed": fixture_changed}


def apply_and_commit(catalog_path="/opt/local/i18n/merged-pt-BR.json"):
    result = apply(catalog_path)
    frappe.db.commit()
    # A new native worker initializes local.lang from site config, before any request hooks.
    result["site_config_changed"] = int(frappe.conf.get("lang") != LANGUAGE)
    if result["site_config_changed"]:
        from frappe.installer import update_site_config

        update_site_config("lang", LANGUAGE)
        frappe.conf.lang = LANGUAGE
    return result
