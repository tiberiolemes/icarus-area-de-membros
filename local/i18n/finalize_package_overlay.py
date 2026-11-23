"""Finalize the reviewed package patches and keep original/final hashes per file."""
import argparse
import difflib
import hashlib
import json
import posixpath
from pathlib import Path

from prepare_package_overlay import helper

HERE = Path(__file__).parent
PHRASES = ["Folded lines", "Unfolded lines", "Control character", "Selection deleted", "Completions", "Diagnostics", "No diagnostics", "Go to line", "close", "current match", "folded code", "go", "on line", "replaced $ matches", "replaced match on line $", "to", "unfold", "Find", "Replace", "next", "previous", "all", "match case", "regexp", "by word", "replace", "replace all", "Fold line", "Unfold line", "Fold all", "Unfold all"]


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def replacements(before, after):
    a, b = before.splitlines(keepends=True), after.splitlines(keepends=True)
    for context in (2, 4, 8, 16, 64, 10000):
        result = []
        current = before
        for group in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_grouped_opcodes(context):
            old = "".join(a[group[0][1]:group[-1][2]])
            new = "".join(b[group[0][3]:group[-1][4]])
            if not old or current.count(old) != 1:
                break
            current = current.replace(old, new, 1)
            result.append([old, new])
        else:
            if current == after:
                return result
    raise ValueError("Could not create uniquely targeted source patch")


