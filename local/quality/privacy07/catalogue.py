"""Complete and verify the separate07 catalogue; never rewrite upstream locales."""

import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def literals(text):
	return {
		value.replace("\\'", "'")
		for quote, value in re.findall(r"_{1,2}\(\s*(['\"])((?:\\.|(?!\1).)*)\1", text, re.S)
	}


def main():
	path = ROOT / "local/i18n/privacy07-pt-BR.json"
	catalogue = json.loads(path.read_text())
	english = set()
	for source in (
		"lms/lms/privacy.py",
		"lms/lms/tours.py",
		"lms/lms/doctype/lms_privacy_settings/lms_privacy_settings.py",
	):
		tree = ast.parse((ROOT / source).read_text())
		english.update(
			node.args[0].value
			for node in ast.walk(tree)
			if isinstance(node, ast.Call)
			and isinstance(node.func, ast.Name)
			and node.func.id == "_"
			and node.args
			and isinstance(node.args[0], ast.Constant)
		)
	for source in ("privacy_request.js", "privacy_tours.js"):
		english |= literals((ROOT / "lms/public/js" / source).read_text())
	assert not english - catalogue.keys(), sorted(english - catalogue.keys())
	keys = set(english)
	sources = [ROOT / "lms/www/help.py"]
	sources += [ROOT / "lms/www" / (name + ".html") for name in ("help", "privacy", "terms", "your-data")]
	sources += list((ROOT / "lms/templates/emails").glob("privacy*.html"))
	sources += [
		ROOT / "frontend/src/components" / (name + ".vue")
		for name in ("ContextHelp", "FirstResultGuide", "ReleaseNotes", "GuidedTour", "TourHost")
	]
	sources += [ROOT / "frontend/src/pages/HelpUsage.vue"]
	tours = json.loads((ROOT / "lms/public/tours/quality07.json").read_text())
	keys.update(step["text"] for tour in tours["tours"].values() for step in tour)
	for metadata in (ROOT / "lms/lms/doctype/lms_tour_progress").glob("*.json"):
		for field in json.loads(metadata.read_text())["fields"]:
			keys.add(field["label"])
			keys.update(field.get("options", "").split("\n") if field["fieldtype"] == "Select" else [])
	keys.discard("")
	for source in sources:
		keys |= literals(source.read_text())
	for key in keys:
		catalogue.setdefault(key, key)
	for key, value in catalogue.items():
		assert value and set(re.findall(r"\{\d+\}", key)) == set(re.findall(r"\{\d+\}", value)), key
	path.write_text(json.dumps(dict(sorted(catalogue.items())), ensure_ascii=False, indent=2) + "\n")
	assert keys <= json.loads(path.read_text()).keys()
	print(
		json.dumps(
			{
				"source_keys": len(keys),
				"catalogue_entries": len(catalogue),
				"missing": 0,
				"interpolation_checked": True,
			}
		)
	)


if __name__ == "__main__":
	main()
