"""Apply reviewed, hash-pinned source patches before bench build; no site access."""
import argparse
import hashlib
import json
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def apply(root, manifest):
    version = root / manifest.get("version_file", "__init__.py")
    expected = manifest.get("framework_version", manifest.get("payments_version", "16.60.2"))
    if f'__version__ = "{expected}"' not in version.read_text():
        raise RuntimeError("Unsupported app version: expected " + expected)
    pending = []
    seen = set()
    for patch in manifest["patches"]:
        path = (root / patch["path"]).resolve()
        if not path.is_relative_to(root.resolve()):
            raise ValueError("Patch path outside framework root")
        if path in seen:
            raise ValueError("Duplicate patch target: " + patch["path"])
        seen.add(path)
        original = path.read_bytes()
        if sha(original) == patch["after_sha256"]:
            continue
        if sha(original) != patch["before_sha256"]:
            raise RuntimeError("Incompatible source: " + patch["path"])
        content = original.decode()
        for replacement in patch["replacements"]:
            old, new = replacement[:2]
            count = replacement[2] if len(replacement) == 3 else 1
            if content.count(old) != count:
                raise RuntimeError("Unexpected patch target count: " + patch["path"])
            content = content.replace(old, new, count)
        encoded = content.encode()
        if sha(encoded) != patch["after_sha256"]:
            raise RuntimeError("Invalid patch result: " + patch["path"])
        pending.append((path, encoded))
    # Preflight every file before the first write. A second run is a no-op.
    for path, content in pending:
        path.write_bytes(content)
    return len(pending)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--framework", required=True, type=Path)
    parser.add_argument("--payments", required=True, type=Path)
    parser.add_argument("--framework-packages", required=True, type=Path,
                        help="Framework app root, containing frappe/, studio/, flow/, ui/")
    args = parser.parse_args()
    manifest = json.loads((Path(__file__).parent / "framework-overlay.json").read_text())
    print(json.dumps({"files_patched": apply(args.framework, manifest)}))
    if args.framework_packages:
        package_manifest = json.loads((Path(__file__).parent / "framework-package-overlay.json").read_text())
        print(json.dumps({"package_files_patched": apply(args.framework_packages, package_manifest)}))
        dependency_manifest = json.loads((Path(__file__).parent / "framework-dependency-overlay.json").read_text())
        print(json.dumps({"dependency_files_patched": apply(args.framework_packages, dependency_manifest)}))
    if args.payments:
        payments = json.loads((Path(__file__).parent / "payments-overlay.json").read_text())
        print(json.dumps({"payments_files_patched": apply(args.payments, payments)}))
