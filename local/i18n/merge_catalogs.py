"""Merge catalogs; reviewed contextual corrections have final precedence."""
import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from string import Formatter

EXTRACTION_ARTIFACTS = {"Couldn\\", "Google sign-in isn\\", "That isn\\",
    "The Gmail or Google Workspace email ID you\\", "{0} sign-in isn\\", "document.F=Object"}


def catalog_paths(here, frontend=None):
    return [here.parent / "translations.json", here / "framework-pt-BR.json",
        here / "server-pt-BR.json", here / "framework-extra-a-pt-BR.json",
        here / "framework-extra-b-pt-BR.json", here / "framework-packages-pt-BR.json",
        frontend or here / "lms-pt-BR.json",
        here.parents[1] / "docs/audit/quality/evidence/02-new-messages.json",
        here.parent / "quality/auth/pt-BR.json", here / "quality-pt-BR.json",
        here / "community-pt-BR.json", here / "privacy07-pt-BR.json",
        here.parents[1] / "docs/audit/quality/evidence/11-child-content-pt-BR.json",
        here / "integration08-pt-BR.json",
        here / "context-overrides-pt-BR.json"]


def placeholders(text):
    fields = []
    try:
        for _, field, spec, conversion in Formatter().parse(text):
            if field is not None:
                fields.append((field, spec, conversion))
    except ValueError:
        # CSS/JS code samples can contain literal braces, checked by percent/JS rules below.
        pass
    return Counter(fields), Counter(re.findall(r"%(?:\([\w]+\))?[-+#0-9.]*[sdif]|\$\{[^}]+\}|\{\{.*?\}\}", text))


def validate(source, target):
    if not isinstance(source, str) or not source.strip() or not isinstance(target, str) or not target.strip():
        raise ValueError("Catalog contains a non-string or empty entry")
    if placeholders(source) != placeholders(target):
        raise ValueError("Changed placeholders: " + source)


def merge(paths):
    result = {}
    for path in paths:
        data = json.loads(path.read_text())
        if not isinstance(data, dict):
            raise ValueError("Catalog must be an object: " + str(path))
        for source, target in data.items():
            if path.name in ("framework-extra-a-pt-BR.json", "framework-extra-b-pt-BR.json") and source in EXTRACTION_ARTIFACTS:
                continue  # Errata: truncated minified-JS tokens, not display messages; inputs stay intact.
            if isinstance(source, str) and not source.strip() and target == source:
                continue  # A literal space is presentation spacing, never a Translation record.
            validate(source, target)
            result[source] = target
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--frontend", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--csv", type=Path)
    args = parser.parse_args()
    here = Path(__file__).parent
    result = merge(catalog_paths(here, args.frontend))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with args.csv.open("w", newline="") as stream:
            csv.writer(stream).writerows(sorted(result.items()))
    print(json.dumps({"translations": len(result)}))
