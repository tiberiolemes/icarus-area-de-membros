import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { cache } from "../../src/api";
import { Ranking } from "../../src/pages/ranking";
import "../../src/style.css";

const params = new URLSearchParams(location.search);
const api = new URL(import.meta.env.VITE_SUPABASE_URL);
if (api.origin !== location.origin || api.hostname !== "127.0.0.1") throw new Error("Use a fixture isolada.");
document.documentElement.dataset.theme = params.get("theme") === "dark" ? "dark" : "light";
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={cache}>
    <Ranking memberId={params.get("role") === "staff" ? "fixture-staff" : "fixture-member"} />
  </QueryClientProvider>,
);
