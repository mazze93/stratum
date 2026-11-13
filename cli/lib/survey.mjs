/**
 * Survey plate — the CLI's visual language, after the landing page's
 * USGS/Landsat survey sheet (atrium/public/landing.css, strata-draw.js).
 *
 * Zero dependencies. Pure render functions: they take capabilities and data
 * and return strings. Nothing here writes to a stream or touches the network,
 * so every surface is testable with fixed inputs.
 *
 * Accessibility rules, enforced by construction:
 *  - Color never carries meaning alone. Every tier is swatch + glyph + WORD;
 *    in plain mode the swatch drops and the glyph + word remain.
 *  - Text stays in the terminal's own ink. Tier hues paint only swatches and
 *    the decorative strata column, so contrast is the user's theme, light or
 *    dark, never ours.
 *  - Decoration is optional. The strata column and corner marks exist only
 *    with color on; plain mode is linear text a screen reader reads top-down.
 *  - Exactly one line per screen gets the accent: the next step.
 *
 * Plain mode: NO_COLOR (any value), STRATUM_PLAIN=1, TERM=dumb, or a non-TTY.
 * FORCE_COLOR=1 forces color on (tests, `| less -R`).
 */

// ── palette: verbatim from strata-draw.js TIER + landing.css tokens ────────
export const TIERS = {
  authoritative_axiomatic: { hex: "#8C3B2E", glyph: "◆", ascii: "<>", word: "AXIOMATIC" },
  authoritative_verified: { hex: "#2E5D4B", glyph: "●", ascii: "(*)", word: "VERIFIED" },
  authoritative_provisional: { hex: "#B08A2E", glyph: "◐", ascii: "(/)", word: "PENDING" },
  narrative: { hex: "#3E5A72", glyph: "○", ascii: "( )", word: "NARRATIVE" },
  foreclosure: { hex: "#8E4A6B", glyph: "⊘", ascii: "(x)", word: "FORECLOSED" },
};
const SEAM = "#58D68D"; // checked-evidence seam: the one accent color
const RED = "#E74C3C";
const FRAME = "#434B54";
const TIER_ORDER = Object.keys(TIERS);

// ── capabilities ─────────────────────────────────────────────────────────────
/**
 * @param {{ isTTY?: boolean, columns?: number }} stream
 * @param {Record<string, string | undefined>} env
 */
export function detect(stream = process.stdout, env = process.env) {
  const forced = env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0";
  const plain =
    !forced &&
    (env.NO_COLOR !== undefined || env.STRATUM_PLAIN === "1" || env.TERM === "dumb" || !stream.isTTY);
  const truecolor = /truecolor|24bit/i.test(env.COLORTERM || "") || /ghostty|kitty|wezterm|iterm/i.test(env.TERM_PROGRAM || env.TERM || "");
  const color = plain ? "none" : truecolor ? "truecolor" : "256";
  const lang = env.LC_ALL || env.LC_CTYPE || env.LANG || "";
  const unicode = env.TERM !== "linux" && (lang === "" || /utf-?8/i.test(lang));
  const width = Math.max(40, Math.min(stream.columns || 80, 88));
  return { color, plain, unicode, width };
}

// ── paint ────────────────────────────────────────────────────────────────────
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function xterm256([r, g, b]) {
  const q = (v) => (v < 48 ? 0 : v < 115 ? 1 : Math.floor((v - 35) / 40));
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

export function painter(caps) {
  const on = caps.color !== "none";
  const sgr = (code) => (s) => (on ? `\x1b[${code}m${s}\x1b[0m` : String(s));
  const fg = (hex) =>
    sgr(caps.color === "truecolor" ? `38;2;${rgb(hex).join(";")}` : `38;5;${xterm256(rgb(hex))}`);
  return {
    on,
    bold: sgr("1"),
    dim: sgr("2"),
    fg,
    accent: (s) => (on ? fg(SEAM)(sgr("1")(s)) : String(s)),
    danger: fg(RED),
    frame: fg(FRAME),
  };
}

const ANSI = /\x1b\[[0-9;]*m/g;
export const visible = (s) => String(s).replace(ANSI, "").length;
const pad = (s, n) => s + " ".repeat(Math.max(0, n - visible(s)));
const clip = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, Math.max(0, n - 1)) + "…" : t;
};

