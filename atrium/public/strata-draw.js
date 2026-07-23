/**
 * Stratigraphic cross-section of a Stratum projection.
 *
 * Pure function: projection JSON in, SVG markup out. Deterministic — every
 * waveform is seeded from the event id, so the same projection always draws
 * the same section. Consumed twice: by scripts/render-strata-svg.mjs to bake
 * the static figure into the landing page, and by landing.js to re-drill the
 * section from the live /api projection. One source of truth, no build step.
 *
 * Reading the figure:
 *   - decisions deposit as layers, oldest at the bottom
 *   - color = authority tier (see TIER below)
 *   - a bright seam caps layers whose evidence has been checked
 *   - foreclosures are lenses that pinch out — paths that stopped depositing
 */

const TIER = {
  authoritative_axiomatic: { fill: "#8C3B2E", edge: "#5E2119", label: "AXIOMATIC" },
  authoritative_verified: { fill: "#2E5D4B", edge: "#1B3C2F", label: "VERIFIED" },
  authoritative_provisional: { fill: "#B08A2E", edge: "#7A5D17", label: "PENDING" },
  narrative: { fill: "#3E5A72", edge: "#263D52", label: "NARRATIVE" },
  foreclosure: { fill: "#8E4A6B", edge: "#5E2B45", label: "FORECLOSED" },
};

/* Deterministic PRNG: fnv1a seed -> mulberry32 stream. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* A wavy boundary y(x): two superposed sine waves seeded per event. */
function boundary(rand, base, amp) {
  const a1 = amp * (0.55 + rand() * 0.45);
  const a2 = amp * 0.4 * rand();
  const l1 = 220 + rand() * 260;
  const l2 = 70 + rand() * 90;
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  return (x) => base + a1 * Math.sin((x / l1) * Math.PI * 2 + p1) + a2 * Math.sin((x / l2) * Math.PI * 2 + p2);
}

function pathFrom(fnTop, fnBot, x0, x1, taper) {
  const N = 48;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    pts.push([x, fnTop(x, i / N)]);
  }
  for (let i = N; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / N;
    pts.push([x, fnBot(x, i / N)]);
  }
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + "Z";
}

/**
 * @param {object} projection - Stratum projection (epoch, authoritative.{recent_decisions,foreclosed_options})
 * @param {object} [opts] - { width, height, title }
 * @returns {string} SVG markup
 */
