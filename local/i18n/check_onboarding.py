"""Regress the native onboarding literal-expression gap found in the real admin UI."""

import argparse
import hashlib
import json
import re
from pathlib import Path


def verify(root):
	manifest = json.loads(Path(__file__).with_name("framework-package-overlay.json").read_text())
	paths = [
		"ui/src/components/Onboarding/" + name + ".vue"
		for name in ("GettingStartedBanner", "OnboardingSteps", "HelpModal")
	]
	for name in paths:
		text = (root / name).read_text()
		row = next(row for row in manifest["patches"] if row["path"] == name)
		assert hashlib.sha256(text.encode()).hexdigest() == row["after_sha256"], name
		assert not re.search(r'\{\{\s*([\'"])[A-Za-z][^{}\n]*?\1\s*\}\}', text), name
		assert not re.search(r':(?:label|aria-label)="\s*\'[A-Za-z][^\'\n]+\'\s*"', text), name
		assert "return `You need to complete" not in text, name
		if name.endswith("OnboardingSteps.vue"):
			assert "group-hover:flex" not in text and "data-onboarding-step" in text
			assert ':disabled="step.completed || isDependent(step)"' in text
			assert "changeStep($event, step, true)" in text and "changeStep($event, step, false)" in text
		if name.endswith("GettingStartedBanner.vue"):
			assert "cursor-pointer" not in text and '@click="closeCompleted"' in text
		assert "!min-h-11" in text and "focus-visible:ring-2" in text, name
	return len(paths)


if __name__ == "__main__":
	parser = argparse.ArgumentParser()
	parser.add_argument("--framework-app", type=Path, required=True)
	args = parser.parse_args()
	print(json.dumps({"native_onboarding_literal_sources_verified": verify(args.framework_app)}))
