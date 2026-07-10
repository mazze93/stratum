#!/usr/bin/env node
/**
 * stratum — one command, one recorded decision.
 *
 * Zero-dependency CLI for the Stratum epistemic ledger. Appends run the full
 * contract guards server-side; a refusal prints the guard's own message.
 *
 * Config: ~/.config/stratum/config.json  (endpoint, token, log, agent)
 * Env overrides: STRATUM_ENDPOINT, STRATUM_TOKEN, STRATUM_LOG, STRATUM_AGENT
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "stratum");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const color = (() => {
  const on = process.stdout.isTTY && !process.env.NO_COLOR;
  const wrap = (c) => (s) => (on ? `\x1b[${c}m${s}\x1b[0m` : String(s));
  return { dim: wrap("2"), bold: wrap("1"), red: wrap("31"), green: wrap("32"), gold: wrap("33"), blue: wrap("34"), mono: wrap("36") };
})();

const TIER_PAINT = {
  authoritative_axiomatic: (s) => color.gold(s),
  authoritative_verified: (s) => color.green(s),
  authoritative_provisional: (s) => color.blue(s),
  narrative: (s) => color.dim(s),
};
const tier = (a) => (TIER_PAINT[a] || color.dim)(a.replace("authoritative_", ""));

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

function settings(flags) {
  const cfg = loadConfig();
  return {
    endpoint: flags.endpoint || process.env.STRATUM_ENDPOINT || cfg.endpoint || "https://stratum.mazzeleczzare.com",
    token: flags.token || process.env.STRATUM_TOKEN || cfg.token || "",
    log: flags.log || process.env.STRATUM_LOG || cfg.log || "workspace",
    agent: flags.agent || process.env.STRATUM_AGENT || cfg.agent || "mazze",
  };
}

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else { flags[key] = next; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

const newId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;

// ---------------------------------------------------------------- api

async function call(s, path, opts = {}) {
  const headers = {};
  if (s.token) headers.authorization = `Bearer ${s.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res;
  try {
    res = await fetch(s.endpoint + path, { ...opts, headers });
  } catch (e) {
    fail(`cannot reach ${s.endpoint} — ${e.cause?.code || e.message}`);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const msg = (data && data.error) || `HTTP ${res.status}`;
    fail(res.status === 409 ? `guard refused: ${msg}` : msg, res.status === 409 ? 2 : 1);
  }
  return data;
}

const appendEvent = (s, record) =>
  call(s, `/api/logs/${s.log}/events`, { method: "POST", body: JSON.stringify(record) });

function record(s, type, extra) {
  return {
    id: newId(type.slice(0, 3)),
    type,
    agent_id: s.agent,
    schema_version: 1,
    birth_status: "asserted",
    claim: {},
    evidence: [],
    targets: [],
    is_trust_root: false,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function fail(msg, code = 1) {
  console.error(color.red("✗") + " " + msg);
  process.exit(code);
}

const ok = (msg) => console.log(color.green("✓") + " " + msg);

function shadowClaim(narrative, flags) {
  const claim = { narrative };
  if (flags.shadow) {
    claim.shadow = { trace: String(flags.shadow), certainty: flags.certainty ? Number(flags.certainty) : 0.7, tag: "TRACE" };
  }
  return claim;
}

// ---------------------------------------------------------------- commands

const commands = {
  async init(pos, flags) {
    const cfg = loadConfig();
    for (const k of ["endpoint", "token", "log", "agent"]) {
      if (flags[k] !== undefined) cfg[k] = String(flags[k]);
    }
    saveConfig(cfg);
    const s = settings({});
    ok(`config written to ${CONFIG_PATH}`);
    console.log(`  endpoint  ${s.endpoint}\n  log       ${s.log}\n  agent     ${s.agent}\n  token     ${s.token ? "set" : color.red("not set")}`);
  },

  async health(pos, flags) {
    const s = settings(flags);
    const h = await call(s, "/api/health");
    ok(`${s.endpoint} — ${h.service} ${h.version}`);
  },

  async decide(pos, flags) {
    const s = settings(flags);
    const narrative = pos.join(" ").trim();
    if (!narrative) fail('usage: stratum decide "what was decided" [--pending] [--supersedes id] [--shadow "trace"]');
    const rec = record(s, "decision", {
      birth_status: flags.pending ? "pending_evidence" : "asserted",
      claim: shadowClaim(narrative, flags),
      targets: flags.supersedes ? [String(flags.supersedes)] : [],
    });
    const r = await appendEvent(s, rec);
    if (flags.supersedes) {
      await appendEvent(s, record(s, "supersession", { targets: [String(flags.supersedes)] }));
      ok(`${rec.id} recorded · supersedes ${flags.supersedes}`);
    } else {
      ok(`${rec.id} recorded${flags.pending ? " · awaiting evidence" : ""} (seq ${r.seq})`);
    }
  },

  async foreclose(pos, flags) {
    const s = settings(flags);
    const narrative = pos.join(" ").trim();
    if (!narrative) fail('usage: stratum foreclose "the road not taken" [--shadow "trace"]');
    const rec = record(s, "foreclosure", { claim: shadowClaim(narrative, flags) });
    const r = await appendEvent(s, rec);
    ok(`${rec.id} — road closed (seq ${r.seq})`);
  },

  async verify(pos, flags) {
    const s = settings(flags);
    const [target] = pos;
    if (!target || !flags.ref) fail('usage: stratum verify <event-id> --ref "what you checked" [--kind test_exit]');
    const rec = record(s, "verification", {
      targets: [target],
      evidence: [{ kind: String(flags.kind || "human_attestation"), ref: String(flags.ref), checked_at: new Date().toISOString(), signer: s.agent }],
    });
    await appendEvent(s, rec);
    ok(`${target} → validated · checked "${flags.ref}"`);
  },

  async ratify(pos, flags) {
    const s = settings(flags);
    const [target] = pos;
    if (!target) fail("usage: stratum ratify <event-id>");
    await appendEvent(s, record(s, "ratification", { targets: [target] }));
    ok(`${target} → ratified · ${color.gold("axiomatic")} (authority-declared, not evidence-checked)`);
  },

  async dispute(pos, flags) {
    const s = settings(flags);
    const [target] = pos;
    if (!target) fail("usage: stratum dispute <event-id>");
    await appendEvent(s, record(s, "dispute", { targets: [target] }));
    ok(`${target} → disputed`);
  },

  async reject(pos, flags) {
    const s = settings(flags);
    const [target] = pos;
    if (!target) fail("usage: stratum reject <event-id>");
    await appendEvent(s, record(s, "rejection", { targets: [target] }));
    ok(`${target} → rejected (terminal)`);
  },

  async contradict(pos, flags) {
    const s = settings(flags);
    const [target] = pos;
    if (!target) fail("usage: stratum contradict <event-id>");
    await appendEvent(s, record(s, "contradiction", { targets: [target] }));
    ok(`${target} → contradicted (chain preserved — I2)`);
  },

  async status(pos, flags) {
    const s = settings(flags);
    const [id] = pos;
    if (!id) fail("usage: stratum status <event-id>");
    const d = await call(s, `/api/logs/${s.log}/events/${encodeURIComponent(id)}`);
    console.log(`${color.bold(id)} · ${d.record.type} · ${d.record.agent_id}`);
    console.log(`  status     ${d.status}${d.under_review ? color.red(" · UNDER REVIEW") : ""}`);
    console.log(`  authority  ${tier(d.authority)}`);
    if (d.record.claim?.narrative) console.log(`  narrative  ${d.record.claim.narrative}`);
    if (d.revision_chain.length > 1) console.log(`  chain      ${d.revision_chain.join(" → ")}`);
    for (const e of d.record.evidence || []) {
      console.log(`  evidence   ${e.kind} · ${e.ref} · ${e.checked_at ? color.green("checked") : color.dim("cited only")}`);
    }
    if (d.record.claim?.shadow) {
      const sh = d.record.claim.shadow;
      console.log(color.dim(`  shadow     [${sh.tag || "RECON"} ${sh.certainty ?? "?"}] ${sh.trace}`));
    }
  },

  async tessera(pos, flags) {
    const s = settings(flags);
    const epoch = flags.epoch !== undefined ? `?epoch=${flags.epoch}` : "";
    const p = await call(s, `/api/logs/${s.log}/projection${epoch}`);
    if (flags.json) { console.log(JSON.stringify(p, null, 2)); return; }
    const d = p.authoritative.recent_decisions;
    const f = p.authoritative.foreclosed_options;
    console.log(color.bold(`TESSERA · log ${s.log} · epoch ${p.epoch}`));
    console.log(color.dim("everything below is a projection of the log — nothing is stored state\n"));
    console.log(color.bold(`decisions (${d.length})`));
    for (const e of [...d].reverse()) {
      console.log(`  ${tier(e.authority).padEnd(24)} ${color.mono(e.id)}  ${String(e.narrative ?? "").slice(0, 84)}`);
    }
    console.log(color.bold(`\nforeclosed (${f.length})`));
    for (const e of [...f].reverse()) {
      console.log(`  ${(e.active ? "standing " : color.dim("reopened ")).padEnd(9)} ${color.mono(e.id)}  ${String(e.narrative ?? "").slice(0, 84)}`);
    }
  },

  async log(pos, flags) {
    const s = settings(flags);
    const events = await call(s, `/api/logs/${s.log}/events`);
    const n = Number(flags.n || 15);
    console.log(color.bold(`log ${s.log} · ${events.length} events`));
    for (const [seq, ev] of events.map((e, i) => [i, e]).slice(-n)) {
      const target = ev.targets?.length ? ` → ${ev.targets[0]}` : "";
      const snippet = ev.claim?.narrative ? ` · ${String(ev.claim.narrative).slice(0, 56)}` : "";
      console.log(`  ${color.dim(`#${String(seq).padStart(3)}`)} ${ev.type.padEnd(18)} ${color.dim(ev.agent_id)}${target}${snippet}`);
    }
  },

  async export(pos, flags) {
    const s = settings(flags);
    const events = await call(s, `/api/logs/${s.log}/events`);
    console.log(JSON.stringify(events, null, 2));
  },

  async playground(pos, flags) {
    const s = settings(flags);
    const r = await call(s, "/api/playground", { method: "POST" });
    ok(`${r.log} — ${r.events} events cloned · ${s.endpoint}/?log=${r.log}`);
  },
};

const HELP = `${color.bold("stratum")} — one command, one recorded decision

  ${color.bold("write")}
    decide "…"            record a decision   [--pending] [--supersedes id] [--shadow "…"]
    foreclose "…"         close a road        [--shadow "…"]
    verify <id> --ref "…" attach CHECKED evidence → validated   [--kind test_exit]
    ratify <id>           human ratification → ${color.gold("axiomatic")}
    dispute | reject | contradict <id>
  ${color.bold("read")}
    tessera               the projection      [--epoch N] [--json]
    status <id>           fold status, tier, evidence, shadow trace
    log                   recent events       [--n 30]
    export                full log (serialize_log; I4 replay-proven)
  ${color.bold("setup")}
    init                  [--endpoint URL] [--token T] [--log L] [--agent A]
    health · playground

  flags: --log <id> targets another log for any command
  exit codes: 0 ok · 1 error · 2 guard refused (contract violation)`;

const { pos, flags } = parseArgs(process.argv.slice(2));
const cmd = pos.shift();
if (!cmd || cmd === "help" || flags.help) {
  console.log(HELP);
  process.exit(0);
}
if (!commands[cmd]) fail(`unknown command "${cmd}" — try: stratum help`);
await commands[cmd](pos, flags);
