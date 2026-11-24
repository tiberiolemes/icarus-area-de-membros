import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import "./stitch-icon.css";

const glyphs = {
  forward_10: "\ue056",
  arrow_back: "\ue5c4",
  bookmarks: "\ue98b",
  emoji_events: "\ue71a",
  forum: "\ue0bf",
  groups: "\uf233",
  leaderboard: "\uf20c",
  menu: "\ue5d2",
  notifications: "\ue7f4",
  person: "\ue7fd",
  play_circle: "\ue038",
  podcasts: "\uf048",
  school: "\ue80c",
} as const;

export function StitchIcon({ name, fallback }: { name: keyof typeof glyphs; fallback: ReactElement }) {
  const glyph = glyphs[name];
  const player = name === "forward_10";
  const family = player ? "Material Symbols Outlined" : "Material Symbols Outlined Mobile";
  const [loadedGlyph, setLoadedGlyph] = useState<string>();

  useEffect(() => {
    let active = true;
    void document.fonts?.load(`400 20px "${family}"`, glyph).then((faces) => {
      if (active && faces.length > 0) setLoadedGlyph(glyph);
    }, () => {
      // Keep the SVG visible if the browser cannot load the local font.
    });
    return () => { active = false; };
  }, [family, glyph]);

  return loadedGlyph === glyph
    ? <span className={player ? "stitch-icon" : "stitch-icon stitch-icon--mobile"} aria-hidden="true">{glyph}</span>
    : fallback;
}
