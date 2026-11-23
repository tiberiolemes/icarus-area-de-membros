"""Prove exact temporary-document scope before cleanup; read only, no prefix deletion."""
import json
from pathlib import Path
import frappe
frappe.init(site='tiberio.localhost')
frappe.connect()
frappe.set_user('Administrator')
state=json.loads(Path('/tmp/i18nqa-fixtures.json').read_text())
ids,ledger=state['ids'],state['ledger']
users=[name for dt,name in ledger if dt=='User']
assert len(users)==5 and all(name in [f'i18nqa-{kind}@example.test' for kind in ['student','creator','instructor','firstpass','invited']] for name in users)
assert frappe.db.get_value('LMS Course',ids['course'],'title').startswith('Homologação local de idioma — temporário')
known=set(map(tuple,ledger)); additions=set(); names={name for _,name in ledger}
try:
    notifications=set(frappe.get_all('Notification Log',{'for_user':['in',users]},pluck='name'))
    for dt,name in ledger:
        notifications.update(frappe.get_all('Notification Log',{'document_type':dt,'document_name':name},pluck='name'))
    additions.update(('Notification Log',name) for name in notifications)
    contacts=set(frappe.get_all('Contact Email',{'email_id':['in',users]},pluck='parent'))
    for name in contacts:
        doc=frappe.get_doc('Contact',name)
        assert {row.email_id for row in doc.email_ids}.issubset(users), 'Contact has another email; preserve and review'
        assert all(row.link_doctype=='User' and row.link_name in users for row in doc.links), 'Contact has an external dependency; preserve and review'
        additions.add(('Contact',name))
    files=frappe.get_all('File',{'owner':['in',users]},pluck='name')
    additions.update(('File',name) for name in files)
    proven=0;shared=0
    for dt,name in known|additions:
        if dt!='File' or not frappe.db.exists(dt,name):continue
        doc=frappe.get_doc(dt,name)
        assert not doc.is_folder and (not doc.attached_to_name or doc.attached_to_name in names), 'File references another document; preserve and review'
        assert doc.owner in users or doc.attached_to_name in names, 'File identity outside QA scope'
        proven+=1
        shared+=bool(frappe.get_all('File',{'content_hash':doc.content_hash,'name':['not in',[n for t,n in known|additions if t=='File']]},limit=1))
    for dt in ['LMS Quiz Submission','LMS Assignment Submission','LMS Programming Exercise Submission']:
        for name in frappe.get_all(dt,{'member':['in',users]},pluck='name'):additions.add((dt,name))
    print(json.dumps({'ledger_additions':[list(row) for row in sorted(additions-known)],'qa_users':len(users),'qa_contacts':len(contacts),'qa_notifications':len(notifications),'recorded_files_proven_qa':proven,'shared_content_hashes_protected_by_native_file_delete':shared},ensure_ascii=False))
finally:
    frappe.db.rollback();frappe.destroy()