export function drawStrata(projection, opts = {}) {
  const W = opts.width ?? 1200;
  const H = opts.height ?? 640;
  const M = { top: 56, right: 208, bottom: 34, left: 96 };
  const x0 = M.left, x1 = W - M.right, yTop = M.top, yBot = H - M.bottom;
  const chartH = yBot - yTop;

  const decisions = projection.authoritative.recent_decisions.map((d) => ({ ...d, kind: "decision" }));
  const forecl = projection.authoritative.foreclosed_options.map((f) => ({ ...f, kind: "foreclosure" }));
  const items = [...decisions, ...forecl].sort((a, b) => (a.id < b.id ? -1 : 1));

  /* Thickness budget: axiomatic bedrock thickest, foreclosure lenses thinner. */
  const raw = items.map((it) => {
    const r = mulberry32(fnv1a(it.id));
    if (it.authority === "authoritative_axiomatic") return 1.9 + r() * 0.3;
    if (it.kind === "foreclosure") return 0.85 + r() * 0.25;
    return 1.15 + r() * 0.55;
  });
  const scale = chartH / raw.reduce((a, b) => a + b, 0);

  const layers = [];
  let yCursor = yBot; // deposit upward from the basement
  let prevTopFn = null;
  items.forEach((it, i) => {
    const rand = mulberry32(fnv1a(it.id + ":wave"));
    const th = raw[i] * scale;
    const topBase = yCursor - th;
    const amp = Math.min(7, th * 0.22);
    const wave = boundary(rand, topBase, amp);
    const botFn = prevTopFn ?? ((x) => yBot);
    let topFn = wave;
    if (it.kind === "foreclosure") {
      /* A lens pinches out: its top blends back down to its floor, and the
         next layer deposits over the pinched surface — no voids. */
      const r = mulberry32(fnv1a(it.id + ":lens"));
      const fromLeft = r() > 0.5;
      const pinch = 0.58 + r() * 0.22;
      topFn = (x) => {
        const u = (x - x0) / (x1 - x0);
        const uu = fromLeft ? u : 1 - u;
        const k = uu >= pinch ? 0 : Math.pow(Math.cos((uu / pinch) * Math.PI * 0.5), 0.7);
        return botFn(x) - (botFn(x) - wave(x)) * k;
      };
    }
    layers.push({ it, topFn, botFn, yMid: yCursor - th / 2, th });
    prevTopFn = topFn;
    yCursor = topBase;
  });

  const parts = [];
  parts.push(
    `<svg class="strata-fig" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(
      opts.title ?? `Stratigraphic section of the genesis ledger at epoch ${projection.epoch}: ${decisions.length} decisions and ${forecl.length} foreclosures rendered as deposited layers, colored by authority tier.`
    )}" font-family="IBM Plex Mono, ui-monospace, monospace">`
  );
  parts.push(`<defs>
  <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
    <rect width="7" height="7" fill="none"/><line x1="0" y1="0" x2="0" y2="7" stroke="#0f1114" stroke-opacity=".55" stroke-width="2.2"/>
  </pattern>
  <pattern id="grain" width="4" height="4" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r=".55" fill="#000" fill-opacity=".22"/><circle cx="3" cy="3" r=".45" fill="#fff" fill-opacity=".05"/>
  </pattern>
</defs>`);

  /* Layers, bottom-up. */
  for (const L of layers) {
    const t = it2tier(L.it);
    const isLens = L.it.kind === "foreclosure";
    const d = pathFrom((x) => L.topFn(x), (x) => L.botFn(x), x0, x1);
    const cls = `stratum stratum--${L.it.kind === "foreclosure" ? "foreclosure" : L.it.authority}`;
    /* Deterministic per-layer tint so thick same-tier sequences read as
       distinct beds, the way a real column alternates shale and siltstone. */
    const tintR = mulberry32(fnv1a(L.it.id + ":tint"));
    const tint = 0.88 + tintR() * 0.24;
    parts.push(`<g class="${cls}" data-id="${esc(L.it.id)}">`);
    parts.push(`<path d="${d}" fill="${t.fill}" stroke="${t.edge}" stroke-width="1" style="filter:brightness(${tint.toFixed(2)})"/>`);
    parts.push(`<path d="${d}" fill="url(#grain)" pointer-events="none"/>`);
    if (isLens) parts.push(`<path d="${d}" fill="url(#hatch)" pointer-events="none"/>`);
    if (L.it.authority === "authoritative_verified") {
      const N = 48, seam = [];
      for (let i = 0; i <= N; i++) {
        const x = x0 + ((x1 - x0) * i) / N;
        seam.push(`${x.toFixed(1)},${(L.topFn(x) + 1.2).toFixed(1)}`);
      }
      parts.push(`<polyline points="${seam.join(" ")}" fill="none" stroke="#58D68D" stroke-width="2.4" stroke-opacity=".95" pointer-events="none"/>`);
    }
    parts.push(`<title>${esc(`${L.it.id} · ${t.label} · ${trim(L.it.narrative, 160)}`)}</title>`);
    parts.push(`</g>`);
  }

  /* Right register: id labels with leader lines. */
  for (const L of layers) {
    const t = it2tier(L.it);
    const yl = L.yMid;
    parts.push(`<line x1="${x1 + 4}" y1="${yl.toFixed(1)}" x2="${x1 + 26}" y2="${yl.toFixed(1)}" stroke="#4a5158" stroke-width="1"/>`);
    parts.push(
      `<text x="${x1 + 32}" y="${(yl + 3.5).toFixed(1)}" font-size="11" fill="#9BA3AF">${esc(L.it.id)}` +
        `<tspan fill="${t.fill}" dx="7">${t.label}</tspan></text>`
    );
  }

  /* Left register: epoch depth scale. */
  parts.push(`<line x1="${x0 - 14}" y1="${yTop}" x2="${x0 - 14}" y2="${yBot}" stroke="#4a5158" stroke-width="1"/>`);
  const eras = [
    { y: yBot - 6, txt: "EPOCH 0" },
    { y: (yTop + yBot) / 2, txt: `EPOCH ${Math.floor(projection.epoch / 2)}` },
    { y: yTop + 10, txt: `EPOCH ${projection.epoch}` },
  ];
  for (const e of eras) {
    parts.push(`<line x1="${x0 - 18}" y1="${e.y.toFixed(1)}" x2="${x0 - 10}" y2="${e.y.toFixed(1)}" stroke="#4a5158"/>`);
    parts.push(`<text x="${x0 - 24}" y="${(e.y + 3.5).toFixed(1)}" font-size="10" fill="#5B636E" text-anchor="end">${e.txt}</text>`);
  }

  /* Figure caption, in-plate. */
  parts.push(
    `<text x="${x0}" y="${yTop - 18}" font-size="11" letter-spacing="2.5" fill="#9BA3AF">FIG. 1 — SECTION THROUGH THE LEDGER · EPOCH ${projection.epoch} · ${decisions.length} DECISIONS · ${forecl.length} FORECLOSURES</text>`
  );
  parts.push(`<rect x="${x0}" y="${yTop}" width="${x1 - x0}" height="${yBot - yTop}" fill="none" stroke="#434B54" stroke-width="1.2"/>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}

function it2tier(it) {
  return it.kind === "foreclosure" ? TIER.foreclosure : (TIER[it.authority] ?? TIER.narrative);
}
function trim(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export const STRATA_TIERS = TIER;
