#!/usr/bin/env python3
"""Inventory literal translation calls without installing build dependencies.

This is a source inventory, not a claim about rendered/state coverage.
"""
import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CALL = re.compile(r"(?<![\w.])(?:__|translate)\(\s*((?:'[^'\\]*(?:\\.[^'\\]*)*'|\"[^\"\\]*(?:\\.[^\"\\]*)*\"|`[^`]*`))", re.S)


def decode(value):
    if value.startswith('`'):
        return value[1:-1] if '${' not in value else None
    try:
        return ast.literal_eval(value)
    except (ValueError, SyntaxError):
        return None


def upstream():
    result = {}
    for entry in (ROOT / 'lms/locale/pt_BR.po').read_text().split('\n\n'):
        fields = {}
        key = None
        for line in entry.splitlines():
            if line.startswith(('msgid ', 'msgstr ')):
                key, value = line.split(' ', 1)
                fields[key] = ast.literal_eval(value)
            elif line.startswith('"') and key:
                fields[key] += ast.literal_eval(line)
        if fields.get('msgid') and fields.get('msgstr'):
            result[fields['msgid']] = fields['msgstr']
    return result


def inventory():
    messages = {}
    for path in sorted((ROOT / 'frontend/src').rglob('*')):
        if path.suffix not in ('.vue', '.js', '.ts') or 'tests' in path.parts or 'types' in path.parts:
            continue
        source = path.read_text()
        for match in CALL.finditer(source):
            value = decode(match[1])
            if value is not None and value.strip():
                messages.setdefault(value, []).append({
                    'path': str(path.relative_to(ROOT)),
                    'line': source.count('\n', 0, match.start()) + 1,
                })
    return messages


if __name__ == '__main__':
    messages = inventory()
    base = upstream()
    local_path = ROOT / 'local/i18n/lms-pt-BR.json'
    sys.path.insert(0, str(ROOT / 'local/i18n'))
    from merge_catalogs import catalog_paths, merge
    local = merge(catalog_paths(ROOT / 'local/i18n'))
    missing = {key: refs for key, refs in messages.items() if not local.get(key) and not base.get(key)}
    print(json.dumps({'literal_keys': len(messages), 'upstream_translated': len(base), 'missing_count': len(missing), 'missing': missing}, ensure_ascii=False, indent=2))
    sys.exit(bool(missing))