// ── tier badge ───────────────────────────────────────────────────────────────
/** swatch + glyph + WORD. Plain: glyph + WORD. ASCII: (*) WORD. */
export function badge(caps, key) {
  const t = TIERS[key] || TIERS.narrative;
  const p = painter(caps);
  const glyph = caps.unicode ? t.glyph : t.ascii;
  const swatch = p.on ? p.fg(t.hex)(caps.unicode ? "██" : "##") + " " : "";
  return `${swatch}${glyph} ${t.word}`;
}

// ── counts from a projection ─────────────────────────────────────────────────
export function tally(projection) {
  const c = Object.fromEntries(TIER_ORDER.map((k) => [k, 0]));
  for (const d of projection?.authoritative?.recent_decisions || []) c[d.authority in c ? d.authority : "narrative"]++;
  for (const f of projection?.authoritative?.foreclosed_options || []) if (f.active) c.foreclosure++;
  return c;
}

// ── strata column: the newest layers, seeded per id like strata-draw.js ─────
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function column(caps, projection, rows) {
  const p = painter(caps);
  const ds = [...(projection?.authoritative?.recent_decisions || [])].reverse().slice(0, rows);
  return ds.map((d) => {
    const w = 10 + (fnv1a(d.id) % 9); // 10–18 cells, stable for an id
    const t = TIERS[d.authority] || TIERS.narrative;
    return p.fg(t.hex)("▆".repeat(w));
  });
}

// ── title card ───────────────────────────────────────────────────────────────
/**
 * @param {ReturnType<typeof detect>} caps
 * @param {{ log?: string|null, epoch?: number, version: string, projection?: any, endpoint?: string }} data
 */
export function titleCard(caps, data) {
  const p = painter(caps);
  const w = caps.width - 2;
  const counts = tally(data.projection);
  const where = data.log ? `log ${data.log}` : "no log named";
  const meta = [where, data.epoch !== undefined ? `epoch ${data.epoch}` : null, `v${data.version}`].filter(Boolean).join(" · ");

  if (!p.on) {
    // Plain: linear, no art. Reads correctly top-down in a screen reader.
    const legend = TIER_ORDER.map((k) => `${badge(caps, k)} ${counts[k]}`).join(", ");
    return [`STRATUM — epistemic decision ledger · ${meta}`, data.projection ? `Ledger: ${legend}.` : ""].filter(Boolean).join("\n");
  }

  const u = caps.unicode;
  const tick = (l, r) => " " + p.frame(l) + " ".repeat(Math.max(0, w - 4)) + p.frame(r);
  const COL = 18;
  const strata = data.projection ? column(caps, data.projection, 4).map((l) => pad(l, COL)) : [];
  const left = [
    p.bold("S T R A T U M"),
    p.dim("EPISTEMIC DECISION LEDGER"),
    "",
    p.dim(`PLATE · ${meta}`),
  ];
  const lines = [tick(u ? "┌─" : "+-", u ? "─┐" : "-+")];
  for (let i = 0; i < left.length; i++) {
    const right = strata[i] ? strata[i] : "";
    const gap = w - 4 - visible(left[i]) - (strata.length ? COL : 0);
    lines.push("   " + left[i] + " ".repeat(Math.max(1, gap)) + right);
  }
  if (data.projection) {
    const legend = TIER_ORDER.map((k) => `${badge(caps, k)} ${p.bold(String(counts[k]))}`);
    // wrap the legend to the plate width
    lines.push("");
    let row = "   ";
    for (const item of legend) {
      if (visible(row) + visible(item) + 3 > w) { lines.push(row.trimEnd()); row = "   "; }
      row += item + "   ";
    }
    lines.push(row.trimEnd());
  }
  lines.push(tick(u ? "└─" : "+-", u ? "─┘" : "-+"));
  return lines.join("\n");
}

// ── next step: the one emphasized line ──────────────────────────────────────
/**
 * Decide the single next step from what the CLI can see. Pure; first match wins.
 * @param {{ log?: string|null, token?: boolean, outboxPending?: number, projection?: any, reachable?: boolean }} s
 */
