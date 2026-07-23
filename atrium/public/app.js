/**
 * Atrium — the human control room. One rule holds everywhere:
 * everything on this screen is a projection of a real log.
 *
 * Arbitration actions are derived from the contract's transition system for
 * the event's CURRENT folded status — the UI can only offer what the guards
 * would accept, and a 409 (shown verbatim) means the gate spoke first.
 */

import { api, getToken, setToken } from "/api.js";
import { initTheme } from "/theme.js";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const OVERTURNED = new Set(["contradicted", "superseded", "rejected"]);
const TIER_LABELS = {
  authoritative_axiomatic: ["axiomatic", "Axiomatic — authority-declared"],
  authoritative_verified: ["verified", "Verified — evidence checked"],
  authoritative_provisional: ["provisional", "Provisional — pending or under review"],
  narrative: ["narrative", "Narrative — asserted, not canonical"],
};

/* ?epoch=N pins the opening view — the landing plate's scrubber hands its
   position over, so arriving here continues the same look at the record
   rather than resetting to head. Clamped on load once head is known. */
const _q = new URLSearchParams(location.search);
const _epochParam = Number.parseInt(_q.get("epoch") ?? "", 10);

const state = {
  log: _q.get("log") || "demo",
  projection: null,
  events: [],
  epoch: Number.isInteger(_epochParam) && _epochParam >= 0 ? _epochParam : null, // null = head
  head: -1,
};

const isPlayground = () => state.log.startsWith("playground-");
const canWrite = () => state.epoch === null && (isPlayground() || getToken() !== "");

// ---------------------------------------------------------------- toasts

