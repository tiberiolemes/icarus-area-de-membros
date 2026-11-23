"""Offline regression checks. No Docker writes, database or email delivery."""
import copy
import importlib.util
import json
import ast
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from apply_overlay import apply as apply_overlay, sha
from audit_framework import catalog, read_po, sources
from merge_catalogs import merge, validate, catalog_paths, EXTRACTION_ARTIFACTS

HERE = Path(__file__).parent
ROOT = HERE.parents[1]


class CatalogTests(unittest.TestCase):
    def test_flow_uses_the_local_favicon_without_changing_internal_routes(self):
        manifest = json.loads((HERE / "framework-overlay.json").read_text())
        row = next(p for p in manifest["patches"] if p["path"] == "www/flow/index.html")
        target = row["replacements"][0][1]
        self.assertIn('type="image/svg+xml" href="/assets/lms/images/assinatura-tiberio.svg"', target)
        self.assertIn('{{ _("Flow") }}', target)

    def test_all_authored_entries_preserve_placeholders(self):
        result = merge([HERE / "framework-pt-BR.json", HERE / "server-pt-BR.json"])
        self.assertGreater(len(result), 1500)
        for key, value in result.items():
            validate(key, value)

    def test_rejects_missing_or_changed_placeholders_and_empty_values(self):
        for source, target in (("Hello {0}", "Olá"), ("Hi %s", "Olá %d"),
                               ("${name}", "${user}"), ("{{ otp }}", "{{ token }}"),
                               ("Hello", ""), ("Hello {0!r}", "Olá {0}")):
            with self.assertRaises(ValueError):
                validate(source, target)

    def test_frontend_wins_and_literal_space_is_not_imported(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.json"
            last = Path(directory) / "last.json"
            first.write_text('{"Batch":"Lote"}')
            last.write_text('{"Batch":"Turma", " ":" "}')
            self.assertEqual(merge([first, last]), {"Batch": "Turma"})

    def test_po_context_and_fuzzy_match_native_compilation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "locale").mkdir()
            (root / "locale/pt_BR.po").write_text(
                'msgctxt "Coins"\nmsgid "Change"\nmsgstr "Troco"\n\n'
                '#, fuzzy\nmsgid "Edit"\nmsgstr "Editar"\n\n'
                'msgid "Hello "\n"world"\nmsgstr "Olá "\n"mundo"\n')
            self.assertEqual(catalog(root), {"Change:Coins": "Troco", "Hello world": "Olá mundo"})

    def test_extraction_keeps_identifiers_and_finds_schema_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "doc.json").write_text(json.dumps({"name": "LMS Batch", "fields": [
                {"fieldname": "internal_name", "fieldtype": "Select", "label": "Status", "options": "Open\nClosed"}]}))
            (root / "page.vue").write_text("{{ __('Hello') }}")
            result = sources(root)
            self.assertEqual(set(result), {"LMS Batch", "Status", "Open", "Closed", "Hello"})
            self.assertNotIn("internal_name", result)

    def test_sidebar_and_toolbar_metadata_extract_labels_without_technical_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "sidebar.json").write_text(json.dumps({"doctype": "Sidebar", "items": [{"label": "Profiles", "link_to": "Role Profile", "route": "/internal"}]}))
            (root / "doctype.json").write_text(json.dumps({"doctype": "DocType", "actions": [{"label": "Clear Cache", "action": "clear_cache"}]}))
            self.assertEqual(set(sources(root)), {"Profiles", "Clear Cache"})

    def test_inventory_counts_and_lms_source_coverage(self):
        inventory = json.loads((HERE / "FRAMEWORK-COBERTURA.json").read_text())
        for app in inventory["apps"].values():
            self.assertEqual(sum(app["counts"].values()), len(app["entries"]))
            for status, count in app["counts"].items():
                self.assertEqual(count, sum(row["status"] == status for row in app["entries"]))
            self.assertTrue(all(row["paths"] for row in app["entries"]))
        self.assertEqual(inventory["apps"]["lms"]["counts"]["missing"], 0)
        self.assertEqual(inventory["apps"]["payments"]["counts"]["missing"], 0)

    def test_final_catalog_order_and_context_are_applied(self):
        paths = catalog_paths(HERE)
        names = [p.name for p in paths]
        self.assertEqual(names[-1], "context-overrides-pt-BR.json")
        self.assertLess(names.index("lms-pt-BR.json"), names.index("privacy07-pt-BR.json"))
        self.assertLess(names.index("framework-extra-a-pt-BR.json"), names.index("lms-pt-BR.json"))
        result=merge(paths)
        self.assertEqual(result["Batch"],"Turma")
        self.assertEqual(result["Gateway"],"Provedor de pagamento")
        self.assertEqual(result["Canvas"],"Área de edição")
        self.assertEqual(result["Reset your password"], "Redefina sua senha")
        self.assertTrue(EXTRACTION_ARTIFACTS.isdisjoint(result))
        self.assertEqual(result, json.loads((HERE/"merged-pt-BR.json").read_text()))
        with self.assertRaises(FileNotFoundError):
            merge([HERE/"catalog-does-not-exist.json"])

    def test_multiline_template_text_is_actually_replaced(self):
        from prepare_package_overlay import generate
        text="<template><p>\n  Hello\n  world\n</p></template>"
        original="\n  Hello\n  world\n"
        start=text.index(original)
        row={"path":"studio/frontend/src/Test.vue","source":"Hello world","start":start,"end":start+len(original),"kind":"template-text","encoding":"text","args":[],"leading":" ","trailing":" "}
        with tempfile.TemporaryDirectory() as directory:
            result=generate({"files":{row["path"]:text},"records":[row]}, {"Hello world":"Olá, mundo"},Path(directory)/"out.json")
        self.assertIn('{{ __pt("Hello world") }}',result[row["path"]])
        self.assertNotIn(original,result[row["path"]])

    def test_every_fixed_candidate_and_package_literal_has_a_decision(self):
        fixed=json.loads((HERE/"FIXED-TEXT-REVIEW.json").read_text())
        self.assertEqual(len(fixed["entries"]),335)
        self.assertTrue(all(row.get("decision") and row.get("evidence") for row in fixed["entries"]))
        source=json.loads((HERE/"PACKAGE-SOURCE-REVIEW.json").read_text())
        self.assertEqual(len(source["records"]),2101)
        self.assertTrue(all(row["decision"] in ("translated","technical") for row in source["records"]))
        for row in source["records"]:
            if row["decision"]=="technical":self.assertTrue(row["reason"])

    def test_visible_vendor_values_are_not_reintroduced(self):
        import re
        messages=merge(catalog_paths(HERE))
        for source,target in messages.items():
            # URLs are functional documentation targets; executable API names retain spelling.
            visible=re.sub(r'https?://[^\s\"\'<>]+', '',target)
            visible=re.sub(r'<code>.*?</code>|`[^`]*`', '', visible, flags=re.S)
            visible=re.sub(r'frappe\.[A-Za-z_][A-Za-z_0-9.]*', '', visible)
            visible=visible.replace('app.use(FrappeUI, { resources: true })','')
            self.assertFalse(re.search(r'\bFrappe\b|\bFrappeUI\b|\[frappe-ui\]',visible,re.I),(source,target))

    def test_published_dependency_variants_are_reviewed_and_pinned(self):
        manifest=json.loads((HERE/"framework-dependency-overlay.json").read_text())
        self.assertEqual(len(manifest["patches"]),3)
        self.assertEqual(manifest["dependency_versions"]["node_modules/@vue-flow/core"],"1.26.0")
        self.assertEqual(manifest["dependency_versions"]["studio/frontend/node_modules/@vue-flow/core"],"1.48.2")
        rows=json.loads((HERE/"DEPENDENCY-SOURCE-REVIEW.json").read_text())["records"]
        self.assertEqual(len(rows),144)
        self.assertTrue(all(r["decision"] in ("translated","technical") and r["reason"] for r in rows))

    def test_native_editor_phrases_have_translations(self):
        from finalize_package_overlay import PHRASES
        native=json.loads((HERE/"CODEMIRROR-SOURCE-REVIEW.json").read_text())
        required={key for dep in native["dependencies"].values() for key in dep["phrases"]}
        self.assertTrue(required.issubset(PHRASES))
        messages=merge(catalog_paths(HERE))
        for key in PHRASES:
            self.assertIn(key,messages)
            self.assertEqual(key.count("$"),messages[key].count("$"))

    def test_global_completion_waits_for_native_build_and_browser(self):
        inventory=json.loads((HERE/"FRAMEWORK-COBERTURA.json").read_text())
        self.assertFalse(inventory["complete"])
        self.assertTrue(inventory["source_catalog_complete"])
        self.assertEqual(inventory["js_parser_errors"],[])
        self.assertEqual(inventory["pending_catalogs"],[])