export function computeNext(s) {
  const ds = s.projection?.authoritative?.recent_decisions || [];
  const pending = ds.filter((d) => d.status === "pending_evidence");
  const disputed = ds.filter((d) => d.status === "disputed");
  const then = [];
  const more = (n, one, many) => `${n} more ${n === 1 ? one : many}`;
  if (pending.length > 1) then.push(more(pending.length - 1, "decision awaits evidence", "decisions await evidence"));
  if (disputed.length > 1) then.push(more(disputed.length - 1, "is disputed", "are disputed"));

  if (!s.log) return { headline: "name a log", command: "stratum init --log <log-id>", why: "there is no default log, so nothing lands in the wrong one", then };
  if (s.reachable === false) return { headline: "reach the ledger", command: "stratum health", why: "the endpoint did not answer; check it before writing", then };
  if (s.outboxPending > 0) return { headline: `flush ${s.outboxPending} unrecorded ${s.outboxPending === 1 ? "event" : "events"}`, command: "stratum outbox --flush", why: "queued writes are not in the ledger until they land", then };
  if (!s.token) return { headline: "add a token to write", command: "stratum init --token <token>", why: "reads work without one; appends do not", then };
  if (disputed[0]) return { headline: `resolve ${disputed[0].id}`, command: `stratum status ${disputed[0].id}`, why: `disputed: "${clip(disputed[0].narrative, 52)}"`, then };
  if (pending[0]) {
    const d = pending[0];
    return { headline: `verify ${d.id}`, command: `stratum verify ${d.id} --run "<check>"`, why: `pending: "${clip(d.narrative, 52)}"`, then };
  }
  return { headline: "record the next decision", command: 'stratum decide "<what was decided>" --pending', why: "nothing is waiting on evidence; the ledger is current", then };
}

/** Render a next step. The command sits alone on its line so it copies cleanly. */
export function nextPanel(caps, n) {
  const p = painter(caps);
  const arrow = caps.unicode ? "→" : "->";
  const head = `${arrow} NEXT`;
  const ind = " ".repeat(2 + head.length + 3);
  const out = [
    `  ${p.accent(head)}   ${p.bold(n.headline)}`,
    `${ind}${p.bold(n.command)}`,
    `${ind}${p.dim(clip(n.why, caps.width - ind.length))}`,
  ];
  if (n.then?.length) out.push("", `  ${pad(p.dim("then"), head.length + 3)}${p.dim(clip(n.then.join(" · "), caps.width - ind.length))}`);
  return out.join("\n");
}

/** One-line next step for the end of a write. */
export function nextLine(caps, command, why) {
  const p = painter(caps);
  const arrow = caps.unicode ? "→" : "->";
  return `  ${p.accent(`${arrow} next`)}  ${p.bold(command)}${why ? "  " + p.dim(why) : ""}`;
}

// ── help ─────────────────────────────────────────────────────────────────────
/**
 * Help is data: one table, rendered two ways (overview and per-command).
 * Each entry: what it does in plain words, when you'd reach for it, usage,
 * flags, and an example. Grouped by the loop you're in, in loop order.
 */
