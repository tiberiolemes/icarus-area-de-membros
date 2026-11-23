"""Seal the08 catalog composition against the exact06 handoff, keeping its predecessor."""

import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
path = "frontend/src/translationMessages.js"
final = (root / path).read_text()
old = final
for name, source in (
	("authMessages", "local/quality/auth/pt-BR.json"),
	("privacyMessages", "local/i18n/privacy07-pt-BR.json"),
	("formMessages", "docs/audit/quality/evidence/02-new-messages.json"),
	("childMessages", "docs/audit/quality/evidence/11-child-content-pt-BR.json"),
	("integratedMessages", "local/i18n/integration08-pt-BR.json"),
):
	old = old.replace(f"import {name} from '../../{source}'\n", "")
old = old.replace("\t\t\t\tlookup(integratedMessages) ||\n", "")
old = old.replace(
	"(lookup(contextualMessages) ||\n\t\t\t\tlookup(privacyMessages) ||\n\t\t\t\tlookup(authMessages) ||\n\t\t\t\tlookup(childMessages) ||\n\t\t\t\tlookup(formMessages) ||\n\t\t\t\tlookup(communityMessages) ||",
	"(lookup(communityMessages) ||\n\t\t\t\tlookup(contextualMessages) ||",
)
expected = json.loads((root / "docs/audit/quality/06-community-moderation.json").read_text())[
	"source_sha256"
][path]
assert hashlib.sha256(old.encode()).hexdigest() == expected, "Cannot reconstruct the reviewed06 source"
manifest_path = root / "local/i18n/frontend-context-overlay.json"
previous = Path(__file__).parent / "frontend-context-pre08.json"
if not previous.exists():
	previous.write_bytes(manifest_path.read_bytes())
manifest = {
	"framework_version": "16.4.0",
	"version_file": "lms/__init__.py",
	"purpose": "Exact06 input and integrated08 output; historical manifest preserved in integration08/frontend-context-pre08.json; contexts retain final precedence.",
	"patches": [
		{
			"path": path,
			"before_sha256": expected,
			"after_sha256": hashlib.sha256(final.encode()).hexdigest(),
			"replacements": [[old, final]],
		}
	],
}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print("Verified exact06 preimage and sealed context composition08")
