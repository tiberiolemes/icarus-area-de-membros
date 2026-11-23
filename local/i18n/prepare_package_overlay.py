"""Build reviewed, pinned source patches from the read-only AST plan. Never touches a site."""
import argparse
import json
import posixpath
import re
from pathlib import Path

from audit_framework import catalog
from merge_catalogs import catalog_paths, merge

HERE = Path(__file__).parent
PROPER = {
    "Anthropic", "Cerebras", "DeepSeek", "Github", "Gmail", "Google Gemini", "Groq", "Linkedin",
    "Mistral", "Ollama", "OpenAI", "OpenRouter", "Outlook", "SendGrid", "Yahoo", "Yandex", "xAI",
    "Jane Smith", "Jane Wayne", "John Smith", "John Wayne", "A", "EY", "V", "CC", "HTML", "TS", "URL",
    "Banana", "1h 30m 45s", "(query) => search", "(search) => query", "(to, from, savedPosition)",
    "boolean", "string", "text", "unset", "px", "x", "color", "html", "vue", "composables",
    "close_overdue_orders", "claude-sonnet-4-6", "lucide-type", "myapp.ai.tools.close_orders",
    "review-changes", "subject, description, resolution", '{"provider": {"zdr": true}}', '{"status": "Resolved"}',
    "{{ item.name }}", "ollama/llama3.2\nollama/qwen2.5", "{0}.value", "studio.{0}()", "1h 30m",
}


def technical(row):
    if row["kind"] == "template-code":
        return "Executable example, API identifier or keyboard key inside code/pre/kbd; retain original code."
    if row["kind"] == "script-code-argument":
        return "Argument/key used by executable code or autocomplete insertion; changing it changes behavior."
    if row["source"] in PROPER:
        return "Individually reviewed product/protocol/type, CSS token, code-format example, person example or valid Portuguese (Banana); see exact path/line."
    if re.fullmatch(r"text-ink-gray-[0-9]+", row["source"]):
        return "Tailwind CSS class used for calendar text styling, not a presentation label."
    if re.fullmatch(r"(?:https?://\S+|/studio|[\w.-]+\.(?:png|pdf|txt|zip)|[\w.-]+@example\.com|(?:imap|smtp)\.example\.com|openrouter\.ai/keys|ollama/[\w.:-]+|composables/useThing\.\{0\}|props\.\{0\}|sk-or-\.\.\.)", row["source"]):
        return "Literal route, filename, account/server example or model/module ID; presentation example retained, never used as an invented contact."
    return None


def helper(file):
    if file.startswith("studio/frontend/src/"):
        return 'import { translate as __pt } from "@framework/ui"'
    target = "flow/harness/ui/core/src/translate.js" if file.startswith("flow/") and "node_modules" not in file else "ui/src/utils/translate"
    relative = posixpath.relpath(target, posixpath.dirname(file))
    if not relative.startswith("."):
        relative = "./" + relative
    return 'import { ' + ('__' if target.endswith('.js') else 'translate') + ' as __pt } from ' + json.dumps(relative)


def generate(plan, messages, output):
    grouped = {}
    review = []
    missing = []
    for row in plan["records"]:
        reason = technical(row)
        record = {**row, "decision": "technical" if reason else "translated", "reason": reason}
        review.append(record)
        if reason:
            continue
        if row["source"] not in messages:
            missing.append(row)
            continue
        file = row["path"]
        args = ", [" + ", ".join(row.get("args", [])) + "]" if row.get("args") else ""
        call = "__pt(" + json.dumps(row["source"], ensure_ascii=False) + args + ")"
        if row["encoding"] != "text" and (row.get("leading") or row.get("trailing")):
            parts = ([json.dumps(row["leading"])] if row.get("leading") else []) + [call] + ([json.dumps(row["trailing"])] if row.get("trailing") else [])
            call = "(" + " + ".join(parts) + ")"
        original = plan["files"][file][row["start"]:row["end"]]
        if row["encoding"] == "text":
            replacement = re.match(r"^\s*", original)[0] + "{{ " + call + " }}" + re.search(r"\s*$", original)[0]
        elif row["encoding"] == "attribute":
            escaped = call.replace("&", "&amp;").replace('"', "&quot;").replace("'", "&#39;")
            replacement = ':' + row["kind"].split(":", 1)[1] + '="' + escaped + '"'
        elif row["encoding"] == "attribute-expression":
            replacement = call.replace("&", "&amp;").replace('"', "&quot;").replace("'", "&#39;")
        else:
            replacement = call
        if replacement == original:
            raise ValueError("Translation patch made no change: " + file + ": " + row["source"])
        grouped.setdefault(file, []).append((row["start"], row["end"], replacement))
    if missing:
        (HERE / "PACKAGE-PENDING-LITERALS.json").write_text(json.dumps(missing, ensure_ascii=False, indent=2) + "\n")
        raise ValueError("Unreviewed presentation literals: " + str(len(missing)))
    patched = {}
    for file, edits in grouped.items():
        source = plan["files"][file]
        unique = {(start, end): replacement for start, end, replacement in edits}
        edits = [(start, end, text) for (start, end), text in unique.items()]
        previous = len(source) + 1
        for start, end, replacement in sorted(edits, reverse=True):
            if end > previous:
                raise ValueError("Overlapping source edits: " + file)
            source = source[:start] + replacement + source[end:]
            previous = start
        statement = helper(file)
        if file.endswith(".vue"):
            setup = re.search(r"<script\b[^>]*\bsetup\b[^>]*>", source)
            if setup:
                source = source[:setup.end()] + "\n" + statement + "\n" + source[setup.end():]
            else:
                normal = re.search(r"<script\b([^>]*)>([\s\S]*?)</script>", source)
                if normal and re.search(r"\bsetup\s*\(", normal[2]):
                    raise ValueError("Existing Options setup needs explicit review: " + file)
                lang = ' lang="ts"' if normal and re.search(r'lang=[\"\']ts[\"\']', normal[1]) else ""
                source = "<script setup" + lang + ">\n" + statement + "\n</script>\n" + source
        else:
            source = statement + "\n" + source
        patched[file] = source
    output.write_text(json.dumps({"patched": patched, "review": review}, ensure_ascii=False, indent=2) + "\n")
    (HERE / "PACKAGE-PENDING-LITERALS.json").unlink(missing_ok=True)
    return patched


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--framework", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    messages = catalog(args.framework)
    messages.update(merge(catalog_paths(HERE)))
    plan = json.loads(args.plan.read_text())
    patched = generate(plan, messages, args.output)
    print(json.dumps({"files": len(patched), "records_reviewed": len(plan["records"])}))
