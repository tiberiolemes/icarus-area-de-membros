"""Offline source/catalog inventory. Never connects to a site or changes its data."""
import argparse
import ast
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path


def read_po(path):
    entries = []
    entry = {"source": "", "target": "", "context": "", "fuzzy": False, "paths": []}
    mode = None
    for line in path.read_text().splitlines() + [""]:
        if not line:
            if entry["source"]:
                entries.append(entry)
            entry = {"source": "", "target": "", "context": "", "fuzzy": False, "paths": []}
            mode = None
        elif line.startswith("#: "):
            entry["paths"].extend(line[3:].split())
        elif line.startswith("#, ") and "fuzzy" in line:
            entry["fuzzy"] = True
        elif line.startswith("msgctxt "):
            mode = "context"
            entry[mode] = ast.literal_eval(line[8:])
        elif line.startswith("msgid "):
            mode = "source"
            entry[mode] = ast.literal_eval(line[6:])
        elif line.startswith("msgstr "):
            mode = "target"
            entry[mode] = ast.literal_eval(line[7:])
        elif line.startswith('"') and mode:
            entry[mode] += ast.literal_eval(line)
    return entries


def catalog(root):
    result = {}
    for lang in ("pt", "pt_BR"):
        path = root / "locale" / (lang + ".po")
        if path.exists():
            result.update({e["source"] + (":" + e["context"] if e["context"] else ""): e["target"]
                           for e in read_po(path) if e["target"].strip() and not e["fuzzy"]})
    return result


def sources(root, native_js=None):
    """Literal native translation calls + user-facing schema labels/options, no user data."""
    found = {}
    def add(value, path):
        if isinstance(value, str) and value.strip():
            found.setdefault(value.strip(), set()).add(str(path.relative_to(root)))
    if native_js is not None:
        for relative, rows in native_js.items():
            for row in rows:
                add(row["source"], root / relative)
    def literals(text, path):
        for match in re.finditer(r'''(?<![\w])(?:__|_)\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')''', text):
            try:
                add(ast.literal_eval(match[1]), path)
            except (SyntaxError, ValueError):
                pass
    for path in root.rglob("*"):
        if not path.is_file() or any(p in path.parts for p in ("tests", "locale", "node_modules", "__pycache__")) or path.name.startswith("test_"):
            continue
        if path.suffix == ".json":
            try:
                data = json.loads(path.read_text())
            except (ValueError, UnicodeError):
                continue
            if isinstance(data, dict) and "fields" in data:
                add(data.get("name"), path)
                for field in data.get("fields", []):
                    for key in ("label", "description"):
                        add(field.get(key), path)
                    if field.get("fieldtype") == "Select":
                        for option in field.get("options", "").splitlines():
                            add(option, path)
            if isinstance(data, dict):
                # Native navigation and DocType toolbar actions are metadata,
                # independent of schema fields; preserve routes and identifiers.
                rows = data.get("items", []) if data.get("doctype") == "Sidebar" else data.get("actions", []) if data.get("doctype") == "DocType" else []
                for row in rows:
                    for key in ("label", "title"):
                        add(row.get(key), path)
                for key in ("html", "message", "subject", "content"):
                    if isinstance(data.get(key), str):
                        literals(data[key], path)
            continue
        if path.suffix not in (".py", ".js", ".html", ".vue", ".ts"):
            continue
        text = path.read_text(errors="replace")
        if path.suffix == ".py":
            try:
                tree = ast.parse(text)
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and node.args:
                    name = node.func.id if isinstance(node.func, ast.Name) else getattr(node.func, "attr", "")
                    if name in ("_", "__", "_lt", "N_") and isinstance(node.args[0], ast.Constant):
                        add(node.args[0].value, path)
        elif native_js is None or path.suffix == ".html":
            literals(text, path)
    return found


def raw_template_text(root):
    """Review candidates only: raw text does not become translated by adding a key."""
    class Text(HTMLParser):
        def __init__(self):
            super().__init__()
            self.hidden = 0
            self.values = []
        def handle_starttag(self, tag, attrs):
            if tag in ("style", "script"):
                self.hidden += 1
        def handle_endtag(self, tag):
            if tag in ("style", "script"):
                self.hidden = max(0, self.hidden - 1)
        def handle_data(self, value):
            value = " ".join(value.split())
            if not self.hidden and re.search(r"[A-Za-z]{2}", value):
                self.values.append(value)
    result = []
    for path in sorted([*root.rglob("*.html"), *root.rglob("*.vue")]):
        if any(part in ("test", "tests", "_test", "node_modules") for part in path.parts):
            continue
        text = path.read_text(errors="replace")
        text = re.sub(r"\{\{.*?\}\}|\{%.*?%\}|\{#.*?#\}", "", text, flags=re.S)
        parser = Text()
        parser.feed(text)
        for value in parser.values:
            result.append({"source": value, "path": str(path.relative_to(root)), "status": "manual_review"})
    return result


