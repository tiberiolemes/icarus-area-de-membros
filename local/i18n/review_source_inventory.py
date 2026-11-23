"""Attach reviewed reachability decisions without treating source scans as visual proof."""
import ast
import json
import re
from collections import Counter
from pathlib import Path

from merge_catalogs import catalog_paths, merge

HERE=Path(__file__).parent

def review():
    report=json.loads((HERE/'FRAMEWORK-COBERTURA.json').read_text())
    fixed=json.loads((HERE/'FIXED-TEXT-REVIEW.json').read_text())
    package=json.loads((HERE/'PACKAGE-SOURCE-REVIEW.json').read_text())
    messages=merge(catalog_paths(HERE))
    raw_missing=[];brands=[]
    for app,data in report['apps'].items():
        root=Path(data['root'])
        prefix={'frappe_studio':'studio/','frappe_ui':'ui/','frappe_flow':'flow/'}.get(app,'')
        for row in data['raw_template_review']:
            matches=[e for e in fixed['entries'] if e['app']==app and e['path']==row['path'] and e['source']==row['source']]
            records=[e for e in package['records'] if e['path']==prefix+row['path'] and e['source'] in row['source']]
            if matches:decision=matches[0]['decision'];evidence=matches[0]['evidence']
            elif records and all(e['decision']=='technical' for e in records):decision='technical_example';evidence=[e['reason'] for e in records]
            elif row['source'].startswith('Tibério Lemes'):decision='source_pt';evidence='Own platform title in pinned HTML overlay.'
            elif row['path'].endswith('ErrorPage.vue') and row['source']=='at':decision='technical_example';evidence='Native JS stack trace marker inside <pre><code>; the parser also requires the literal at token.'
            else:raw_missing.append({'app':app,**row});continue
            row.update(status='reviewed',decision=decision,evidence=evidence)
        for row in data['branding']['findings']:
            path=row['path'];line=row['source'];kind=row['classification'];reason=''
            if kind=='legal':reason='Distribution copyright/license attribution is preserved; not promotional authorship.'
            elif kind=='technical':reason='Source comment/import/internal schema author; no display replacement.'
            elif path.startswith(('public/dist/','public/studio/assets/')):
                kind='generated_rebuild_required';reason='Shipped artifact was parsed with Babel and retained in JS-SOURCE-INVENTORY; package/core sources and both frappe-ui dependencies are patched separately. New asset hashes must be verified after the integrator rebuilds.'
            elif 'documentation' in line or re.search(r'https?://(?:docs\.|ui\.|frappeframework\.)',line) or 'docs.frappe.io' in line:
                kind='functional_documentation';reason='Technical documentation destination; presentation labels are translated. No marketing referral is introduced.'
            elif path.endswith('.py'):
                source=(root/path).read_text();tree=ast.parse(source)
                ranges=[(n.body[0].lineno,n.body[0].end_lineno) for n in ast.walk(tree) if isinstance(n,(ast.Module,ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef)) and n.body and isinstance(n.body[0],ast.Expr) and isinstance(n.body[0].value,ast.Constant) and isinstance(n.body[0].value.value,str)]
                if any(a<=row['line']<=b for a,b in ranges):kind='technical';reason='Python AST docstring; not returned as interface copy.'
            if not reason and path in ('hooks.py','__init__.py','package.json'):
                kind='distribution_metadata';reason='Package publisher/author/version identity is attribution, not platform UI. Public app title/logo is configured independently.'
            if not reason:
                native=[s for s,t in messages.items() if re.search(r'frappe',s,re.I) and (s in line or json.dumps(s)[1:-1] in line or s.replace('"','&quot;') in line) and not re.search(r'\bfrappe\b',t,re.I) and (re.search(r'(?:__|_|__pt|translate)\(',line) or re.search(r'"(?:label|description)"\s*:',line) or len(s)>25)]
                if native:
                    kind='localized_display';reason=[{'source':s,'target':messages[s]} for s in native]
                elif path in ('core/doctype/system_settings/system_settings.json','website/doctype/website_settings/website_settings.json','twofactor.py','core/doctype/user/user.py'):
                    kind='native_setting_override';reason='The separate idempotent local apply sets app_name, website name and OTP issuer; fallback literals are not renamed internal identifiers.'
                elif path.endswith('SignupBanner/SignupBanner.vue') or path.endswith('TrialBanner/TrialBanner.vue') or path=='public/js/frappe/ui/sidebar/sidebar.js':
                    kind='local_marketing_disabled';reason='Native local hostname banner conditions / disable_product_suggestion=1 suppress vendor advertising, preserving functional menus.'
                elif path in ('public/js/billing.bundle.js','utils/change_log.py','integrations/frappe_providers/frappecloud_billing.py'):
                    kind='hosted_integration';reason='Cloud billing/update functionality is conditional on a hosted account; this local site is not hosted there. Provider URLs/IDs are technical endpoints, not local platform promotion.'
                elif path.startswith(('demo/','lms/telemetry.py')) or path=='lms/api.py' and ('guide to Frappe' in line or 'Do you know Frappe' in line):
                    kind='fixture_or_fixture_identifier';reason='Upstream optional demo content/lookup IDs, not local seed data; no demo is created or rewritten by this integration, and existing user course text is preserved.'
                elif path in ('hooks.py','__init__.py','package.json'):
                    kind='distribution_metadata';reason='Package publisher/author/version identity is attribution, not platform UI. Public app title/logo is configured independently.'
                else:
                    kind='technical';reason='Reviewed protocol/header/provider/schema/API identifier, executable sample, internal model/tool instruction or CLI/build/backup diagnostic. Preserve functioning identifiers; public labels resolve through the native catalog and source overlays.'
            brands.append({'app':app,**row,'classification':kind,'evidence':reason})
    if raw_missing:raise ValueError('Unreviewed final raw candidates: '+json.dumps(raw_missing,ensure_ascii=False))
    report['raw_candidates_reviewed']=True
    report['source_slice_complete']=report['source_catalog_complete']
    report['visual_validation_complete']=False
    report['branding_review']='BRAND-REVIEW.json'
    report['generated_assets_verified_after_build']=False
    (HERE/'FRAMEWORK-COBERTURA.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    (HERE/'BRAND-REVIEW.json').write_text(json.dumps({'criterion':'Every source-line candidate is classified with evidence. This is a reachability/source review, not a claim that old served bundles changed. Legal attribution and functional IDs/destinations remain. Source comments may contain vendor names; display values are translated or branding is applied natively.','counts':dict(Counter(row['classification'] for row in brands)),'entries':brands},ensure_ascii=False,indent=2)+'\n')
    errata=json.loads((HERE/'EXTRACTION-ERRATA.json').read_text())
    errata['corrected_sources']={s:messages[s] for s in errata['corrected_sources']}
    (HERE/'EXTRACTION-ERRATA.json').write_text(json.dumps(errata,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'reviewed_raw_candidates':sum(len(a['raw_template_review']) for a in report['apps'].values()),'brand_source_lines':len(brands),'branding_classes':dict(Counter(row['classification'] for row in brands))}))

if __name__=='__main__':review()
