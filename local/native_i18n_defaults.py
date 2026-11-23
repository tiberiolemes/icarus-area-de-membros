"""Read/write contract assertions in the isolated synthetic test site, fully rolled back."""
import os
import frappe
os.chdir('/home/frappe/frappe-bench/sites')
frappe.init(site='test_tiberio.localhost')
frappe.connect()
frappe.set_user('Administrator')
frappe.flags.mute_emails = True
try:
    frappe.local.lang = 'pt-BR'
    key = 'i18nqa_defaults_' + frappe.generate_hash(length=8)
    app = frappe.get_doc({'doctype':'Studio App','app_name':key,'app_title':'Teste temporário de idioma','route':key,'is_standard':0}).insert()
    page = frappe.get_doc({'doctype':'Studio Page','studio_app':app.name,'blocks':'[]'}).insert()
    assert page.page_title.startswith('Minha página'), page.page_title
    authored = frappe.get_doc({'doctype':'Studio Page','studio_app':app.name,'page_title':'Authored title kept exactly','blocks':'[]'}).insert()
    assert authored.page_title == 'Authored title kept exactly'
    print('{"isolated_native_assertions":2,"default_title_localized":true,"authored_title_preserved":true,"committed":false}')
finally:
    frappe.db.rollback()
    frappe.destroy()