def allow_reason(source):
    if re.fullmatch(r"[\d\W]+", source) or re.fullmatch(r"[\d#,'. ]+", source):
        return "Literal punctuation, numeric choice or number mask; translating changes its meaning."
    if source in {"HH:mm", "HH:mm:ss", "dd-mm-yyyy", "dd.mm.yyyy", "dd/mm/yyyy", "mm-dd-yyyy", "mm/dd/yyyy", "yyyy-mm-dd"}:
        return "Native date/time mask; internal format tokens must remain intact."
    if source in {"Google Meet", "JavaScript", "Javascript", "Python", "Rust", "Zoom", "PAN", "PDF", "SCORM", "SEO", "URL", "UUID", "ID", "HTML", "CSS", "HMAC", "MCP", "SMS", "CC", "ESC", "Gantt", "Kanban", "Token", "Site", "Cache", "Menu", "Global", "Experimental", "Websocket", "frappectl", "vim", "emacs", "vscode", "jane@example.com", "john@doe.com", "API", "Fax", "Manual", "Mx", "Normal", "Original", "Portal", "Total", "Virtual", "Local", "WeasyPrint", "wkhtmltopdf", "GSTIN", "Excel", "GitHub", "Google Drive", "Console", "Link"}:
        return "Protocol/product name, technical identifier, identical Portuguese term or literal example; not vendor platform branding."
    if source in {"{0}", "{0} ({1})", "{0} ({1}) - {2}%", "{0} = {1}", "{0}: {1} vs {2}", "{0} M", "Re: {0}", "via {0}"}:
        return "Formatting, magnitude abbreviation or text identical in Portuguese; no untranslated sentence."
    return None


def branding(root):
    counts = {"legal": 0, "technical": 0, "visible_review": 0}
    findings = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in (".py", ".js", ".json", ".html", ".vue", ".svg"):
            continue
        if any(part in ("tests", "test", "_test", "locale", "__pycache__", "node_modules") for part in path.parts) or path.name.startswith("test_"):
            continue
        for number, line in enumerate(path.read_text(errors="replace").splitlines(), 1):
            if not re.search(r"\bFrappe\b|https?://[^\s\"']*(?:frappe\.io|frappecloud\.com|frappeframework\.com)", line):
                continue
            if re.search(r"Copyright|copyright|&copy;|License|license", line):
                kind = "legal"
            elif line.lstrip().startswith(("#", "//", "<!--", "import ", "from ")) or re.search(r'"(?:modified_by|owner)"\s*:', line):
                kind = "technical"
            else:
                kind = "visible_review"
            counts[kind] += 1
            findings.append({"path": str(path.relative_to(root)), "line": number, "classification": kind, "source": line.strip()[:300]})
    return {"criterion": "Capitalized vendor name or vendor URL, excluding test/locale/dependencies. Copyright/license is legal; imports/comments/schema authors are technical; all other candidates require reachability/visual review. Counts are source lines, not confirmed visible UI occurrences.", "counts": counts, "findings": findings}