class OverlayTests(unittest.TestCase):
    def test_authentication_failure_translates_response_and_preserves_security_log(self):
        manifest = json.loads((HERE / "framework-overlay.json").read_text())
        method = next(r for r in manifest['patches'] if r['path'] == 'auth.py')['replacements'][0][1]
        events = []
        class AuthenticationError(Exception):
            pass
        fake = types.SimpleNamespace(local=types.SimpleNamespace(response={}),
            db=types.SimpleNamespace(commit=lambda: events.append('commit')),
            AuthenticationError=AuthenticationError)
        scope = {'frappe': fake, '_': lambda value: {'Invalid login credentials': 'Credenciais de acesso inválidas'}.get(value,value),
                 'add_authentication_log': lambda message,user,**kwargs: events.append((message,user,kwargs))}
        exec('class LoginManager:\n'+method, scope)
        with self.assertRaises(AuthenticationError):
            scope['LoginManager']().fail('Invalid login credentials', user='synthetic@example.test')
        self.assertEqual(fake.local.response['message'], 'Credenciais de acesso inválidas')
        self.assertEqual(events, [('Invalid login credentials','synthetic@example.test',{'status':'Failed'}), 'commit'])

    def test_idempotence_and_corrupt_source_preflight(self):
        manifest = {"patches": []}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "__init__.py").write_text('__version__ = "16.60.2"')
            for name in ("first.py", "last.py"):
                (root / name).write_text("before")
                manifest["patches"].append({"path": name, "before_sha256": sha(b"before"),
                    "after_sha256": sha(b"after"), "replacements": [["before", "after"]]})
            (root / "last.py").write_text("unexpected")
            with self.assertRaises(RuntimeError):
                apply_overlay(root, manifest)
            self.assertEqual((root / "first.py").read_text(), "before")
            (root / "last.py").write_text("before")
            self.assertEqual(apply_overlay(root, manifest), 2)
            self.assertEqual(apply_overlay(root, manifest), 0)
            (root / "__init__.py").write_text('__version__ = "17.0.0"')
            with self.assertRaises(RuntimeError):
                apply_overlay(root, manifest)

    def test_manifest_has_fixed_version_and_preserves_legal_notices(self):
        manifest = json.loads((HERE / "framework-overlay.json").read_text())
        self.assertEqual(manifest["framework_version"], "16.60.2")
        self.assertGreaterEqual(len(manifest["patches"]), 10)
        self.assertEqual(len(manifest["patches"]), len({row["path"] for row in manifest["patches"]}))
        for item in manifest["patches"]:
            self.assertEqual(len(item["before_sha256"]), 64)
            self.assertEqual(len(item["after_sha256"]), 64)
            self.assertNotIn("license", item["path"].lower())
            for replacement in item["replacements"]:
                before, after = replacement[:2]
                self.assertNotIn("Copyright", before)
                self.assertNotIn("&copy; Frappe Technologies", before)
                self.assertNotIn("CSRF", before)

    def test_language_selection_cannot_bypass_pt_br_before_csrf(self):
        manifest = json.loads((HERE / "framework-overlay.json").read_text())
        patch_data = next(row for row in manifest["patches"] if row["path"] == "translate.py")
        replacement = patch_data["replacements"][0][1]
        fragment = replacement[replacement.index('\tif frappe.local.site'):replacement.index('\tis_logged_in')]
        source = 'def get_language():\n' + fragment + '\n\treturn "en"\n'
        scope = {"frappe": types.SimpleNamespace(local=types.SimpleNamespace(site="tiberio.localhost"))}
        exec(compile(ast.parse(source), "native-language-patch", "exec"), scope)
        # No session/header/form access is needed to settle this site's language.
        self.assertEqual(scope["get_language"](), "pt-BR")


