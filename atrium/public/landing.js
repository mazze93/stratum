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

/**
 * Reconcile the baked plate against the live log (supersedes the earlier
 * swap-the-figure enhancement, at-013).
 *
 * The scrubber's frames are oracle projections baked at render time. Replacing
 * the figure with a live projection would leave the scrubber driving a figure
 * it no longer describes — the two would silently disagree, which is precisely
 * the failure this project exists to prevent. So the live log is *checked*
 * rather than substituted: if it matches, say so; if it has moved ahead, say
 * that too, and point at the instrument that renders it live.
 */
async function reconcile() {
  const live = $("fig-live");
  try {
    const res = await fetch("/api/logs/demo/projection");
    if (!res.ok) return;
    const projection = await res.json();
    const liveEpoch = projection?.epoch;
    /* An empty log projects at epoch -1. Reachable-but-empty is not a
       discrepancy worth shouting about (it's the normal state of a fresh
       local instance) — leave the plate's own caption standing. */
    if (typeof liveEpoch !== "number" || liveEpoch < 0) return;
    const bakedHead = FRAMES.length ? FRAMES[FRAMES.length - 1].epoch : null;

    if (bakedHead !== null && liveEpoch === bakedHead) {
      live.textContent = `LIVE LOG REACHED · IN SYNC AT EPOCH ${liveEpoch}`;
      live.classList.add("live");
    } else {
      live.textContent = `LIVE LOG AT EPOCH ${liveEpoch} · PLATE SHOWS ${bakedHead} — OPEN THE ATRIUM FOR LIVE`;
      live.classList.add("live");
    }
  } catch {
    /* offline: the plate is real data regardless — say nothing louder */
  }
}

/* ── Deterministic replay ─────────────────────────────────────────────
   FRAMES[e] is the oracle's projection at epoch e. The scrubber swaps
   between real projections; nothing here recomputes the fold. */
let FRAMES = [];
try {
  FRAMES = JSON.parse($("strata-frames")?.textContent || "[]");
} catch {
  FRAMES = [];
}

/* Rebuild a projection-shaped object by joining a frame to the baked records
   (frames carry status/authority; narratives live once, in the records). */
function frameToProjection(frame) {
  const map = byId();
  const narrative = (id) => (map.get(id)?.claim || {}).narrative || "";
  return {
    epoch: frame.epoch,
    authoritative: {
      recent_decisions: frame.decisions.map((d) => ({ ...d, narrative: narrative(d.id) })),
      foreclosed_options: frame.foreclosures.map((f) => ({ ...f, narrative: narrative(f.id) })),
    },
  };
}

function describe(frame) {
  const verified = frame.decisions.filter((d) => d.authority === "authoritative_verified").length;
  const pending = frame.decisions.filter((d) => d.authority === "authoritative_provisional").length;
  const head = FRAMES.length - 1;
  const atHead = frame.epoch === head;
  const headVerified = FRAMES[head]?.decisions.filter((d) => d.authority === "authoritative_verified").length ?? 0;
  const lost = headVerified - verified;
  const n = frame.decisions.length;
  return (
    `${n} decision${n === 1 ? "" : "s"} · ${verified} verified · ${pending} awaiting evidence · ` +
    `${frame.foreclosures.length} foreclosed` +
    (atHead
      ? ""
      : ` — ${lost > 0 ? `${lost} decision${lost === 1 ? "" : "s"} not yet verified here` : "earlier in the record"}`)
  );
}

function wireScrubber() {
  const el = $("epoch");
  const out = $("epoch-out");
  const read = $("scrub-read");
  if (!FRAMES.length) {
    $("scrub").hidden = true;
    return;
  }
  el.max = String(FRAMES.length - 1);
  el.value = String(FRAMES.length - 1);

  const apply = () => {
    const e = Number(el.value);
    const frame = FRAMES[e];
    if (!frame) return;
    const atHead = e === FRAMES.length - 1;
    out.textContent = `EPOCH ${e}${atHead ? " · HEAD" : ""}`;
    out.classList.toggle("is-past", !atHead);
    read.textContent = describe(frame);
    $("fig-well").innerHTML = drawStrata(frameToProjection(frame));
    close(); // a record open at a later epoch may not exist here
  };
  el.addEventListener("input", apply);
  apply();
}

function wireCopy() {
  const btn = $("install-copy");
  btn.addEventListener("click", async () => {
    const text = $("install-cmd").textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "COPIED";
    } catch {
      /* clipboard blocked (insecure context / permissions) — select instead,
         so the command is still one keystroke away rather than unreachable */
      const r = document.createRange();
      r.selectNodeContents($("install-cmd"));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      btn.textContent = "SELECTED";
    }
    setTimeout(() => (btn.textContent = "COPY"), 1600);
  });
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

/* The Atrium opens at whatever epoch you scrubbed to — the transition carries
   state, not just style: you keep looking at the same moment in the record. */
function wireHandoff() {
  for (const a of document.querySelectorAll('a[href="/atrium/"]')) {
    a.addEventListener("click", (e) => {
      const el = $("epoch");
      if (!el || !FRAMES.length) return;
      const epoch = Number(el.value);
      if (epoch === FRAMES.length - 1) return; // at head: no need to pin
      e.preventDefault();
      location.href = `/atrium/?log=demo&epoch=${epoch}`;
    });
  }
}

wireFigure();
wireScrubber();
wireCopy();
wirePlayground();
wireHandoff();
reconcile();
