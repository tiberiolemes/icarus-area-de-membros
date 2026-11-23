"""Fail if a dependency install/build replaced any reviewed localization patch."""
import hashlib
import json
import re
import sys
from pathlib import Path

bench = Path(__file__).resolve().parents[4]
here = Path(__file__).parent
sys.path.insert(0, str(here.parent / "quality/auth"))
from overlay import expected_after
sys.path.insert(0, str(here.parent / "quality/integration08"))
from compose_auth import verify_composed_auth
groups = {
    "framework-overlay.json": bench / "apps/frappe/frappe",
    "framework-package-overlay.json": bench / "apps/frappe",
    "framework-dependency-overlay.json": bench / "apps/frappe",
    "payments-overlay.json": bench / "apps/payments/payments",
    "frontend-context-overlay.json": bench / "apps/lms",
}
counts = {}
generated = []
for name, root in groups.items():
    patches = json.loads((here / name).read_text())["patches"]
    for row in patches:
        if name == "framework-overlay.json" and row["path"] == "public/studio/index.html":
            # Vite rebuilds this HTML from hash-checked studio/frontend/index.html.
            # Its fingerprinted asset URLs are outputs, so validate their integrity.
            html = (root / row["path"]).read_text()
            assert '<html lang="pt-BR">' in html
            assert '<title>Tibério Lemes — editor</title>' in html
            assert 'href="/assets/lms/images/assinatura-tiberio.svg"' in html
            urls = re.findall(r'(?:src|href)="(/assets/frappe/studio/[^\"]+)"', html)
            assert urls, "Studio output has no generated assets"
            for url in urls:
                assert (bench / url.lstrip("/")).is_file(), "Missing Studio asset: " + url
            generated.append({"path": row["path"], "sha256": hashlib.sha256(html.encode()).hexdigest(), "assets": len(urls)})
            continue
        actual = hashlib.sha256((root / row["path"]).read_bytes()).hexdigest()
        expected = row["after_sha256"]
        if name == "framework-overlay.json":
            expected = expected_after(row["path"], expected)
        assert actual == expected, f"Build changed reviewed source: {name}: {row['path']}"
    counts[name] = len(patches)
print(json.dumps({"applied_overlays_verified": counts, "generated_html_verified": generated,
                  "auth_files_verified": verify_composed_auth(bench / "apps/frappe/frappe")}))