def inventory(roots, destination, js_index=None):
    from merge_catalogs import merge, catalog_paths

    here = Path(__file__).parent
    paths = catalog_paths(here)
    local = merge([path for path in paths if path.exists()])
    reviewed = json.loads((here / "REVIEWED-SAME-TERMS.json").read_text())
    missing_catalogs = [str(path) for path in paths if not path.exists()]
    upstream = {}
    for root in roots.values():
        upstream.update(catalog(root))
    report = {"complete": False, "pending_catalogs": missing_catalogs, "js_parser_errors": js_index.get("errors", []) if js_index else [{"error": "AST index absent; source-only regex fallback is not completion evidence"}], "catalog_priority": [str(path.relative_to(here.parent)) for path in paths], "merged_catalog_entries": len(local), "versions": {"frappe": "16.60.2", "lms": "16.4.0", "payments": "16.0.1"}, "criterion": "Python AST, scope-aware Babel/Vue parser for all native JS/TS/Vue calls (including shipped bundles), inline HTML/Jinja and DocType name/label/description/Select options; exact files and SHA in JS-SOURCE-INVENTORY.json. Production frappe-ui and the published Vue Flow ESM dependencies included; native CodeMirror phrase API inventoried separately in CODEMIRROR-SOURCE-REVIEW.json; stories/tests are separately reviewed fixtures. Dynamic strings, runtime-generated values and raw HTML need manual review; source coverage is not browser coverage. Context-only/fuzzy PO translations do not prove generic coverage.", "allowlist_criteria": "Only numeric/punctuation/date masks, named protocols/languages/products, technical examples and interpolation-only formatting. No English sentence is waived.", "apps": {}}
    for name, root in roots.items():
        entries = []
        prefix = {"frappe_studio":"packages/studio/", "frappe_ui":"packages/ui/", "frappe_flow":"packages/flow/"}.get(name, name + "/")
        native = {path[len(prefix):]: rows for path,rows in js_index["messages"].items() if path.startswith(prefix)} if js_index else None
        if name == "frappe_ui" and native is not None:
            native.update({"../" + path[len("packages/"):]: rows for path,rows in js_index["messages"].items() if path.startswith("packages/node_modules/")})
        for source, paths in sorted(sources(root, native).items()):
            target = local.get(source, upstream.get(source, ""))
            reason = allow_reason(source) or reviewed.get(source, {}).get("reason")
            already_portuguese = source in {"Tibério Lemes", "Plataforma de aprendizagem de Tibério Lemes", "Versão da plataforma"}
            entries.append({"source": source, "target": source if already_portuguese else target, "paths": sorted(paths), "status": "source_pt" if already_portuguese else "allowlisted" if reason else "same" if target == source else "complemented" if source in local else "upstream" if target else "missing", **({"justification": reason} if reason else {})})
        raw = raw_template_text(root)
        report["apps"][name] = {"root": str(root), "counts": {status: sum(e["status"] == status for e in entries) for status in ("upstream", "complemented", "same", "missing", "allowlisted", "source_pt")}, "value_quality": {"source_entries": len(entries), "catalog_target_absent": sum(not e["target"].strip() for e in entries), "catalog_target_same": sum(e["target"] == e["source"] for e in entries), "absent_but_literal_allowed": sum(not e["target"].strip() and e["status"] == "allowlisted" for e in entries)}, "catalogs": {lang: {"sha256": hashlib.sha256((root / "locale" / (lang + ".po")).read_bytes()).hexdigest(), "entries": len(read_po(root / "locale" / (lang + ".po"))), "fuzzy": sum(e["fuzzy"] for e in read_po(root / "locale" / (lang + ".po"))), "contextual": sum(bool(e["context"]) for e in read_po(root / "locale" / (lang + ".po"))), "empty": sum(not e["target"].strip() for e in read_po(root / "locale" / (lang + ".po"))), "same": sum(e["target"] == e["source"] for e in read_po(root / "locale" / (lang + ".po")))} for lang in ("pt", "pt_BR") if (root / "locale" / (lang + ".po")).exists()}, "entries": entries, "raw_template_review": raw, "branding": branding(root)}
    report["fixed_text_review"] = "FIXED-TEXT-REVIEW.json"
    report["package_source_review"] = "PACKAGE-SOURCE-REVIEW.json"
    report["dependency_source_review"] = "DEPENDENCY-SOURCE-REVIEW.json"
    report["native_editor_phrases"] = "CODEMIRROR-SOURCE-REVIEW.json"
    report["extraction_errata"] = "EXTRACTION-ERRATA.json"
    report["source_catalog_complete"] = not missing_catalogs and bool(js_index) and not js_index.get("errors") and all(not app["counts"]["missing"] and not app["counts"]["same"] for app in report["apps"].values())
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--framework", type=Path, required=True)
    parser.add_argument("--payments", type=Path, required=True)
    parser.add_argument("--framework-packages", type=Path)
    parser.add_argument("--lms", type=Path, default=Path("lms"))
    parser.add_argument("--js-index", type=Path, required=True, help="Scope-aware Babel/Vue extraction and source provenance")
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "FRAMEWORK-COBERTURA.json")
    args = parser.parse_args()
    roots = {"frappe": args.framework, "payments": args.payments, "lms": args.lms}
    if args.framework_packages:
        roots.update({"frappe_" + name: args.framework_packages / name for name in ("studio", "ui", "flow")})
    report = inventory(roots, args.output, json.loads(args.js_index.read_text()))
    print(json.dumps({key: value["counts"] for key, value in report["apps"].items()}))
