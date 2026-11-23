"""List literal messages introduced by this auth front for catalog verification."""

import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FILES = [
	"lms/lms/account_security.py",
	"lms/lms/doctype/lms_account_security/lms_account_security.py",
	"lms/public/js/account_password.js",
	"frontend/src/components/SessionInactivity.vue",
	"frontend/src/components/Profile/PasswordField.vue",
	"frontend/src/components/Profile/PasswordRequirements.vue",
	"frontend/src/components/Profile/TwoFactorSettings.vue",
	"frontend/src/components/Profile/FirstPasswordStep.vue",
	"frontend/src/components/Profile/ChangePasswordDialog.vue",
	"frontend/src/composables/usePasswordPolicy.ts",
]


def messages():
	texts = [(ROOT / name).read_text() for name in FILES]
	manifest = json.loads((Path(__file__).parent / "framework-overlay.json").read_text())
	texts.extend(new for row in manifest["patches"] for old, new in row["replacements"])
	pattern = re.compile(r"""(?:__|_)\(\s*((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))""")
	return sorted({ast.literal_eval(match[1]) for text in texts for match in pattern.finditer(text)})


if __name__ == "__main__":
	existing = json.loads((ROOT / "local/i18n/merged-pt-BR.json").read_text())
	print(json.dumps([key for key in messages() if key not in existing], ensure_ascii=False, indent=2))