function toast(kind, badge, message) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="badge">${esc(badge)}</span><span>${esc(message)}</span>`;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 5200);
}
const guardToast = (e) =>
  toast("err", e.status === 409 ? "409 · guard refused" : `${e.status || "error"}`, e.message);

// ---------------------------------------------------------------- data

async function refresh() {
  const [projection, events] = await Promise.all([
    api.projection(state.log, state.epoch ?? undefined),
    api.events(state.log),
  ]);
  state.projection = projection;
  state.events = events;
  state.head = events.length - 1;
  /* A handed-over ?epoch beyond this log's head is meaningless — fall back to
     head rather than rendering a pinned view of an epoch that doesn't exist. */
  if (state.epoch !== null && state.epoch >= state.head) state.epoch = null;
  render();
}

// ---------------------------------------------------------------- render

function render() {
  const p = state.projection;
  const decisions = p.authoritative.recent_decisions;
  const foreclosures = p.authoritative.foreclosed_options;
  const scrubbed = state.epoch !== null && state.epoch !== state.head;

  $("log-name").textContent = state.log;
  $("epoch-label").textContent = `EPOCH · ${p.epoch}`;
  $("scrub-badge").hidden = !scrubbed;
  $("btn-scrub-head").hidden = !scrubbed;

  const scrub = $("epoch-scrub");
  scrub.max = String(Math.max(state.head, 0));
  scrub.value = String(state.epoch ?? state.head);
  $("scrub-val").textContent = scrubbed
    ? `epoch ${p.epoch} of ${state.head}`
    : `at head (${state.head})`;

  $("stat-episodic").textContent = `${state.events.length} events · head ${state.head}`;

  renderArbitration(decisions, foreclosures);
  renderUnits(decisions, foreclosures);
  renderTiers(decisions, foreclosures);
  renderStream();
  renderWeather(decisions, foreclosures);
  renderEntryHint();
}

function unitRow(entry, kind) {
  const [tierClass] = TIER_LABELS[entry.authority];
  const chain = entry.revision_chain ? entry.revision_chain.length : 1;
  const inactive = kind === "foreclosure" && !entry.active;
  return `
    <button class="unit-row ${inactive ? "inactive" : ""}" data-id="${esc(entry.id)}">
      <div class="u-title">${esc(entry.narrative ?? "(no narrative)")}</div>
      <span class="epi ${tierClass}">${tierClass}</span>
      <div class="u-meta">
        <span class="mono">${esc(entry.id)}</span>
        <span>status · ${esc(entry.status)}</span>
        ${kind === "decision" && chain > 1 ? `<span class="chain-pips" title="revision chain depth ${chain}">${"●".repeat(Math.min(chain, 8))}</span>` : ""}
        ${kind === "foreclosure" ? `<span>${entry.active ? "standing" : "reopened / overturned"}</span>` : ""}
      </div>
    </button>`;
}

function renderUnits(decisions, foreclosures) {
  $("decisions-count").textContent = `${decisions.length}`;
  $("foreclosures-count").textContent = `${foreclosures.length}`;
  $("decision-list").innerHTML =
    decisions.map((d) => unitRow(d, "decision")).reverse().join("") ||
    `<div class="unit-empty">No decisions yet — the log is listening.</div>`;
  $("foreclosure-list").innerHTML =
    foreclosures.map((f) => unitRow(f, "foreclosure")).reverse().join("") ||
    `<div class="unit-empty">No roads closed yet.</div>`;
  document.querySelectorAll(".unit-row").forEach((el) =>
    el.addEventListener("click", () => openInspector(el.dataset.id)),
  );
}

function needsJudgment(entry) {
  return entry.status === "disputed" || entry.authority === "authoritative_provisional";
}

function renderArbitration(decisions, foreclosures) {
  const items = [...decisions, ...foreclosures].filter(
    (e) => e.status === "disputed" || e.status === "pending_evidence",
  );
  const block = $("arbitration-block");
  block.hidden = items.length === 0;
  if (items.length === 0) return;
  $("arb-count").textContent = `${items.length} pending`;
  $("arb-list").innerHTML = items
    .map(
      (e) => `
      <div class="arb-item">
        <span class="epi ${e.status === "disputed" ? "blocked" : "provisional"}">${esc(e.status)}</span>
        <span>${esc(String(e.narrative ?? e.id).slice(0, 90))}${String(e.narrative ?? "").length > 90 ? "…" : ""}</span>
        <span class="why">${e.status === "disputed" ? "a dispute stands against this claim" : "awaiting checked evidence"}</span>
        <button class="hbtn small" data-id="${esc(e.id)}">Adjudicate</button>
      </div>`,
    )
    .join("");
  block.querySelectorAll("button[data-id]").forEach((el) =>
    el.addEventListener("click", () => openInspector(el.dataset.id)),
  );
}

function renderTiers(decisions, foreclosures) {
  const counts = {};
  for (const e of [...decisions, ...foreclosures]) counts[e.authority] = (counts[e.authority] || 0) + 1;
  $("tier-legend").innerHTML = Object.entries(TIER_LABELS)
    .map(
      ([tier, [cls, label]]) => `
      <div class="tier-row">
        <span class="epi ${cls}">${cls}</span>
        <span>${esc(label.split("—")[1].trim())}</span>
        <span class="count">${counts[tier] || 0}</span>
      </div>`,
    )
    .join("");
}

function renderStream() {
  const upto = state.epoch ?? state.head;
  const visible = state.events.filter((_, seq) => seq <= upto);
  $("feed-list").innerHTML = visible
    .map((ev, seq) => ({ ev, seq }))
    .reverse()
    .slice(0, 40)
    .map(({ ev, seq }) => {
      const target = ev.targets && ev.targets.length ? ` → ${esc(ev.targets[0])}` : "";
      const checked = (ev.evidence || []).some((x) => x.checked_at);
      const snippet = ev.claim && ev.claim.narrative ? ` · ${esc(String(ev.claim.narrative).slice(0, 64))}${String(ev.claim.narrative).length > 64 ? "…" : ""}` : "";
      return `
      <li class="feed-item">
        <span class="feed-seq">#${seq}</span>
        <span><b>${esc(ev.agent_id)}</b> <span class="etype ${checked ? "ok" : ""}">${esc(ev.type)}</span>${target}${snippet}
          · <button data-id="${esc(ev.id)}">inspect</button></span>
      </li>`;
    })
    .join("");
  $("feed-list").querySelectorAll("button[data-id]").forEach((el) =>
    el.addEventListener("click", () => openInspector(el.dataset.id)),
  );
}

function renderWeather(decisions, foreclosures) {
  const all = [...decisions, ...foreclosures];
  const anchored = all.filter(
    (e) => e.authority === "authoritative_verified" || e.authority === "authoritative_axiomatic",
  ).length;
  const agents = new Set(state.events.slice(0, (state.epoch ?? state.head) + 1).map((e) => e.agent_id));
  const judgment = all.filter((e) => e.status === "disputed" || e.status === "pending_evidence").length;

  $("weather-cirrus").textContent = all.length ? `${anchored}/${all.length} anchored` : "empty sky";
  $("weather-cumulus").textContent = `${agents.size} agent${agents.size === 1 ? "" : "s"} recorded`;
  $("weather-stratus").textContent = `${state.events.length} events · epoch ${state.projection.epoch}`;
  const nimbus = $("weather-nimbus");
  nimbus.textContent = judgment === 0 ? "quiet" : `${judgment} awaiting judgment`;
  nimbus.classList.toggle("alert", judgment > 0);
}

function renderEntryHint() {
  const hint = $("entry-hint");
  const section = $("new-entry-section");
  if (state.epoch !== null && state.epoch !== state.head) {
    section.style.opacity = ".45";
    hint.textContent = "Viewing a past epoch — the log is append-only; return to head to write.";
  } else if (!canWrite()) {
    section.style.opacity = ".45";
    hint.textContent =
      state.log === "demo"
        ? "The demo log is read-only. Fork a playground to write, or set a token."
        : "Set a bearer token to write to this log.";
  } else {
    section.style.opacity = "1";
    hint.textContent = isPlayground()
      ? "This playground is yours — appends run the full contract guards."
      : "Appends run the full contract guards.";
  }
}

// ---------------------------------------------------------------- inspector

const drawer = $("inspector");
const newId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
const agentId = () => (isPlayground() ? "atrium-visitor" : "atrium-operator");

function markerRecord(type, targetId, evidence = []) {
  return {
    id: newId(type.slice(0, 3)),
    type,
    agent_id: agentId(),
    schema_version: 1,
    birth_status: "asserted",
    claim: {},
    evidence,
    targets: [targetId],
    is_trust_root: false,
    timestamp: new Date().toISOString(),
  };
}

async function act(record, okMsg) {
  try {
    await api.append(state.log, record);
    toast("ok", "appended", okMsg);
    await refresh();
    await openInspector(record.targets[0]);
  } catch (e) {
    guardToast(e);
  }
}

/** Legal human actions per current folded status — mirrors TRANSITIONS. */
function actionsFor(detail) {
  const id = detail.record.id;
  const acts = [];
  const writeable = canWrite();
  switch (detail.status) {
    case "asserted":
      acts.push(
        { label: "Ratify — declare axiomatic", cls: "primary", type: "ratification", note: "Human ratification: trusted by authority, not evidence. Projects as AXIOMATIC — never as verified." },
        { label: "Dispute", cls: "danger", type: "dispute" },
      );
      break;
    case "pending_evidence":
      acts.push(
        { label: "Attest verification", cls: "primary", type: "verification", evidence: true, note: "Verification requires CHECKED evidence (I1). Your attestation records what you checked and when." },
        { label: "Reject", cls: "danger", type: "rejection" },
        { label: "Dispute", cls: "", type: "dispute" },
      );
      break;
    case "disputed":
      acts.push(
        { label: "Attest verification — dispute fails", cls: "primary", type: "verification", evidence: true, note: "Verification requires CHECKED evidence (I1)." },
        { label: "Reject — dispute stands", cls: "danger", type: "rejection" },
      );
      break;
    case "validated":
      acts.push({ label: "Contradict", cls: "danger", type: "contradiction", note: "Contradiction never deletes — the chain stays projected (I2)." });
      break;
    case "contradicted":
      acts.push({ label: "Ratify — human re-open", cls: "primary", type: "ratification" });
      break;
    default:
      break;
  }
  if (detail.status === "ratified") {
    return {
      html: `<p class="note">RATIFIED is quorum-guarded: revocation requires a <span class="mono">trust_root_revoked</span> event carrying ≥2 distinct CHECKED policy-authority signatures. No single click grants that — by design.</p>`,
      bind: () => {},
    };
  }
  if (!writeable || acts.length === 0) return { html: "", bind: () => {} };

  const html = `
    <div class="insp-actions">
      ${acts
        .map(
          (a, i) => `
        ${a.evidence ? `<div class="act-evidence"><input class="text-input" id="act-ev-${i}" placeholder="evidence ref you checked — commit, test run, URL" /></div>` : ""}
        <button class="btn ${a.cls}" id="act-${i}">${esc(a.label)}</button>
        ${a.note ? `<p class="note">${esc(a.note)}</p>` : ""}`,
        )
        .join("")}
    </div>`;
  const bind = () => {
    acts.forEach((a, i) => {
      $(`act-${i}`).addEventListener("click", () => {
        let evidence = [];
        if (a.evidence) {
          const ref = $(`act-ev-${i}`).value.trim();
          if (!ref) { toast("err", "evidence", "A checked evidence ref is required to verify (I1)."); return; }
          evidence = [{ kind: "human_attestation", ref, checked_at: new Date().toISOString(), signer: agentId() }];
        }
        act(markerRecord(a.type, id, evidence), `${a.type} → ${id}`);
      });
    });
  };
  return { html, bind };
}

async function liveInvalidationsFor(detail) {
  const refs = new Set(detail.evidence_refs);
  if (refs.size === 0) return [];
  const invalidations = state.events.filter(
    (ev) => ev.type === "invalidation" && ev.targets.length && refs.has(ev.targets[0]),
  );
  const detailed = await Promise.all(
    invalidations.map((ev) => api.eventDetail(state.log, ev.id).catch(() => null)),
  );
  return detailed.filter((d) => d && !OVERTURNED.has(d.status));
}

async function openInspector(id) {
  let detail;
  try {
    detail = await api.eventDetail(state.log, id);
  } catch (e) {
    guardToast(e);
    return;
  }
  const r = detail.record;
  const [tierClass] = TIER_LABELS[detail.authority] || ["narrative"];
  const shadow = r.claim && r.claim.shadow;
  const live = detail.under_review ? await liveInvalidationsFor(detail) : [];

  const evidenceHtml = (r.evidence || []).length
    ? `<div class="lineage-box">
        <span class="mono-label">Evidence — checked counts, cited does not</span>
        ${r.evidence
          .map(
            (e) => `
          <div class="evidence-node ${e.checked_at ? "" : "cited"}">
            <span class="ekind">${esc(e.kind)}${e.signer ? ` · ${esc(e.signer)}` : ""}</span>
            <span class="eref">${esc(e.ref)}</span>
            <span class="echeck ${e.checked_at ? "checked" : "cited"}">${e.checked_at ? `checked · ${esc(e.checked_at)}` : "cited — not checked"}</span>
          </div>`,
          )
          .join("")}
      </div>`
    : "";

  const shadowHtml = shadow
    ? `<div class="shadow-box">
        <div class="sh-head">
          <span class="mono-label">Shadow trace — what the clean record buried</span>
          <span class="sh-tag ${shadow.tag === "TRACE" ? "trace" : "recon"}">${esc(shadow.tag || "RECON")}</span>
        </div>
        <p class="sh-text">${esc(shadow.trace || "")}</p>
        ${typeof shadow.certainty === "number"
          ? `<div class="certainty">
               <span class="mono-label">certainty ${shadow.certainty.toFixed(2)}</span>
               <div class="bar"><div class="fill" style="width:${Math.round(shadow.certainty * 100)}%"></div></div>
             </div>`
          : ""}
        ${Array.isArray(shadow.ghost_edges) && shadow.ghost_edges.length
          ? `<div><span class="mono-label">ghost edges</span><div class="ghost-list">${shadow.ghost_edges.map((g) => `<span class="ghost-edge">${esc(g)}</span>`).join("")}</div></div>`
          : ""}
      </div>`
    : "";

  const reviewHtml = detail.under_review
    ? `<div class="lineage-box" style="border-color: var(--accent-human)">
        <span class="mono-label" style="color: var(--accent-human)">Under review — live invalidation on depended-upon evidence</span>
        ${live
          .map(
            (inv) => `
          <div class="evidence-node cited">
            <span class="ekind">${esc(inv.record.id)} targets ${esc(inv.record.targets[0])}</span>
            ${canWrite() ? `<button class="btn danger" data-reject="${esc(inv.record.id)}">Reject this invalidation</button>` : ""}
          </div>`,
          )
          .join("") || `<p class="note">Invalidation events are in the stream.</p>`}
        <p class="note">Review is DERIVED, not stored: overturning the invalidation clears it with no cleanup actor.</p>
      </div>`
    : "";

  const actions = actionsFor(detail);

  $("inspector-body").innerHTML = `
    <div class="insp-id-block">
      <span class="mono-label">${esc(r.type)} · seq ${state.events.findIndex((e) => e.id === r.id)}</span>
      <h3>${esc(r.id)}</h3>
      ${r.claim && r.claim.narrative ? `<p class="insp-narrative">${esc(r.claim.narrative)}</p>` : ""}
    </div>
    <dl class="insp-grid">
      <dt>status (fold)</dt><dd>${esc(detail.status)}</dd>
      <dt>authority</dt><dd><span class="epi ${tierClass}">${tierClass}</span></dd>
      <dt>agent</dt><dd>${esc(r.agent_id)}</dd>
      <dt>birth</dt><dd>${esc(r.birth_status)}${r.is_trust_root ? " · trust root" : ""}</dd>
      ${r.targets.length ? `<dt>targets</dt><dd class="mono">${r.targets.map(esc).join(", ")}</dd>` : ""}
      ${detail.revision_chain.length > 1 ? `<dt>revision chain</dt><dd class="mono">${detail.revision_chain.map(esc).join(" → ")}</dd>` : ""}
      ${r.timestamp ? `<dt>timestamp</dt><dd class="mono">${esc(r.timestamp)} <span class="echeck cited">metadata — ignored by projection</span></dd>` : ""}
    </dl>
    ${reviewHtml}
    ${evidenceHtml}
    ${shadowHtml}
    ${actions.html}
  `;
  actions.bind();
  $("inspector-body")
    .querySelectorAll("button[data-reject]")
    .forEach((el) =>
      el.addEventListener("click", () =>
        act(markerRecord("rejection", el.dataset.reject), `rejection → ${el.dataset.reject}`),
      ),
    );
  drawer.classList.add("open");
}

// ---------------------------------------------------------------- wiring

function wire() {
  $("inspector-close").addEventListener("click", () => drawer.classList.remove("open"));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") drawer.classList.remove("open");
  });

  $("btn-refresh").addEventListener("click", () => refresh().catch(guardToast));

  $("btn-playground").addEventListener("click", async () => {
    try {
      const { log } = await api.createPlayground();
      location.search = `?log=${log}`;
    } catch (e) {
      guardToast(e);
    }
  });

  $("btn-export").addEventListener("click", async () => {
    try {
      const events = await api.events(state.log);
      const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `stratum-${state.log}-epoch${state.head}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("ok", "export", "serialize_log — replay-proven portability (I4).");
    } catch (e) {
      guardToast(e);
    }
  });

  // token dialog
  const tokenDlg = $("token-dialog");
  $("btn-token").addEventListener("click", () => {
    $("token-input").value = getToken();
    tokenDlg.showModal();
  });
  $("token-close").addEventListener("click", () => tokenDlg.close());
  $("token-save").addEventListener("click", () => {
    setToken($("token-input").value.trim());
    tokenDlg.close();
    refresh().catch(guardToast);
  });
  $("token-clear").addEventListener("click", () => {
    setToken("");
    $("token-input").value = "";
    tokenDlg.close();
    refresh().catch(guardToast);
  });

  // epoch scrubber
  $("epoch-scrub").addEventListener("input", (e) => {
    const v = Number(e.target.value);
    state.epoch = v >= state.head ? null : v;
    refresh().catch(guardToast);
  });
  $("btn-scrub-head").addEventListener("click", () => {
    state.epoch = null;
    refresh().catch(guardToast);
  });

  // new entry
  $("entry-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canWrite()) {
      toast("err", "read-only", "Fork a playground or set a token to write.");
      return;
    }
    const kind = document.querySelector('input[name="ekind"]:checked').value;
    const narrative = $("entry-narrative").value.trim();
    if (!narrative) return;
    const record = {
      id: newId(kind === "decision" ? "dec" : "fcl"),
      type: kind,
      agent_id: agentId(),
      schema_version: 1,
      birth_status: $("entry-pending").checked ? "pending_evidence" : "asserted",
      claim: { narrative },
      evidence: [],
      targets: [],
      is_trust_root: false,
      timestamp: new Date().toISOString(),
    };
    api
      .append(state.log, record)
      .then(() => {
        $("entry-narrative").value = "";
        toast("ok", "appended", `${kind} recorded at the gate.`);
        return refresh();
      })
      .catch(guardToast);
  });
}

// ---------------------------------------------------------------- boot

initTheme();
wire();
refresh().catch((e) => {
  guardToast(e);
  if (e.status === 401) {
    toast("err", "private log", `"${state.log}" needs a bearer token — set one via the Token button.`);
  }
});
