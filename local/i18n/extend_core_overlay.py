"""Extend pinned framework targets from their original sources, never from a live site."""
import argparse
import json
from pathlib import Path
from finalize_package_overlay import digest, replacements

HERE=Path(__file__).parent

def extend(root):
    manifest=json.loads((HERE/'framework-overlay.json').read_text())
    original={r['path']:(root/r['path']).read_text() for r in manifest['patches']}
    patched={}
    for row in manifest['patches']:
        before=original[row['path']]
        # Existing complete manifests can be regenerated without duplicating extensions.
        if digest(before)!=row['before_sha256']:
            raise ValueError('Original source hash mismatch: '+row['path'])
        for item in row['replacements']:
            before=before.replace(item[0],item[1],item[2] if len(item)>2 else 1)
        patched[row['path']]=before
    def replace(name,old,new):
        if name not in original:original[name]=(root/name).read_text()
        source=patched.get(name,original[name])
        if new in source:return
        if source.count(old)!=1:raise ValueError('Source drift: '+name+': '+old)
        patched[name]=source.replace(old,new,1)
    name='www/studio.py'
    replace(name,'context.assets = get_editor_assets("index.html")','context.assets = get_editor_assets("index.html")\n\tfrom frappe.translate import get_messages_for_boot\n\tcontext.translated_messages = get_messages_for_boot()')
    replace('www/studio.html','window.csrf_token = "{{ csrf_token }}"','window.translatedMessages = {{ translated_messages | tojson }}\n\t\t\twindow.csrf_token = "{{ csrf_token }}"')
    # Native generated applications retain authored title/favicon, with local defaults.
    for name in ['templates/generators/app_renderer.html','templates/generators/studio_renderer.html']:
        if name in patched:
            patched[name]=patched[name].replace('{{ frappe.local.lang }}', '{{ frappe.lang }}')
        replace(name,'<html lang="en" class="h-full">','<html lang="{{ frappe.lang }}" class="h-full">')
        replace(name,"favicon or '/assets/frappe/studio/favicon.png'","favicon or '/assets/lms/images/assinatura-tiberio.svg'")
        replace(name,'window.boot = {{ boot|tojson }};','window.translatedMessages = {{ (translated_messages or {}) | tojson }};\n\t\t\twindow.boot = {{ boot|tojson }};')
    # The supplier support and upgrade promotions are unrelated to local administration.
    name='public/js/frappe/ui/toolbar/about.js'
    source=patched[name]
    if '\n\t\t\t\t${\n\t\t\t\t\tfrappe.boot.is_fc_site' in source:
        start=source.index('\n\t\t\t\t${\n\t\t\t\t\tfrappe.boot.is_fc_site')
        end=source.index('\n\t\t\t</div>', start)
        source=source[:start]+source[end:]
    if '\n\t\t// Show update button on Frappe Cloud' in source:
        start=source.index('\n\t\t// Show update button on Frappe Cloud')
        end=source.index('\n\t\tconst $wrap',start)
        source=source[:start]+source[end:]
    patched[name]=source
    name='public/js/frappe/build_events/BuildSuccess.vue'
    replace(name, '\n\t\tCompiled successfully\n', '\n\t\t{{ __("Compiled successfully") }}\n')
    replace(name, '\n\t\t\tRefresh\n', '\n\t\t\t{{ __("Refresh") }}\n')
    name='templates/generators/studio_renderer.html'
    replace(name,'console.error("The Studio renderer is not built. Run `bench build --app frappe`.")', 'console.error({{ _("The Studio renderer is not built. Run {0}.").format("bench build --app frappe") | tojson }})')
    replace(name,'console.error("Could not find app assets for Studio App. Currently, using the default renderer as a fallback. Please publish the app again to generate assets.")', 'console.error({{ _("Could not find app assets for Studio App. Currently, using the default renderer as a fallback. Please publish the app again to generate assets.") | tojson }})')
    name='desk/page/desktop/desktop.js'
    source=patched.get(name, (root/name).read_text())
    old='''\t\t\t{
\t\t\t\ticon: "life-buoy",
\t\t\t\tlabel: "Frappe Support",
\t\t\t\tonclick: function () {
\t\t\t\t\twindow.open("https://support.frappe.io/help", "_blank");
\t\t\t\t},
\t\t\t\torder: 40,
\t\t\t},
'''
    if old in source:
        original.setdefault(name,(root/name).read_text())
        patched[name]=source.replace(old,'',1)
    name='email/doctype/email_account/email_account_list.js'
    replace(name, '"Frappe Mail": ["Frappe Mail", "frappe-mail.svg"]', '"Frappe Mail": [__("Platform mail"), "/assets/lms/images/assinatura-tiberio.svg"]')
    replace(name, '.attr("src", `/assets/frappe/images/email-providers/${logo}`)', '.attr("src", logo.startsWith("/") ? logo : `/assets/frappe/images/email-providers/${logo}`)')
    name='core/page/component_explorer/component_explorer.js'
    for old,new in [('Company: Frappe Technologies Private Limited (Mumbai Head Office and Regional Branches)','Empresa: Empresa de exemplo (matriz e filiais)'),('Cost Center: Main - Frappe Technologies Private Limited - Mumbai - FT','Centro de custo: Principal — Empresa de exemplo'),('"Frappe Technologies"','"Empresa de exemplo"'),('"Frappe Cloud LLC"','"Empresa de exemplo 2"'),('"Frappe UK Ltd"','"Empresa de exemplo 3"')]:
        source=patched.get(name,(root/name).read_text())
        if old in source:
            original.setdefault(name,(root/name).read_text());patched[name]=source.replace(old,new)
    name='core/doctype/server_script/server_script.js'
    # Translate prose around executable examples. Preserve code/API fragments verbatim.
    segments={
        'DocType Event':'Evento de tipo de documento',
        'Add logic for standard doctype events like Before Insert, After Submit, etc.':'Adicione lógica para eventos padrão de tipos de documento, como antes de inserir e após confirmar.',
        'Payment processing':'Processamento de pagamentos',
        'Payment processing events have a special state. See the <a href="https://github.com/frappe/payments/blob/develop/payments/controllers/payment_controller.py">PaymentController in Frappe Payments</a> for details.':'Os eventos de processamento de pagamentos têm um estado especial. Consulte o <a href="https://github.com/frappe/payments/blob/develop/payments/controllers/payment_controller.py">controlador de pagamentos</a> para obter detalhes.',
        'The <i>On Payment Failed</i> (<code>on_payment_failed</code>) event only transports the error message which the controller implementation had extracted from the transaction.':'O evento <i>Quando o pagamento falha</i> (<code>on_payment_failed</code>) transporta apenas a mensagem de erro extraída da transação pelo controlador.',
        'API Call':'Chamada de API',
        'Respond to <code>/api/method/&lt;method-name&gt;</code> calls, just like whitelisted methods':'Responda a chamadas para <code>/api/method/&lt;method-name&gt;</code>, como nos métodos autorizados.',
        'Permission Query':'Consulta de permissão',
        'Add conditions to the where clause of list queries.':'Adicione condições à cláusula where das consultas de lista.',
        'Generate dynamic conditions and set it in the conditions variable:':'Gere condições dinâmicas e atribua-as à variável conditions:',
        'The resulting select query is:':'A consulta select resultante é:',
        'Workflow Task':'Tarefa do fluxo de trabalho',
        'Execute when a particular <a href="/desk/workflow-action-master">Workflow Action Master</a> is executed.':'Execute quando uma determinada <a href="/desk/workflow-action-master">ação principal do fluxo de trabalho</a> for executada.',
        'Gets the document which the action is being applied on in the <code>doc</code> variable.':'Receba o documento ao qual a ação é aplicada na variável <code>doc</code>.'}
    messages=json.loads((HERE/'framework-packages-pt-BR.json').read_text())
    for old,new in segments.items():
        replace(name, '>'+old+'<', '>${__('+json.dumps(old)+')}<')
        messages[old]=new
    messages['Platform mail']='Correio da plataforma'
    (HERE/'framework-packages-pt-BR.json').write_text(json.dumps(messages,ensure_ascii=False,indent=2)+'\n')
    # A configured OAuth provider retains its ID/redirect/secret; only its public label/icon changes.
    name='www/login.py'
    replace(name, '\t\ticon = None\n\t\tif provider.icon:', '\t\ticon = None\n\t\tif provider.provider_name == "Frappe":\n\t\t\ticon = \'<img src="/assets/lms/images/assinatura-tiberio.svg" alt="Tibério Lemes">\'\n\t\telif provider.icon:')
    replace(name, '"provider_name": provider.provider_name,', '"provider_name": _("Platform account") if provider.provider_name == "Frappe" else provider.provider_name,')
    messages['Platform account']='Conta da plataforma'
    (HERE/'framework-packages-pt-BR.json').write_text(json.dumps(messages,ensure_ascii=False,indent=2)+'\n')
    # Localize the launcher before host boot; keep a closed panel out of viewport layout.
    name='public/js/flow_launcher.bundle.js'
    replace(name, 'const STORE_KEY = "flow_launcher";', 'import localMessages from "../../../../lms/local/i18n/merged-pt-BR.json";\nconst __pt = (message) => localMessages[message] || window.__?.(message) || message;\n\nconst STORE_KEY = "flow_launcher";')
    replace(name, 'role="dialog" aria-label="Flow" inert', 'role="dialog" aria-label="${__pt("AI Assistant")}" inert hidden')
    replace(name, '\t\tthis.chat.inert = true;', '\t\tthis.chat.inert = true;\n\t\tthis.chat.hidden = true;')
    replace(name, 'this.panel.inert = this.chat.inert = false;', 'this.panel.inert = this.chat.inert = false;\n\t\tthis.panel.hidden = this.chat.hidden = false;')
    replace(name, 'this.panel.inert = this.chat.inert = true;', 'this.panel.inert = this.chat.inert = true;\n\t\tthis.panel.hidden = this.chat.hidden = true;')
    replace(name, '<p>Flow could not start.</p>', '<p>${__pt("Flow could not start.")}</p>')
    replace(name, '<button class="reload">Reload page</button><button class="close">Close</button>', '<button class="reload">${__pt("Reload page")}</button><button class="close">${__pt("Close")}</button>')
    manifest['patches']=[{'path':name,'before_sha256':digest(original[name]),'after_sha256':digest(text),'replacements':replacements(original[name],text)} for name,text in sorted(patched.items())]
    (HERE/'framework-overlay.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'framework_targets':len(manifest['patches'])}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--framework',type=Path,required=True)
    extend(p.parse_args().framework)