export const HELP = [
  { group: "record", items: [
    { name: "decide", say: "Record a decision.", when: "you just chose something", usage: 'stratum decide "<what was decided>"', flags: [["--pending", "it needs evidence before it counts (most decisions)"], ["--supersedes <id>", "it replaces an earlier decision"], ["--shadow \"<trace>\"", "the reasoning you buried on the way"]], example: 'stratum decide "Pin actions by SHA" --pending' },
    { name: "foreclose", say: "Record a road not taken.", when: "you ruled an option out", usage: 'stratum foreclose "<the option>"', flags: [["--shadow \"<trace>\"", "why it was closed and what would reopen it"]], example: 'stratum foreclose "Full-screen TUI" --shadow "breaks screen readers"' },
  ]},
  { group: "prove", items: [
    { name: "verify", say: "Run a check and bind its result to the commit.", when: "a pending decision has landed", usage: 'stratum verify <id> --run "<check command>"', flags: [["--expect-exit <n>", "exit code that means pass (default 0)"], ["--input id=path,…", "files whose hashes the check depends on"], ["--output <file>", "a report the check writes; its hash is bound"], ["--dry-run", "print the record instead of sending it"], ["--ref \"<text>\"", "legacy: unbound, typed evidence (avoid)"]], example: 'stratum verify st-014 --run "npm test"' },
    { name: "ratify", say: "Declare a decision by authority (axiomatic, not evidenced).", when: "it's a policy call, not a checkable fact", usage: "stratum ratify <id>", flags: [], example: "stratum ratify st-001" },
  ]},
  { group: "challenge", items: [
    { name: "dispute", say: "Put a decision under review.", when: "you doubt it but haven't disproved it", usage: "stratum dispute <id>", flags: [], example: "stratum dispute st-009" },
    { name: "contradict", say: "Record that a decision is wrong; its chain is kept.", when: "evidence now says otherwise", usage: "stratum contradict <id>", flags: [], example: "stratum contradict st-009" },
    { name: "reject", say: "Reject a decision. Terminal.", when: "it should never have stood", usage: "stratum reject <id>", flags: [], example: "stratum reject st-010" },
  ]},
  { group: "read", items: [
    { name: "tessera", say: "The ledger as it stands: decisions by tier, roads closed.", when: "you need the whole picture", usage: "stratum tessera", flags: [["--epoch <n>", "as it stood at an earlier point"], ["--json", "machine-readable"]], example: "stratum tessera --epoch 12" },
    { name: "status", say: "One decision: status, tier, evidence, chain, shadow.", when: "you need the story of one id", usage: "stratum status <id>", flags: [], example: "stratum status st-014" },
    { name: "log", say: "Recent events, newest last.", when: "what just happened?", usage: "stratum log", flags: [["--n <count>", "how many (default 15)"]], example: "stratum log --n 30" },
    { name: "export", say: "The full log as JSON.", when: "backup, or replay elsewhere", usage: "stratum export > log.json", flags: [], example: "stratum export > stele.json" },
  ]},
  { group: "automate", items: [
    { name: "emit", say: "One JSON emission from a hook or script (docs/API.md).", when: "a tool, not a person, is writing", usage: "stratum emit < emission.json", flags: [["--file <path>", "read from a file instead of stdin"], ["--required", "fail (exit 3) when no log is configured"]], example: "echo '{\"type\":\"decision\",…}' | stratum emit" },
    { name: "outbox", say: "Writes that could not land yet.", when: "a write was queued", usage: "stratum outbox", flags: [["--flush", "send them now"]], example: "stratum outbox --flush" },
  ]},
  { group: "setup", items: [
    { name: "init", say: "Save endpoint, token, log and agent to config.", when: "first run, or switching logs", usage: "stratum init --log <id>", flags: [["--endpoint <url>", ""], ["--token <t>", "kept in ~/.config/stratum/config.json (0600)"], ["--agent <name>", "who the records say wrote them"]], example: "stratum init --log stele --agent mazze" },
    { name: "health", say: "Check the endpoint answers.", when: "something looks off", usage: "stratum health", flags: [], example: "stratum health" },
    { name: "playground", say: "Clone the demo into a public sandbox log.", when: "you want to try without risk", usage: "stratum playground", flags: [], example: "stratum playground" },
  ]},
];

export const EXIT_CODES = [
  [0, "ok"], [1, "error"], [2, "guard refused (contract violation)"],
  [3, "unrecorded, queued in the outbox"], [4, "ratification needs a human at a terminal"],
];

export function helpOverview(caps) {
  const p = painter(caps);
  const out = [`${p.bold("stratum")} — one command, one recorded decision`, ""];
  for (const g of HELP) {
    out.push(`  ${p.bold(g.group.toUpperCase())}`);
    for (const it of g.items) out.push(`    ${pad(it.name, 12)}${it.say}`);
    out.push("");
  }
  out.push(`  ${p.dim("details")}  stratum help <command>`);
  out.push(`  ${p.dim("plain")}    NO_COLOR=1 or STRATUM_PLAIN=1 for linear text, no color, no art`);
  out.push(`  ${p.dim("exit")}     ${EXIT_CODES.map(([c, m]) => `${c} ${m}`).join("\n           ")}`);
  return out.join("\n");
}

export function helpTopic(caps, name) {
  const p = painter(caps);
  const it = HELP.flatMap((g) => g.items).find((x) => x.name === name);
  if (!it) return null;
  const out = [`${p.bold(`stratum ${it.name}`)} — ${it.say}`, "", `  ${p.dim("use when")}  ${it.when}`, `  ${p.dim("usage")}     ${it.usage}`];
  if (it.flags.length) {
    out.push("", `  ${p.dim("flags")}`);
    for (const [f, d] of it.flags) out.push(`    ${pad(f, 22)}${d}`);
  }
  out.push("", `  ${p.dim("example")}`, `    ${it.example}`);
  return out.join("\n");
}
