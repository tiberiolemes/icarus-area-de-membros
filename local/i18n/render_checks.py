"""Render synthetic emails in memory with the image's installed Jinja; no site/database/sendmail."""
import argparse
import json
import subprocess
from pathlib import Path

from audit_framework import catalog
from merge_catalogs import merge, catalog_paths

RUNNER = r'''
import json, sys
import re
from collections import Counter
from string import Formatter
from types import SimpleNamespace
from urllib.parse import quote
from jinja2 import DictLoader, StrictUndefined
from jinja2.sandbox import SandboxedEnvironment
from markupsafe import escape
from frappe.utils import sanitize_html

data = json.load(sys.stdin)
def placeholders(text):
    fields=[]
    try:
        fields=[(field,spec,conversion) for _,field,spec,conversion in Formatter().parse(text) if field is not None]
    except ValueError:
        pass
    return Counter(fields),Counter(re.findall(r'%(?:\([\w]+\))?[-+#0-9.]*[sdif]|\$\{[^}]+\}|\{\{.*?\}\}',text))
sanitized=0
for source,target in data['authored'].items():
    clean=sanitize_html(target)
    assert clean.strip() and placeholders(clean)==placeholders(target), 'Sanitizer changed placeholders: '+source
    sanitized+=1
calls = []
def translate(source):
    key = str(source).strip()
    calls.append(key)
    assert key in data['translations'], 'Untranslated email source: ' + key
    return data['translations'][key]
env = SandboxedEnvironment(loader=DictLoader(data['templates']), undefined=StrictUndefined)
env.filters['urlencode'] = lambda value: quote(str(value), safe='')
env.filters['markdown'] = lambda value: str(escape(value))
env.globals.update(_=translate, get_lms_route=lambda route: '/lms/'+route)
for name, source in data.get('parse_templates', {}).items():
    env.parse(source, name=name)
utils = SimpleNamespace(format_date=lambda *args: '21/11/2026', format_time=lambda *args: '14:30',
    format_datetime=lambda *args: '21/11/2026 14:30', get_url=lambda: 'http://tiberio.localhost:8088',
    get_host_name=lambda: 'tiberio.localhost', get_url_to_form=lambda *args: '/app/error-log/synthetic')
utils.md_to_html = lambda value: str(escape(value))
utils.get_link_to_form = lambda *args: '/app/synthetic'
def get_value(doctype, name, fields, as_dict=False):
    if as_dict:
        return SimpleNamespace(full_name='Pessoa de teste', title='Curso sintético', name='synthetic', image='/synthetic.png')
    return 'Pessoa de teste'
frappe = SimpleNamespace(utils=utils, bold=lambda value: '<strong>'+str(escape(value))+'</strong>',
    get_all=lambda *args,**kwargs:['synthetic@example.test'],
    db=SimpleNamespace(get_single_value=lambda *args:'Tibério Lemes', get_value=get_value))
doc = SimpleNamespace(member='synthetic@example.test', course='synthetic', issue_date='2026-11-21',
    evaluator=None, evaluator_name='Avaliador sintético', name='synthetic',
    error='\n'.join('Erro sintético '+str(n) for n in range(40)),
    output='\n'.join('Saída sintética '+str(n) for n in range(40)), method='Método sintético',
    creation='2026-11-21', reference_doctype='LMS Course', reference_name='synthetic',
    integration_request_service='Serviço sintético', status='Completed', description='Descrição sintética',url='/synthetic',
    reference_docname='synthetic',request_description='Solicitação sintética',request_id='synthetic')
context = dict(frappe=frappe, app_name='Tibério Lemes', first_name='Pessoa de teste',
    user='synthetic@example.test', site_name='Tibério Lemes', site_url='http://tiberio.localhost:8088',
    link='/synthetic-reset-token', invite_link='/synthetic-invitation', invited_by='Equipe de teste', invited_by_fullname='Equipe de teste',
    full_name='Pessoa de teste', member_name='Pessoa de teste', student_name='Pessoa de teste',
    course_title='Curso sintético', course='Curso sintético', title='Curso sintético', name='synthetic',
    template='Certificate', sender_name='Equipe de teste', up_next='Aula sintética', route='courses/synthetic',
    assignment_title='Atividade sintética', assignment_name='synthetic', submission_name='synthetic',
    start_date='2026-11-21', start_time='14:30:00', medium='Online', signup_form_link='/synthetic-signup',
    update_password_link='/synthetic-first-password', brand_name='Tibério Lemes', brand_logo='/synthetic-logo.svg',
    subject='Assunto sintético', header='Cabeçalho sintético', content='Conteúdo sintético', footer='', print_html='',
    expiry_days=1, expiry_minutes=1, evaluation=True, evaluation_end_date='2026-11-22',
    evaluator='Avaliador sintético', evaluator_name='Avaliador sintético',
    date='2026-11-22', time='14:30', timezone='America/Sao_Paulo',
    job='Vaga sintética', job_title='Vaga sintética', job_url='/synthetic-job', reason='Motivo sintético', sender='Pessoa de teste',
    author='Pessoa de teste', creation='21/11/2026', message='Mensagem sintética', action='Continuar',
    status='Approved', course_url='/lms/courses/synthetic', course_link='/lms/courses/synthetic',
    billing_name='Pessoa de teste', type='turma', short_introduction='Apresentação sintética',
    end_date='2026-11-23', batch_name='synthetic', batch_url='/lms/batches/synthetic',
    instructors=[SimpleNamespace(full_name='Pessoa de teste',user_image='/synthetic.png'),
        SimpleNamespace(full_name='Outra pessoa de teste',user_image=None)],
    batches={'Turma sintética':[SimpleNamespace(message='Mensagem sintética',author='Pessoa de teste',creation='2026-11-21')]},doc=doc)
checks = []
for name in data['templates']:
    for count in (1, 5):
        context.update(expiry_days=count, expiry_minutes=count, minutes=count)
        doc.evaluator = None if count == 1 else 'Avaliador sintético'
        rendered = env.get_template(name).render(context)
        assert rendered.strip(), name
        assert 'Frappe' not in rendered, name
        assert '{{' not in rendered, name
        if 'password_reset' in name:
            assert '/synthetic-reset-token' in rendered
            assert ('1 minuto' if count == 1 else '5 minutos') in rendered
        checks.append(name+':'+str(count))
shell_checks=0
frappe.lang='pt-BR'
shell_context=dict(context,app_title='Aplicativo sintético',favicon=None,stylesheets=[],script=None,
    assets=None,csrf_token='synthetic-csrf',site_url='http://tiberio.localhost:8088',site_name='tiberio.localhost',
    socketio_port=9000,is_developer_mode=0,boot={},app_name='synthetic',app_route='/synthetic',
    frappe_app='lms',app_pages=[],app_home=None,is_guest=True,can_edit_app=False,is_preview=False,
    is_db_app=False,router_file=None,assets_not_found=True,
    translated_messages={'synthetic':'</script><script>alert(1)</script>'})
for name,source in data.get('shell_templates',{}).items():
    rendered=env.from_string(source).render(shell_context)
    assert 'lang="pt-BR"' in rendered,name
    assert '</script><script>alert(1)</script>' not in rendered,name
    assert chr(92)+'u003c' in rendered,name
    shell_checks+=1
print(json.dumps({'renderings':len(checks), 'translated_source_calls':len(calls), 'templates':list(data['templates']),
    'patched_templates_parsed':len(data.get('parse_templates', {})), 'studio_shells_rendered_with_json_escape':shell_checks,
    'native_sanitizer_entries_checked':sanitized,
    'mode':'memory-only; StrictUndefined; no framework init, database, HTTP or email delivery'}))
'''


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--framework", type=Path, required=True)
    parser.add_argument("--payments", type=Path, required=True)
    args = parser.parse_args()
    here = Path(__file__).parent
    root = here.parents[1]
    translations = {}
    for path in (args.framework, args.payments, root / "lms"):
        translations.update(catalog(path))
    translations.update(merge(catalog_paths(here)))
    templates = {}
    for name in ("password_reset", "user_invitation", "user_invitation_cancelled", "user_invitation_expired", "login_with_email_link", "new_user", "auth_email"):
        path = args.framework / "templates/emails" / (name + ".html")
        templates["framework/" + name] = path.read_text()
    for path in sorted((root / "lms/templates/emails").glob("*.html")):
        templates["lms/" + path.stem] = path.read_text()
    templates["lms/certificate_print"] = json.loads((root / "lms/lms/print_format/certificate/certificate.json").read_text())["html"]
    for name in ("error_log", "integration_request"):
        templates["framework/notification_" + name] = (args.framework / "email/doctype/notification/templates" / name / (name + ".html")).read_text()
    parse_templates = {}
    for manifest_name, source_root in (("framework-overlay.json", args.framework), ("payments-overlay.json", args.payments)):
        manifest = json.loads((here / manifest_name).read_text())
        for entry in manifest["patches"]:
            name = entry["path"]
            if name.endswith(".html") and name not in ("core/doctype/audit_trail/audit_trail.html", "payment_gateways/doctype/mpesa_settings/account_balance.html"):
                parse_templates[manifest_name + ":" + name] = (source_root / name).read_text()
    shell_templates = {name: (args.framework / name).read_text() for name in ("www/studio.html", "templates/generators/app_renderer.html", "templates/generators/studio_renderer.html")}
    authored = merge(catalog_paths(here))
    payload = json.dumps({"templates": templates, "translations": translations, "parse_templates": parse_templates, "authored": authored, "shell_templates": shell_templates})
    result = subprocess.run(["docker", "exec", "-i", "tiberio-frappe-local-backend-1", "env", "PYTHONDONTWRITEBYTECODE=1", "/home/frappe/frappe-bench/env/bin/python", "-c", RUNNER], input=payload, text=True, capture_output=True, check=False)
    print(result.stdout, end="")
    if result.returncode:
        print(result.stderr, end="")
        raise SystemExit(result.returncode)