class LocalSettingsTests(unittest.TestCase):
    def setUp(self):
        self.state = {"User": {"Guest": {"language": "en"}, "Administrator": {"language": "en"},
                              "student@example.test": {"language": None}}, "Translation": {}}
        self.protected = {"course": "kept", "progress": 50, "password_hash": "kept", "roles": ["LMS Student"]}
        self.state["protected"] = copy.deepcopy(self.protected)
        fake = types.ModuleType("frappe")
        fake.local = types.SimpleNamespace(site="tiberio.localhost", lang="en")
        fake.conf = types.SimpleNamespace(lang=None)
        fake.conf.get = lambda key: getattr(fake.conf, key, None)
        fake.only_for = lambda role: None
        fake.clear_cache = lambda **kwargs: None
        fake.get_single = lambda doctype: self.doc(doctype, doctype)
        fake.get_doc = lambda doctype, name=None: self.doc(doctype, name)
        fake.get_all = self.get_all
        fake.db = types.SimpleNamespace(
            exists=lambda doctype, name: name in self.state.get(doctype, {}),
            set_value=lambda doctype, name, field, value, **kwargs: self.state[doctype][name].update({field: value}),
            get_value=lambda doctype, name, field: self.state.get(doctype, {}).get(name, {}).get(field),
            commit=lambda: None)
        translate = types.ModuleType("frappe.translate")
        translate.clear_cache = lambda: None
        translate.get_messages_for_boot = lambda: {"Hello":"Olá"}
        translate.set_default_language = lambda lang: None
        utils = types.ModuleType("frappe.utils")
        utils.sanitize_html = lambda text: text
        self.fake_utils = utils
        self.fake = fake
        self.modules = patch.dict(sys.modules, {"frappe": fake, "frappe.translate": translate, "frappe.utils": utils})
        self.modules.start()
        spec = importlib.util.spec_from_file_location("tiberio_localization_under_test", ROOT / "lms/tiberio_i18n.py")
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def tearDown(self):
        self.modules.stop()

    def doc(self, doctype, name=None):
        state = self.state
        if isinstance(doctype, dict):
            payload = doctype.copy()
            payload.setdefault("name", "translation-" + str(len(state["Translation"])))
            payload.setdefault("context", "")
            doctype = payload["doctype"]
            name = payload["name"]
        else:
            payload = state.setdefault(doctype, {}).setdefault(name, {}).copy()
        class Doc:
            def __init__(self):
                self.meta = types.SimpleNamespace(has_field=lambda key: True)
                self.__dict__.update(payload)
            def get(self, key, default=None):
                return self.__dict__.get(key, default)
            def update(self, values):
                self.__dict__.update(values)
            def save(self):
                state.setdefault(doctype, {})[name] = {k: v for k, v in self.__dict__.items() if k != "meta"}
                return self
            insert = save
        return Doc()

    def get_all(self, doctype, filters=None, pluck=None, fields=None):
        result = []
        for name, value in self.state.get(doctype, {}).items():
            if doctype == "User":
                condition = filters["language"]
                keep = value["language"] != "pt-BR" if condition[0] == "!=" else not value["language"]
                if keep:
                    result.append(name)
            elif doctype == "Translation":
                result.append(types.SimpleNamespace(**{k: value.get(k) for k in fields}))
        return result

    def test_existing_site_is_idempotent_and_preserves_protected_data(self):
        with tempfile.TemporaryDirectory() as directory:
            catalog_path = Path(directory) / "catalog.json"
            catalog_path.write_text('{"Hello":"Olá"}')
            first = self.module.apply(catalog_path)
            self.assertEqual(first["users_changed"], 3)
            self.assertEqual(first["translations_added"], 1)
            snapshot = copy.deepcopy(self.state)
            second = self.module.apply(catalog_path)
            self.assertEqual(second, {"settings_changed": 0, "users_changed": 0, "translations_added": 0, "translations_updated": 0, "fixture_changed": 0})
            self.assertEqual(self.state, snapshot)
            self.assertEqual(self.state["protected"], self.protected)
            catalog_path.write_text('{"Hello":"Oi"}')
            self.assertEqual(self.module.apply(catalog_path)["translations_updated"], 1)

    def test_only_exact_synthetic_fixture_can_be_rebranded(self):
        fixture = "desenvolvimento-com-agentes-de-ia-estudo-inicial"
        self.state["LMS Course"] = {fixture: {"description": self.module.INITIAL_DESCRIPTION, "progress": 50}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.json"
            path.write_text('{"Hello":"Olá"}')
            self.assertEqual(self.module.apply(path)["fixture_changed"], 1)
            self.assertEqual(self.state["LMS Course"][fixture]["progress"], 50)
            self.assertEqual(self.module.apply(path)["fixture_changed"], 0)
            self.state["LMS Course"][fixture]["description"] = "Conteúdo do usuário com Frappe"
            self.assertEqual(self.module.apply(path)["fixture_changed"], 0)
            self.assertEqual(self.state["LMS Course"][fixture]["description"], "Conteúdo do usuário com Frappe")

    def test_standard_app_icon_is_localized_without_renaming_or_custom_content(self):
        self.state["Desktop Icon"]={"Frappe Learning":{"standard":1,"app":"lms","label":"Frappe Learning","logo_url":"old"}}
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"catalog.json";path.write_text('{"Hello":"Olá"}')
            self.module.apply(path)
            icon=self.state["Desktop Icon"]["Frappe Learning"]
            self.assertEqual(icon["label"],"Tibério Lemes")
            self.assertEqual(icon["logo_url"],self.module.LOGO)
            self.assertEqual(self.module.apply(path)["settings_changed"],0)
            icon["standard"]=0;icon["label"]="Nome personalizado"
            self.module.apply(path)
            self.assertEqual(icon["label"],"Nome personalizado")

    def test_duplicate_records_and_native_sanitization_remain_idempotent(self):
        self.fake_utils.sanitize_html = lambda text: text.replace("'", '"')
        self.state["Translation"] = {name: {"name": name, "language": "pt-BR", "source_text": "Link",
            "translated_text": "Antigo", "context": ""} for name in ("first", "second")}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.json"
            path.write_text(json.dumps({"Link": "<a href='{0}'>Acessar</a>"}))
            self.assertEqual(self.module.apply(path)["translations_updated"], 2)
            self.assertEqual(self.module.apply(path)["translations_updated"], 0)
            self.assertEqual({row["translated_text"] for row in self.state["Translation"].values()}, {'<a href="{0}">Acessar</a>'})

    def test_website_hook_preserves_studio_ids_and_authored_favicon(self):
        class Context(dict):
            __getattr__=dict.get
            __setattr__=dict.__setitem__
        context=Context(app_name="internal-app-id",app_route="/synthetic",app_pages=[],favicon="/authored.svg",app_title="Título do usuário")
        self.module.website_context(context)
        self.assertEqual(context.app_name,"internal-app-id")
        self.assertEqual(context.favicon,"/authored.svg")
        self.assertEqual(context.app_title,"Título do usuário")
        self.assertEqual(context.translated_messages,{"Hello":"Olá"})
        regular=Context()
        self.module.website_context(regular)
        self.assertEqual(regular.app_name,"Tibério Lemes")
        self.assertEqual(regular.favicon,self.module.LOGO)

    def test_guest_and_new_users_always_use_pt_br(self):
        self.module.force_request_language()
        self.assertEqual(self.fake.local.lang, "pt-BR")
        user = types.SimpleNamespace(language="en")
        self.module.user_language(user)
        self.assertEqual(user.language, "pt-BR")

    def test_committed_localization_persists_worker_language_once(self):
        installer = types.ModuleType("frappe.installer")
        writes = []
        installer.update_site_config = lambda key, value: writes.append((key, value))
        with tempfile.TemporaryDirectory() as directory, patch.dict(sys.modules, {"frappe.installer": installer}):
            path = Path(directory) / "catalog.json"
            path.write_text('{"Hello":"Olá"}')
            self.assertEqual(self.module.apply_and_commit(path)["site_config_changed"], 1)
            self.assertEqual(self.fake.conf.lang, "pt-BR")
            self.assertEqual(writes, [("lang", "pt-BR")])
            self.assertEqual(self.module.apply_and_commit(path)["site_config_changed"], 0)
            self.assertEqual(writes, [("lang", "pt-BR")])
            self.assertEqual(self.state["protected"], self.protected)

    def test_failed_database_commit_does_not_write_worker_language(self):
        installer = types.ModuleType("frappe.installer")
        writes = []
        installer.update_site_config = lambda key, value: writes.append((key, value))
        def fail_commit():
            raise RuntimeError("synthetic commit failure")
        self.fake.db.commit = fail_commit
        with tempfile.TemporaryDirectory() as directory, patch.dict(sys.modules, {"frappe.installer": installer}):
            path = Path(directory) / "catalog.json"
            path.write_text('{"Hello":"Olá"}')
            with self.assertRaisesRegex(RuntimeError, "synthetic commit failure"):
                self.module.apply_and_commit(path)
            self.assertEqual(writes, [])
            self.assertIsNone(self.fake.conf.lang)

    def test_config_failure_propagates_and_explicit_rerun_completes(self):
        installer = types.ModuleType("frappe.installer")
        installer.update_site_config = unittest.mock.Mock(side_effect=[OSError("synthetic write failure"), None])
        self.fake.db.commit = unittest.mock.Mock()
        with tempfile.TemporaryDirectory() as directory, patch.dict(sys.modules, {"frappe.installer": installer}):
            path = Path(directory) / "catalog.json"
            path.write_text('{"Hello":"Olá"}')
            with self.assertRaisesRegex(OSError, "synthetic write failure"):
                self.module.apply_and_commit(path)
            self.assertEqual(self.fake.db.commit.call_count, 1)
            self.assertIsNone(self.fake.conf.lang)
            self.assertEqual(self.module.apply_and_commit(path)["site_config_changed"], 1)
            self.assertEqual(self.fake.conf.lang, "pt-BR")
            self.assertEqual(self.fake.db.commit.call_count, 2)
            self.assertEqual(installer.update_site_config.call_count, 2)

    def test_other_site_cannot_be_changed(self):
        self.fake.local.site = "other.localhost"
        original = copy.deepcopy(self.state)
        with self.assertRaises(RuntimeError):
            self.module.apply("unused")
        self.assertEqual(self.state, original)
        self.module.force_request_language()
        self.assertEqual(self.fake.local.lang, "en")

    def test_unauthorized_caller_cannot_read_catalog_or_change_data(self):
        def deny(role):
            raise PermissionError("Denied")
        self.fake.only_for = deny
        original = copy.deepcopy(self.state)
        with self.assertRaises(PermissionError):
            self.module.apply("does-not-exist")
        self.assertEqual(self.state, original)

    def test_vendor_filter_uses_exact_hostname_boundary(self):
        self.assertTrue(self.module.is_vendor_link("https://docs.frappe.io/learning"))
        self.assertFalse(self.module.is_vendor_link("https://frappe.io.example.test/"))
        self.assertFalse(self.module.is_vendor_link("/app/user"))
        self.assertTrue(self.module.is_vendor_promotion({"route": "https://frappe.io/support"}))
        self.assertFalse(self.module.is_vendor_promotion({"route": "https://docs.frappe.io/learning"}))


if __name__ == "__main__":
    unittest.main()
