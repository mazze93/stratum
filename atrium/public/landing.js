/**
 * Landing progressive enhancement (at-002).
 *
 * The plate ships with a static figure baked from the genesis trace.
 * If the live API is reachable, re-drill the section from the demo
 * log's projection — same drawing module, same determinism. On any
 * failure the static plate simply stands; a landing page cannot fail
 * closed.
 */
import { drawStrata } from "/strata-draw.js";

const $ = (id) => document.getElementById(id);

async function enhance() {
  try {
    const res = await fetch("/api/logs/demo/projection");
    if (!res.ok) return;
    const projection = await res.json();
    /* An empty or younger projection never replaces the baked plate —
       the static figure is real data; blank "live" data is not an upgrade. */
    const n =
      (projection?.authoritative?.recent_decisions?.length ?? 0) +
      (projection?.authoritative?.foreclosed_options?.length ?? 0);
    if (n === 0) return;
    const well = $("fig-well");
    const begin = "<!-- live projection -->";
    well.innerHTML = begin + drawStrata(projection);
    $("fig-source").textContent = "the live demo log";
    const live = $("fig-live");
    live.textContent = `LIVE PROJECTION · EPOCH ${projection.epoch}`;
    live.classList.add("live");
  } catch {
    /* static plate stands */
  }
}

function wirePlayground() {
  const btn = $("cta-playground");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const res = await fetch("/api/playground", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { log } = await res.json();
      location.href = `/atrium/?log=${encodeURIComponent(log)}`;
    } catch (e) {
      btn.disabled = false;
      const sub = btn.querySelector(".cta-sub");
      if (sub) sub.textContent = `playground unavailable — ${e.message}`;
    }
  });
}

wirePlayground();
enhance();
