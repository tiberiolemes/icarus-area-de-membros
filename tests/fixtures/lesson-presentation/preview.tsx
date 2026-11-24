import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/style.css";
import "../../../src/lesson-stitch.css";
import { LessonCta, LessonDescription } from "../../../src/pages/lesson-presentation";
import { initialLessonChecklist, lessonObjective, lessonPresentation } from "./content.mjs";

const params = new URLSearchParams(location.search);
const dark = params.get("theme") === "dark";
document.documentElement.dataset.theme = dark ? "dark" : "light";
const presentation = lessonPresentation(dark);

function Fixture() {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [checkedIds, setCheckedIds] = useState(initialLessonChecklist);
  const compare = params.has("compare");
  return (
    <main className="lesson-stitch fixture-shell" style={{ paddingTop: compare ? (dark ? 805 : 928) : 24 }}>
      <div className="stitch-lesson-main">
        {params.has("media") && (
          <video ref={video} src="./media.mp4" preload="metadata" hidden onLoadedMetadata={() => setReady(true)} />
        )}
        <div className="stitch-lesson-deck">
          <div id="lesson-description" role="tabpanel" aria-label="Descrição da aula">
            <LessonDescription
              body={lessonObjective}
              presentation={presentation}
              checkedIds={checkedIds}
              onCheck={(id, checked) => setCheckedIds((items) => checked ? [...items, id] : items.filter((item) => item !== id))}
              onSeek={ready ? (seconds) => { if (video.current) video.current.currentTime = seconds; } : undefined}
            />
          </div>
        </div>
        <LessonCta cta={presentation.cta} />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
