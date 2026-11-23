"""Read native settings tabs through observed Orca controls; never saves settings."""
import json
import shutil
import subprocess
from datetime import datetime, timezone
from browser_matrix import ROOT, call, observe

tabs = json.loads(call("eval", "--expression", '[...document.querySelectorAll("[role=tab]")].map(e=>({id:e.id,text:e.textContent.trim()}))')["result"])
assert len(tabs) == 22, "Open the native Settings dialog as Administrator on desktop first"
slugs = json.loads((ROOT/"local/i18n/FRONTEND-COBERTURA.json").read_text())["settings_slugs"]
running_image = subprocess.check_output(["docker","inspect","--format","{{.Image}}","tiberio-frappe-local-backend-1"],text=True).strip()
records = []
directory = ROOT/"local/evidence/i18n-settings-captures"
directory.mkdir(exist_ok=True)
for slug in slugs:
    if isinstance(slug, dict):
        slug = slug["slug"]
    tab = next((t for t in tabs if t["id"].endswith("-trigger-"+slug)), None)
    if not tab:
        assert slug.startswith("cloud-")
        records.append({"slug":slug,"rendered":False,"reason":"Native hosting-only feature; unavailable on this self-hosted site, no external service activated"})
    else:
        call("focus", "--element", "#"+tab["id"])
        effects = call("keypress", "--key", "Enter").get("effects", {})
        call("wait", "--fn", "document.getElementById("+json.dumps(tab["id"])+").getAttribute('aria-selected') === 'true'", "--timeout", "10000")
        call("wait", "--load", "networkidle", "--timeout", "12000")
        state = observe()
        assert state["width"] == 1440
        screenshot = call("screenshot")
        path = directory/(slug+"-desktop.png")
        shutil.copyfile(screenshot["path"], path)
        records.append({"slug":slug,"rendered":True,"running_image":running_image,"captured_utc":datetime.now(timezone.utc).isoformat(),"effects":effects,"observed":state,"screenshot":str(path.relative_to(ROOT))})
    (ROOT/"local/evidence/i18n-settings-admin-desktop.json").write_text(json.dumps(records,ensure_ascii=False,indent=2))
    print(json.dumps({"slug":slug,"rendered":bool(tab)}),flush=True)
