/**
 * Landing behaviour (at-002, at-012).
 *
 * Two jobs:
 *   1. Progressive enhancement — the plate ships with a figure baked from the
 *      genesis trace; if the live API is reachable, re-drill from the demo
 *      log's projection. On any failure the static plate stands. A landing
 *      page cannot fail closed.
 *   2. The audit panel — selecting a layer opens its full record: claim,
 *      evidence with checked/cited state, actor identity, the events that
 *      later acted on it, and the buried shadow. This is the difference
 *      between a thesis statement and an auditable ledger.
 */
import { drawStrata } from "/strata-draw.js";

const $ = (id) => document.getElementById(id);

/* Records behind the figure. Baked at render time; replaced wholesale if the
   live log answers, so the panel never describes a figure it isn't drawn from. */
let RECORDS = [];
try {
  RECORDS = JSON.parse($("strata-records")?.textContent || "[]");
} catch {
  RECORDS = [];
}
const byId = () => new Map(RECORDS.map((r) => [r.id, r]));

const TIER_LABEL = {
  authoritative_axiomatic: "AXIOMATIC",
  authoritative_verified: "VERIFIED",
  authoritative_provisional: "PENDING",
  narrative: "NARRATIVE",
};
/* Plain-language gloss for the marker types, so the panel explains itself
   without assuming the reader knows the ontology. */
const MARKER_GLOSS = {
  verification: "evidence checked — this is what promoted the claim",
  supersession: "replaced by a later decision",
  contradiction: "contradicted by a later event",
  ratification: "ratified by an authority",
  rejection: "rejected",
  dispute: "disputed — under review",
  invalidation: "evidence it relied on was invalidated",
  trust_root_revoked: "trust root revoked",
};

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const when = (ts) => (ts ? String(ts).replace("T", " ").replace(/[-+]\d\d:\d\d$/, "") : "no timestamp");

function evidenceRows(ev) {
  if (!ev || !ev.length) return `<p class="audit-none">No evidence attached — this record rests on declared authority or is awaiting it.</p>`;
  return `<ul class="audit-ev">${ev
    .map((e) => {
      const checked = Boolean(e.checked_at);
      return `<li class="${checked ? "is-checked" : "is-cited"}">
        <span class="audit-kind">${esc(e.kind)}</span>
        <span class="audit-ref">${esc(e.ref)}</span>
        <span class="audit-state">${checked ? `checked ${esc(when(e.checked_at))}` : "cited — not checked"}</span>
      </li>`;
    })
    .join("")}</ul>`;
}

function render(id) {
  const map = byId();
  const r = map.get(id);
  if (!r) return;

  /* Everything that later acted on this record — the audit trail proper. */
  const acting = RECORDS.filter((x) => (x.targets || []).includes(id));
  const shadow = (r.claim || {}).shadow;
  const ghosts = shadow?.ghost_edges || [];
  const isForeclosure = r.type === "foreclosure";

  $("audit-id").textContent = r.id;
  $("audit-body").innerHTML = `
    <div class="audit-meta">
      <span class="audit-badge audit-badge--${esc(r.type)}">${esc(r.type)}</span>
      <span class="micro dim">recorded by</span> <span class="audit-actor">${esc(r.agent_id)}</span>
      <span class="micro dim">·</span> <span class="micro">${esc(when(r.timestamp))}</span>
      ${r.is_trust_root ? `<span class="audit-badge audit-badge--root">TRUST ROOT</span>` : ""}
      <span class="micro dim">· entered as</span> <span class="micro">${esc(r.birth_status)}</span>
    </div>

    <h3 class="audit-h">${isForeclosure ? "What was closed" : "The claim"}</h3>
    <p class="audit-claim">${esc((r.claim || {}).narrative)}</p>

    <h3 class="audit-h">Evidence</h3>
    ${evidenceRows(r.evidence)}

    <h3 class="audit-h">${acting.length ? "What happened to it since" : "Nothing has acted on this record"}</h3>
    ${
      acting.length
        ? `<ul class="audit-trail">${acting
            .map(
              (a) => `<li>
                <span class="audit-badge audit-badge--${esc(a.type)}">${esc(a.type)}</span>
                <code>${esc(a.id)}</code>
                <span class="micro dim">by</span> <span class="audit-actor">${esc(a.agent_id)}</span>
                <span class="micro dim">·</span> <span class="micro">${esc(when(a.timestamp))}</span>
                <p class="audit-why">${esc(MARKER_GLOSS[a.type] || a.type)} — ${esc((a.claim || {}).narrative)}</p>
                ${evidenceRows(a.evidence)}
              </li>`
            )
            .join("")}</ul>`
        : `<p class="audit-none">No verification, supersession, or dispute targets this record. ${
            isForeclosure
              ? "The foreclosure still stands."
              : "It has neither been checked nor overturned."
          }</p>`
    }

    ${
      ghosts.length
        ? `<h3 class="audit-h">Roads not taken</h3><p class="audit-ghosts">${ghosts
            .map((g) => `<span class="ghost">${esc(g)}</span>`)
            .join("")}</p>`
        : ""
    }

    ${
      shadow
        ? `<h3 class="audit-h">Shadow — what the clean record buried</h3>
           <p class="audit-shadow">${esc(shadow.trace)}</p>
           <p class="micro dim">${esc(shadow.tag || "RECON")}${
             shadow.certainty != null ? ` · certainty ${esc(shadow.certainty)}` : ""
           } — ${
             shadow.tag === "TRACE"
               ? "sourced from deliberation surfaced at the time"
               : "reconstructed after the fact, and marked as such"
           }</p>`
        : ""
    }
  `;

  const panel = $("audit");
  panel.hidden = false;
  panel.classList.add("open");
  document.querySelectorAll(".stratum.is-selected").forEach((n) => n.classList.remove("is-selected"));
  document.querySelector(`.stratum[data-id="${CSS.escape(id)}"]`)?.classList.add("is-selected");
  $("audit-close").focus();
  panel.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
}

function close() {
  const panel = $("audit");
  panel.classList.remove("open");
  panel.hidden = true;
  document.querySelectorAll(".stratum.is-selected").forEach((n) => n.classList.remove("is-selected"));
}

/* Delegated so it survives the figure being re-drawn by the live enhancement. */
function wireFigure() {
  const well = $("fig-well");
  well.addEventListener("click", (e) => {
    const hit = e.target.closest("[data-id]");
    if (hit) render(hit.dataset.id);
  });
  well.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const hit = e.target.closest("[data-id]");
    if (!hit) return;
    e.preventDefault();
    render(hit.dataset.id);
  });
  $("audit-close").addEventListener("click", close);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("audit").hidden) close();
  });
}

async function enhance() {
  try {
    const [pRes, eRes] = await Promise.all([
      fetch("/api/logs/demo/projection"),
      fetch("/api/logs/demo/events"),
    ]);
    if (!pRes.ok || !eRes.ok) return;
    const projection = await pRes.json();
    const events = await eRes.json();
    const n =
      (projection?.authoritative?.recent_decisions?.length ?? 0) +
      (projection?.authoritative?.foreclosed_options?.length ?? 0);
    /* An empty or record-less live log never displaces the baked plate: the
       static figure is real data, and blank "live" data is not an upgrade. */
    if (n === 0 || !Array.isArray(events) || events.length === 0) return;

    close();
    $("fig-well").innerHTML = drawStrata(projection);
    RECORDS = events;
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

wireFigure();
wirePlayground();
enhance();