def finalize(plan, transformed):
    originals = dict(plan["files"])
    patched = dict(transformed["patched"])
    def text(name):
        return patched.get(name, originals[name])
    def replace(name, old, new):
        source = text(name)
        if source.count(old) != 1:
            raise ValueError("Manual patch target drift: " + name + ": " + old)
        patched[name] = source.replace(old, new, 1)
    def add_import(name, statement):
        source = text(name)
        if statement in source:
            return
        if name.endswith(".vue"):
            import re
            script = re.search(r"<script\b[^>]*\bsetup\b[^>]*>", source)
            if not script:
                raise ValueError("Expected setup script: " + name)
            patched[name] = source[:script.end()] + "\n" + statement + "\n" + source[script.end():]
        else:
            patched[name] = statement + "\n" + source
    # Keep one native utility; source-owned static translations precede runtime records on this site.
    name = "ui/src/utils/translate.ts"
    patched[name] = '''import localMessages from "../../../../lms/local/i18n/merged-pt-BR.json"

/** Native host translator, with the reviewed local catalog on this platform. */
export function translate(message: string, args: unknown[] = []): string {
  const host = globalThis as typeof globalThis & { __?: (message: string, args?: unknown[]) => string; translatedMessages?: Record<string, string>; translated_messages?: Record<string, string>; frappe?: { _messages?: Record<string, string> } }
  const own = Object.prototype.hasOwnProperty
  const local = localMessages as Record<string, string>
  if (host.location?.hostname === "tiberio.localhost" && own.call(local, message)) {
    return local[message].replace(/\\{(\\d+)\\}/g, (match, index) => String(args[Number(index)] ?? match))
  }
  if (host.__) return host.__(message, args)
  const messages = host.frappe?._messages ?? host.translatedMessages ?? host.translated_messages ?? {}
  const text = own.call(messages, message) ? messages[message] : message
  return text.replace(/\\{(\\d+)\\}/g, (match, index) => String(args[Number(index)] ?? match))
}
'''
    name = "ui/src/utils/index.ts"
    patched[name] = text(name) + '\nexport { translate } from "./translate";\n'
    name = "flow/harness/ui/core/src/translate.js"
    relative = posixpath.relpath("../lms/local/i18n/merged-pt-BR.json", posixpath.dirname(name))
    patched[name] = 'import localMessages from ' + json.dumps(relative) + '\n' + originals[name]
    replace(name, '\tconst text = (context && messages?.[`${message}:${context}`]) || messages?.[message] || message', '''\tconst own = Object.prototype.hasOwnProperty
\tconst local = globalThis.location?.hostname === "tiberio.localhost" ? localMessages : {}
\tconst contextual = context && `${message}:${context}`
\tconst text = (contextual && own.call(local, contextual) && local[contextual]) ||
\t\t(own.call(local, message) && local[message]) ||
\t\t(contextual && messages?.[contextual]) || messages?.[message] || message''')
    for name in ("studio/frontend/src/data/componentFamilies.ts", "studio/frontend/src/utils/blockTemplate/familyTemplates.ts"):
        replace(name, '__pt("Frappe")', '__pt("Platform components")')
    # Supplier advertising has no place on the local platform; app functionality is retained.
    name = "ui/src/components/SignupBanner/SignupBanner.vue"
    replace(name, 'v-if="!isSidebarCollapsed"', 'v-if="!isSidebarCollapsed && !localPlatform"')
    replace(name, '<Button v-else ', '<Button v-else-if="!localPlatform" ')
    replace(name, 'redirectURL: "https://frappecloud.com/crm/signup"', 'redirectURL: "/login"')
    replace(name, 'const props = withDefaults', 'const localPlatform = globalThis.location?.hostname === "tiberio.localhost";\n\nconst props = withDefaults')
    name = "ui/src/components/TrialBanner/TrialBanner.vue"
    replace(name, 'const trialEndDays = ref(0);', 'const localPlatform = globalThis.location?.hostname === "tiberio.localhost";\nconst trialEndDays = ref(0);')
    replace(name, 'auto: true,', 'auto: !localPlatform,')
    # Translate complete sentences instead of grammatical fragments around a media type.
    import re
    for name in list(patched):
        if name.endswith("/MediaNodeView.vue"):
            original = originals[name]
            match = re.search(r"This \{\{ isVideo \? 'video' : 'image' \}\} hasn't yet been uploaded\.", original)
            if not match:
                raise ValueError("Media sentence drift: " + name)
            source = text(name)
            # The exact original sentence's node is the only fallback media label.
            pattern = r'\{\{ __pt\("This"\) \}\} \{\{ isVideo \? __pt\("video"\) : __pt\("image"\) \}\} \{\{ __pt\("hasn.t yet been uploaded\."\) \}\}'
            source, count = re.subn(pattern, '{{ __pt(isVideo ? "This video hasn\'t yet been uploaded." : "This image hasn\'t yet been uploaded.") }}', source)
            if count != 1:
                raise ValueError("Transformed media sentence drift: " + name)
            patched[name] = source
        if name.endswith("/KeyboardShortcut/KeyboardShortcut.vue"):
            replace(name, "sequences.join(', or ')", 'sequences.join(__pt(", or") + " ")')
    phrase_source = "EditorState.phrases.of({" + ", ".join(json.dumps(key) + ": __pt(" + json.dumps(key) + ")" for key in PHRASES) + "}),"
    for name in ("studio/frontend/src/components/Code.vue", "flow/frontend/src/settings/CodeField.vue"):
        add_import(name, helper(name))
        if name.startswith("flow/"):
            add_import(name, 'import { EditorState } from "@codemirror/state"')
            replace(name, 'const extensions = computed(() => [', 'const extensions = computed(() => [\n' + phrase_source)
        else:
            replace(name, 'import { Compartment, Extension } from "@codemirror/state"', 'import { EditorState, Compartment, Extension } from "@codemirror/state"')
            replace(name, 'const baseExtensions = [', 'const baseExtensions = [\n' + phrase_source)
    # Translate only display metadata at the field boundary. Values and tab identities stay raw.
    for name in originals:
        if name.startswith("ui/src/components/Fields/") and name.endswith(".vue"):
            source = text(name)
            changed = False
            for field in ("label", "description", "placeholder"):
                old = ':' + field + '=\"field.' + field + '\"'
                new = ':' + field + '=\"field.' + field + ' ? __pt(field.' + field + ') : field.' + field + '\"'
                if old in source:
                    source = source.replace(old, new)
                    changed = True
            if changed:
                patched[name] = source
                add_import(name, helper(name))
    for name in ("ui/src/components/Fields/SelectField.vue", "ui/src/components/Fields/AutocompleteField.vue"):
        replace(name, "({ label: o, value: o })", "({ label: __pt(o), value: o })")
    name = "ui/src/components/FormLayout/FormLayoutPart.vue"
    replace(name, ':label="part.label"', ':label="__pt(part.label)"')
    add_import(name, helper(name))
    name = "ui/src/components/FormLayout/tabIdentity.ts"
    source = text(name)
    # Existing planner translated the Details fallback; the identity function is untouched.
    source = source.replace('return label || (multipleTabs ?', 'return (label ? __pt(label) : label) || (multipleTabs ?')
    patched[name] = source
    add_import(name, helper(name))
    replace("ui/src/components/EmailAccounts/services.ts", 'logo: LOGOS + "frappe-mail.svg"', 'logo: "/assets/lms/images/assinatura-tiberio.svg"')
    replace("studio/frontend/src/components/Settings/AppSettings.vue", 'import defaultFavicon from "/favicon.png"', 'const defaultFavicon = "/assets/lms/images/assinatura-tiberio.svg"')
    # Native date/number localization; canonical stored formats remain unchanged.
    for prefix in ("studio/frontend/node_modules/frappe-ui/src/", "flow/node_modules/frappe-ui/src/"):
        name=prefix+"utils/dayjs.ts"
        add_import(name, "import 'dayjs/esm/locale/pt-br'")
        replace(name, "_dayjs.extend(customParseFormat)", "_dayjs.extend(customParseFormat)\nif (globalThis.location?.hostname === 'tiberio.localhost') _dayjs.locale('pt-br')")
        name=prefix+"utils/config.ts"
        replace(name, "() => ({})", "() => (globalThis.location?.hostname === 'tiberio.localhost' ? { systemTimezone: 'America/Sao_Paulo', localTimezone: 'America/Sao_Paulo' } : {})")
        name=prefix+"components/DatePicker/utils.ts"
        source=text(name)
        start=source.index('export const months: string[] = [')
        end=source.index('\n]',start)+2
        replacement="export const months: string[] = Array.from({ length: 12 }, (_, month) => dayjs().month(month).format('MMM'))"
        patched[name]=source[:start]+replacement+source[end:]
        name=prefix+"components/DatePicker/CalendarPanel.vue"
        replace(name, "const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']", "const WEEKDAYS = Array.from({ length: 7 }, (_, day) => dayjs('2026-11-22').add(day, 'day').format('dd'))")
        replace(name, "return cell.date.format('YYYY-MM-DD') + (cell.isToday ? ' (Today)' : '')", "return cell.date.format(globalThis.location?.hostname === 'tiberio.localhost' ? 'DD/MM/YYYY' : 'YYYY-MM-DD') + (cell.isToday ? ' (' + __pt('Today') + ')' : '')")
        add_import(name,helper(name))
        add_import(name, "import { dayjs } from '../../utils/dayjs'")
        for component,format in [("DatePicker","DD/MM/YYYY"),("DateRangePicker","DD/MM/YYYY"),("DateTimePicker","DD/MM/YYYY HH:mm:ss")]:
            name=prefix+"components/DatePicker/"+component+".vue"
            replace(name, "  variant: 'subtle',", "  variant: 'subtle',\n  format: globalThis.location?.hostname === 'tiberio.localhost' ? '"+format+"' : undefined,")
    for name in ("ui/src/components/GroupBy/GroupByTable.vue", "ui/src/components/GroupBy/groupBy.ts"):
        replace(name, 'new Intl.NumberFormat(undefined,', 'new Intl.NumberFormat("pt-BR",')
    for name in ("flow/frontend/src/pages/RecordForm.vue", "flow/frontend/src/settings/FieldControl.vue"):
        replace(name, '.toLocaleString()', '.toLocaleString("pt-BR")')
    name="flow/harness/ui/core/src/transcript.js"
    replace(name, 'd.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })', 'd.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false })')
    replace(name, 'd.toDateString() === new Date().toDateString()', 'd.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })')
    replace(name, 'd.toLocaleDateString([], { month: "short", day: "numeric" })', 'd.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "short", day: "numeric" })')
    name="ui/src/components/FormLayout/formatNumber.ts"
    replace(name, 'const DEFAULT_NUMBER_FORMAT = "#,###.##"', 'const DEFAULT_NUMBER_FORMAT = globalThis.location?.hostname === "tiberio.localhost" ? "#.###,##" : "#,###.##"')
    replace(name, 'new Intl.NumberFormat("en-US",', 'new Intl.NumberFormat("pt-BR",')
    name="flow/harness/ui/core/src/transcript.js"
    replace(name, 'if (cost < 0.001) return "<$0.001"\n\treturn `$${cost.toFixed(cost < 1 ? 3 : 2)}`', 'const precision = cost < 1 ? 3 : 2\n\tconst formatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: precision, maximumFractionDigits: precision }).format(Math.max(cost, 0.001))\n\treturn (cost < 0.001 ? "<" : "") + formatted')
    replace(name, 'if (!n) return "0"\n\tif (n < 1000) return String(n)\n\tif (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\\.0$/, "") + "k"\n\treturn (n / 1_000_000).toFixed(1).replace(/\\.0$/, "") + "M"', 'return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)')
    for prefix in ("studio/frontend/node_modules/frappe-ui/src/", "flow/node_modules/frappe-ui/src/"):
        name=prefix+"molecules/code-editor/useCodeEditor.ts"
        add_import(name,helper(name))
        replace(name, "      ...toValue(options.extensions),", "      ...(globalThis.location?.hostname === 'tiberio.localhost' ? ["+phrase_source+"] : []),\n      ...toValue(options.extensions),")
    patches = []
    for name, source in sorted(patched.items()):
        patches.append({"path": name, "before_sha256": digest(originals[name]), "after_sha256": digest(source), "replacements": replacements(originals[name], source)})
    # The harness has its own HTML entry, outside the JS/Vue source plan.
    entry_path = "flow/harness/ui/app/index.html"
    entry_original = '''<!doctype html>
<html lang="en">
\t<head>
\t\t<meta charset="utf-8" />
\t\t<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content" />
\t\t<link rel="icon" type="image/png" href="/flow.png" />
\t\t<title>Flow</title>
\t</head>
\t<body>
\t\t<div id="app"></div>
\t\t<script type="module" src="/src/main.js"></script>
\t</body>
</html>
'''
    entry_after = entry_original.replace('lang="en"', 'lang="pt-BR"').replace('type="image/png" href="/flow.png"', 'type="image/svg+xml" href="/assets/lms/images/assinatura-tiberio.svg"').replace('<title>Flow</title>', '<title>Tibério Lemes — assistente</title>')
    patches.append({"path":entry_path,"before_sha256":digest(entry_original),"after_sha256":digest(entry_after),"replacements":replacements(entry_original,entry_after)})
    # Preserve the already-reviewed entry-point patch, which is not a JS/Vue plan input.
    previous = json.loads((HERE / "framework-package-overlay.json").read_text())
    entry = next(row for row in previous["patches"] if row["path"] == "studio/frontend/index.html")
    patches.append(entry)
    manifest = {"framework_version": "16.60.2", "version_file": "frappe/__init__.py", "patches": patches}
    return manifest, patched


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--transformed", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text())
    transformed = json.loads(args.transformed.read_text())
    manifest, patched = finalize(plan, transformed)
    (HERE / "framework-package-overlay.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    args.output.write_text(json.dumps({"patched": patched, "review": transformed["review"], "codemirror_phrases": PHRASES}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"package_files": len(manifest["patches"])}))
