"""Observed route UAT through the versioned Orca browser CLI (no second browser)."""
import argparse
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

CLI = "/Applications/Orca.app/Contents/Resources/bin/orca"
PAGE = "f3bdeb5a-e6cd-408f-a158-f8bd68ed2516"
ROOT = Path(__file__).resolve().parents[2]
OBSERVE = r'''(() => {
 const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
 return {url:location.href,title:document.title,lang:document.documentElement.lang,
 text:document.body.innerText,
 labels:[...document.querySelectorAll('[aria-label],[placeholder],[title],img[alt]')].filter(visible).map(e=>({tag:e.tagName,aria:e.getAttribute('aria-label'),placeholder:e.getAttribute('placeholder'),title:e.getAttribute('title'),alt:e.getAttribute('alt')})),
 controls:[...document.querySelectorAll('button,input,select,textarea')].filter(visible).map(e=>({tag:e.tagName,type:e.type,text:e.tagName==='INPUT'?'':e.innerText,disabled:e.disabled})),
 width:innerWidth,documentWidth:document.documentElement.scrollWidth,
 loading:!!document.querySelector('[aria-busy="true"]'),
 frames:[...document.querySelectorAll('iframe')].map(frame=>{try{return {src:frame.src,text:frame.contentDocument?.body?.innerText,labels:[...frame.contentDocument.querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label'))}}catch{return {src:frame.src,crossOrigin:true}}}),
 favicon:document.querySelector('link[rel="icon"]')?.getAttribute('href')};
})()'''


def call(command, *args):
    result = subprocess.run([CLI, command, "--page", PAGE, *args, "--json"],
                            capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    assert data.get("ok"), data
    return data["result"]


def observe():
    state = json.loads(call("eval", "--expression", OBSERVE)["result"])
    state["evidence"] = {"captured_utc": datetime.now(timezone.utc).isoformat(), "running_image": subprocess.check_output(["docker", "inspect", "--format", "{{.Image}}", "tiberio-frappe-local-backend-1"], text=True).strip()}
    return state


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--viewport", choices=["desktop", "mobile"], required=True)
    parser.add_argument("--persona", default="admin")
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end", type=int, default=70)
    args = parser.parse_args()
    running_image = subprocess.check_output(["docker", "inspect", "--format", "{{.Image}}", "tiberio-frappe-local-backend-1"], text=True).strip()
    ids = json.loads((ROOT/".local/i18n-fixtures.json").read_text())["ids"]
    params = dict(courseName=ids["course"], chapterName=ids["chapter"], chapterNumber="1", lessonNumber="1",
                  batchName=ids["batch"], type="course", name=ids["course"], username="i18nqa-student",
                  job=ids["job"], jobName=ids["job"], quizID=ids["quiz"], questionName=ids["question"],
                  submission=ids["quizSubmission"], programName=ids["program"], assignmentID=ids["assignment"],
                  submissionName=ids["assignmentSubmission"], exerciseID=ids["exercise"],
                  submissionID=ids["exerciseSubmission"], doctype="LMS Enrollment", importName=ids["import"],
                  memberID=ids["student"])
    routes = json.loads((ROOT/"local/i18n/FRONTEND-COBERTURA.json").read_text())["routes"]
    dimensions = ["1440", "1000"] if args.viewport == "desktop" else ["390", "844"]
    target = ROOT/f"local/evidence/i18n-routes-{args.persona}-{args.viewport}.json"
    records = json.loads(target.read_text()) if target.exists() else []
    for index, route in enumerate(routes):
        if not args.start <= index < args.end:
            continue
        path = route["path"]
        if route["name"] in ("Profile", "ProfileEvaluator", "ProfileEvaluationSchedule"):
            params["username"] = "i18nqa-instructor"
        elif route["name"] == "ProfileEditForm":
            params["username"] = "administrator"
        else:
            params["username"] = "i18nqa-student"
        if route["name"] == "SCORMChapter":
            path = path.replace(":chapterName", ids["scorm"])
        elif route["name"] == "NotFound":
            path = "/pagina-inexistente-homologacao"
        path = re.sub(r":(\w+)\??", lambda m:params[m[1]], path)
        effects = call("goto", "--url", "http://tiberio.localhost:8088/lms"+path).get("effects", {})
        # Orca's desktop engine resets emulation on every navigation.
        call("viewport", "--width", dimensions[0], "--height", dimensions[1],
             *(["--mobile"] if args.viewport == "mobile" else []))
        # Media/PDF requests can stay open after the lesson is ready. Wait for
        # the actual native player/editor rather than treating a stream as idle.
        if route["name"] == "Lesson":
            call("wait", "--fn", "document.querySelector('video')?.readyState >= 1", "--timeout", "12000")
        elif route["name"] == "LessonForm":
            call("wait", "--selector", ".codex-editor__redactor", "--timeout", "12000")
        else:
            call("wait", "--load", "networkidle", "--timeout", "12000")
        state = observe()
        assert state["width"] == int(dimensions[0]), state["width"]
        if not state["text"].strip() or state["loading"]:
            call("wait", "--load", "networkidle")
            state = observe()
        record = {"index":index,"route":route,"persona":args.persona,"viewport":args.viewport,
                  "running_image":running_image,"captured_utc":datetime.now(timezone.utc).isoformat(),
                  "effects":effects,"observed":state}
        screenshot = call("screenshot")
        image_dir = ROOT / "local/evidence/i18n-route-captures"
        image_dir.mkdir(exist_ok=True)
        image_path = image_dir/f"{args.persona}-{args.viewport}-{index:02}.png"
        shutil.copyfile(screenshot["path"], image_path)
        record["screenshot"] = str(image_path.relative_to(ROOT))
        records = [r for r in records if r["index"] != index]+[record]
        target.write_text(json.dumps(sorted(records,key=lambda r:r["index"]),ensure_ascii=False,indent=2))
        print(json.dumps({"index":index,"route":route["name"],"title":state["title"],
                          "textLength":len(state["text"]),"overflow":state["documentWidth"]>int(dimensions[0])}),flush=True)


if __name__ == "__main__":
    main()
