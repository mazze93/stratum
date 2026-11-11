/**
 * Stratum ingress — the one door an automated client (a Claude Code plugin, a
 * hook, a script) uses to write into a Stratum log. Zero dependencies, like the
 * CLI that wraps it as `stratum emit` and `stratum outbox`.
 *
 * Why this exists (ct-reshape T1, council conditions of 2026-10-21):
 *
 *  - Evidence is produced, never supplied. A verification is built only by
 *    running the check here and binding its exit code to the pinned commit
 *    (v2 reproducible_check). A caller cannot hand in checked_at, a binding,
 *    or any evidence at all, so model text can't become checked evidence.
 *  - Ratification needs a human at a terminal: an interactive TTY and the
 *    event id typed back. Without one the client refuses and prints the
 *    command for the human to run.
 *  - Prose lands only in claim.narrative.
 *  - Masking happens before anything is canonical, hashed, queued or logged.
 *  - The event id is a digest of the canonical masked record, so a retry
 *    re-sends the same id and can never create a second event.
 *  - Unconfigured (no log named): a no-op with a notice, and no local ledger.
 *    Configured but failing: the record is queued in an outbox and the
 *    unrecorded count is shown on every run until it drains.
 *
 * Wire contract: docs/API.md. Nothing here is trusted by the server: every
 * guard still runs at the Durable Object. This module only refuses earlier,
 * and refuses things the server cannot see (where evidence came from).
 */

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  fstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// ------------------------------------------------------------------ constants

export const UNCONFIGURED_NOTICE = "Stratum ingress unavailable: event not persisted";
export const MASK_TOKEN = "[masked]";
export const DEFAULT_ENDPOINT = "https://stratum.mazzeleczzare.com";

/** Exit codes shared by `stratum emit` and `stratum outbox`. */
export const EXIT = Object.freeze({
  ok: 0, // recorded, already recorded, or unconfigured no-op
  error: 1, // usage, parse, or local refusal
  refused: 2, // the server's contract guard refused (HTTP 409), as in the CLI
  unrecorded: 3, // configured but the ledger could not take it: queued in the outbox
  gesture: 4, // a ratification without a human gesture
});

/** The only input keys `emit` accepts, per type. Anything else is refused. */
const INPUT_KEYS = {
  decision: ["type", "narrative", "pending", "targets", "mask", "mask_patterns"],
  foreclosure: ["type", "narrative", "mask", "mask_patterns"],
  verification: ["type", "target", "run", "expect_exit", "inputs", "output", "repo", "kind", "cwd", "mask", "mask_patterns"],
  ratification: ["type", "target"],
};

const ID_PREFIX = { decision: "dec", foreclosure: "for", verification: "ver", ratification: "rat" };

// v2 for everything except ratification: a v2 ratification is refused until
// the authority registry exists (core/src/log.ts:128-134).
const SCHEMA = { decision: 2, foreclosure: 2, verification: 2, ratification: 1 };

export class IngressError extends Error {
  /** @param {string} message @param {number} [code] */
  constructor(message, code = EXIT.error) {
    super(message);
    this.name = "IngressError";
    this.code = code;
  }
}

// ------------------------------------------------------------------ config

/**
 * Resolve where emissions go. Configured iff a log is named (flag, env or
 * config): the CLI has no default log (tp-031), and neither does ingress.
 * The agent must be named too, so the record says who wrote it.
 *
 * @param {{log?: string, agent?: string, endpoint?: string, token?: string}} flags
 * @param {Record<string, string | undefined>} env
 */
export function resolveConfig(flags = {}, env = process.env) {
  const home = env.HOME || homedir();
  const cfg = readJson(join(home, ".config", "stratum", "config.json")) || {};
  const log = flags.log || env.STRATUM_LOG || cfg.log || null;
  if (!log) return { mode: "unconfigured" };
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(log)) throw new IngressError(`invalid log id ${JSON.stringify(log)}`);
  const agent = flags.agent || env.STRATUM_AGENT || null;
  if (!agent) throw new IngressError("no agent named: pass --agent or set STRATUM_AGENT (the record must say who wrote it)");
  const stateDir = env.XDG_STATE_HOME || join(home, ".local", "state");
  return {
    mode: "configured",
    endpoint: flags.endpoint || env.STRATUM_ENDPOINT || cfg.endpoint || DEFAULT_ENDPOINT,
    token: flags.token || env.STRATUM_TOKEN || cfg.token || "",
    log,
    agent,
    outboxPath: join(stateDir, "stratum", `outbox-${log}.jsonl`),
    allowInsecure: env.STRATUM_ALLOW_INSECURE === "1",
  };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ masking

/**
 * Replace every occurrence of every secret in every string leaf. Runs before
 * the record is canonical, hashed, queued or printed: nothing unmasked
 * crosses that line (INGRESS-I1).
 *
 * @param {unknown} value
 * @param {{literals?: string[], patterns?: string[]}} mask
 */
export function applyMask(value, mask = {}) {
  const literals = (mask.literals || []).filter((s) => typeof s === "string" && s.length > 0);
  const patterns = (mask.patterns || []).map((p) => {
    try {
      return new RegExp(p, "g");
    } catch {
      throw new IngressError(`mask pattern is not a valid regular expression`);
    }
  });
  if (literals.length === 0 && patterns.length === 0) return value;
  // longest first, so a secret that contains another is masked whole
  const sorted = [...literals].sort((a, b) => b.length - a.length);
  const maskString = (s) => {
    let out = s;
    for (const lit of sorted) out = out.split(lit).join(MASK_TOKEN);
    for (const re of patterns) out = out.replace(re, MASK_TOKEN);
    return out;
  };
  const walk = (v) => {
    if (typeof v === "string") return maskString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [maskString(k), walk(x)]));
    }
    return v;
  };
  return walk(value);
}

// ------------------------------------------------------------------ identity

/**
 * Canonical JSON: keys sorted by UTF-16 code unit, no whitespace. For the
 * values ingress builds (strings, safe integers, booleans, null, arrays,
 * objects) this is byte-identical to RFC 8785, the form core/src/canonical.ts
 * hashes. Anything else is refused rather than guessed.
 */
export function canonicalJson(v) {
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new IngressError("canonical: only safe integers are emitted");
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (typeof v === "object") {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
  }
  throw new IngressError(`canonical: cannot encode ${typeof v}`);
}

/**
 * The part of a record that identifies it: everything but the id itself and
 * the fields the contract calls metadata (timestamp; checked_at on evidence
 * that carries a v2 binding). Two emissions of the same act share it.
 */
export function identityView(record) {
  const { id: _id, timestamp: _ts, ...rest } = record;
  return {
    ...rest,
    evidence: (rest.evidence || []).map((e) => {
      if (!e.binding) return e;
      const { checked_at: _c, ...kept } = e;
      return kept;
    }),
  };
}

export const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");

/** Deterministic event id: type prefix + 96 bits of the identity digest. */
export function emissionId(record) {
  const prefix = ID_PREFIX[record.type];
  if (!prefix) throw new IngressError(`no id prefix for type ${record.type}`);
  return `${prefix}-${sha256Hex(canonicalJson(identityView(record))).slice(0, 24)}`;
}

export const sameAct = (a, b) => canonicalJson(identityView(a)) === canonicalJson(identityView(b));

// ------------------------------------------------------------------ building

const nonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

function onlyKeys(input, type) {
  const allowed = INPUT_KEYS[type];
  for (const k of Object.keys(input)) {
    if (allowed.includes(k)) continue;
    if (["evidence", "checked_at", "binding", "signer"].includes(k)) {
      throw new IngressError(`"${k}" is refused: evidence is produced by running the check, never supplied`);
    }
    if (["claim", "id", "birth_status", "schema_version", "agent_id", "is_trust_root", "timestamp"].includes(k)) {
      throw new IngressError(`"${k}" is refused: ingress sets it (prose goes in "narrative")`);
    }
    throw new IngressError(`unknown field "${k}" for ${type}`);
  }
}

function finish(record) {
  const withTime = { ...record, timestamp: new Date().toISOString() };
  return { ...withTime, id: emissionId(withTime) };
}

function base(type, agent) {
  return {
    type,
    agent_id: agent,
    schema_version: SCHEMA[type],
    birth_status: "asserted",
    claim: {},
    evidence: [],
    targets: [],
    is_trust_root: false,
  };
}

/**
 * Turn one `emit` input into a masked record with a deterministic id.
 * `deps.runCheck` and `deps.gesture` are injectable for tests.
 *
 * @param {Record<string, unknown>} input
 * @param {{agent: string}} cfg
 * @param {{runCheck?: typeof runBoundCheck, gesture?: typeof confirmHumanGesture, io?: object}} deps
 */
export async function buildRecord(input, cfg, deps = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new IngressError("emission must be a JSON object");
  }
  const type = input.type;
  if (!(type in INPUT_KEYS)) {
    throw new IngressError(
      `emit takes decision, foreclosure, verification or ratification; ${JSON.stringify(type)} is a human act — use the stratum CLI`,
    );
  }
  onlyKeys(input, type);
  const mask = { literals: arr(input.mask, "mask"), patterns: arr(input.mask_patterns, "mask_patterns") };

  if (type === "decision" || type === "foreclosure") {
    if (!nonEmptyString(input.narrative)) throw new IngressError(`${type} needs a non-empty "narrative"`);
    const targets = arr(input.targets, "targets");
    if (type === "decision" && targets.length > 1) {
      throw new IngressError("single-parent lineage: a decision targets at most one event");
    }
    if (input.pending !== undefined && typeof input.pending !== "boolean") {
      throw new IngressError(`"pending" must be a boolean`);
    }
    const rec = {
      ...base(type, cfg.agent),
      birth_status: input.pending ? "pending_evidence" : "asserted",
      claim: { narrative: input.narrative.trim() },
      targets,
    };
    // Mask before the record is finished: the id is derived from masked bytes.
    return finish(applyMask(rec, mask));
  }

  if (!nonEmptyString(input.target)) throw new IngressError(`${type} needs a "target" event id`);

  if (type === "verification") {
    if (!nonEmptyString(input.run)) throw new IngressError(`verification needs "run": the check command to execute`);
    const runCheck = deps.runCheck || runBoundCheck;
    const binding = runCheck({
      command: input.run,
      expectExit: input.expect_exit === undefined ? 0 : input.expect_exit,
      inputs: input.inputs,
      output: input.output,
      repo: input.repo,
      cwd: input.cwd,
    });
    // A binding must stay re-runnable, so it can't be masked. If it would
    // carry a masked identifier, refuse it instead of leaking it.
    if (canonicalJson(applyMask(binding, mask)) !== canonicalJson(binding)) {
      throw new IngressError("the check's binding contains a masked identifier — nothing recorded; rename the check so it carries none");
    }
    const rec = {
      ...base(type, cfg.agent),
      targets: [input.target],
      evidence: [{
        kind: nonEmptyString(input.kind) ? input.kind : "test_exit",
        ref: binding.command,
        checked_at: new Date().toISOString(), // metadata only in v2
        signer: cfg.agent, // metadata only in v2
        binding,
      }],
    };
    return finish(rec);
  }

  // ratification: v1, no evidence by nature, and only on a human's own act
  const gesture = deps.gesture || confirmHumanGesture;
  await gesture(input.target, deps.io);
  return finish({ ...base(type, cfg.agent), targets: [input.target] });
}

function arr(v, name) {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new IngressError(`"${name}" must be an array of strings`);
  }
  return [...v];
}

// ------------------------------------------------------------------ checks

const git = (args, cwd) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};

const sha256File = (path) => sha256Hex(readFileSync(path));

/**
 * Canonical repo identity from a remote URL: host/path, no scheme, no ".git",
 * and never userinfo. An https remote can embed a token, and this string is
 * written to a public ledger.
 */
export function normalizeRepo(url) {
  let u = String(url).trim();
  const scp = u.match(/^[^@/]+@([^:/]+):(.+)$/); // git@github.com:owner/repo.git
  if (scp) u = `${scp[1]}/${scp[2]}`;
  else {
    try {
      const parsed = new URL(u);
      u = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
    } catch {
      return null;
    }
  }
  return u.replace(/\.git$/, "").replace(/\/+$/, "") || null;
}

/**
 * Run a check and bind its result (ADR-003 §3): the command, the exact
 * commit it ran against, the exit code, and digests of named inputs and of a
 * deterministic output file. The exit code is the one this process observed;
 * nothing a caller says about it is read. Throws, never exits, so the CLI and
 * ingress share it.
 *
 * @param {{command: string, expectExit?: number, inputs?: Record<string,string> | string,
 *          output?: string, repo?: string, cwd?: string, log?: (s: string) => void,
 *          stdio?: "inherit" | "pipe"}} opts
 */
export function runBoundCheck(opts) {
  const cwd = opts.cwd ? resolve(opts.cwd) : process.cwd();
  const top = git(["rev-parse", "--show-toplevel"], cwd);
  if (top === null) throw new IngressError("--run needs a git repository: a binding pins the commit the check ran against");
  if (git(["status", "--porcelain"], top)) {
    throw new IngressError("working tree is dirty — commit or stash first: the tested tree must be the pinned commit");
  }
  const commit = git(["rev-parse", "HEAD"], top);
  const repo = opts.repo ? String(opts.repo) : normalizeRepo(git(["remote", "get-url", "origin"], top) || "");
  if (!repo) throw new IngressError("no origin remote to name the repo — pass --repo host/owner/name");
  const expectExit = opts.expectExit === undefined ? 0 : Number(opts.expectExit);
  if (!Number.isInteger(expectExit) || expectExit < 0 || expectExit > 255) {
    throw new IngressError("--expect-exit must be 0..255");
  }

  const inputs = parseInputs(opts.inputs).map(([id, path]) => ({ id, sha256: sha256File(resolve(cwd, path)) }));

  const command = String(opts.command);
  (opts.log || (() => {}))(`$ ${command}   (at ${commit.slice(0, 12)})`);
  const r = spawnSync(command, { cwd, shell: true, stdio: opts.stdio || "inherit" });
  const exit = r.status ?? 255;
  if (exit !== expectExit) {
    throw new IngressError(`check failed: exit ${exit}, expected ${expectExit} — nothing recorded`);
  }
  if (git(["rev-parse", "HEAD"], top) !== commit) throw new IngressError("HEAD moved during the check — nothing recorded");
  if (git(["status", "--porcelain"], top)) {
    (opts.log || (() => {}))("! the check left the tree dirty; the binding still pins the commit it started from");
  }
  const binding = { type: "reproducible_check", command, repo, commit, expect_exit: expectExit };
  if (inputs.length) binding.inputs = inputs;
  if (opts.output) {
    // Stored repo-relative so a re-checker finds the same file in a clean
    // checkout of the pinned commit.
    const abs = resolve(cwd, String(opts.output));
    const rel = relative(top, abs);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new IngressError("--output must be a file inside the repository");
    binding.output_sha256 = sha256File(abs);
    binding.output_path = rel.split(sep).join("/");
  }
  return binding;
}

/** Inputs as "id=path,id=path" (CLI form) or {id: path} (emit form). */
function parseInputs(inputs) {
  if (inputs === undefined || inputs === null || inputs === "") return [];
  if (typeof inputs === "string") {
    return inputs.split(",").map((pair) => {
      const at = pair.indexOf("=");
      if (at <= 0) throw new IngressError(`--input expects id=path[,id=path…], got "${pair}"`);
      return [pair.slice(0, at), pair.slice(at + 1)];
    });
  }
  if (typeof inputs === "object" && !Array.isArray(inputs)) {
    return Object.entries(inputs).map(([id, path]) => {
      if (typeof path !== "string") throw new IngressError(`inputs.${id} must be a path`);
      return [id, path];
    });
  }
  throw new IngressError(`"inputs" must be an object of id → path`);
}

// ------------------------------------------------------------------ gesture

/**
 * A ratification is a human's act. Require an interactive terminal on both
 * ends and the target id typed back. An agent's shell tool has no TTY, so it
 * gets the refusal and the command to hand the human.
 *
 * @param {string} target
 * @param {{stdin?: {isTTY?: boolean}, stderr?: {isTTY?: boolean, write: (s: string) => void},
 *          readLine?: (prompt: string) => Promise<string>}} [io]
 */
export async function confirmHumanGesture(target, io = {}) {
  const stdin = io.stdin || process.stdin;
  const stderr = io.stderr || process.stderr;
  if (!stdin.isTTY || !stderr.isTTY) {
    throw new IngressError(
      `ratification needs a human at a terminal — nothing recorded. Run it yourself:  stratum ratify ${target}`,
      EXIT.gesture,
    );
  }
  const readLine = io.readLine || defaultReadLine;
  const typed = (await readLine(`Ratify ${target}? This is an authority act (axiomatic, not evidence). Type the event id to confirm: `)).trim();
  if (typed !== target) throw new IngressError("confirmation did not match the event id — nothing recorded", EXIT.gesture);
}

async function defaultReadLine(prompt) {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

// ------------------------------------------------------------------ transport

/**
 * One request. Returns {status, body} or {status: 0, error} when the
 * endpoint can't be reached. Never logs the token or the body.
 */
async function request(cfg, path, opts = {}) {
  let url;
  try {
    url = new URL(cfg.endpoint + path);
  } catch {
    throw new IngressError(`invalid endpoint URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IngressError(`refusing endpoint with non-http(s) protocol '${url.protocol}'`);
  }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
  if (cfg.token && url.protocol === "http:" && !local && !cfg.allowInsecure) {
    throw new IngressError("refusing to send the token over plaintext http (set STRATUM_ALLOW_INSECURE=1 to override)");
  }
  const headers = {};
  if (cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const fetchImpl = cfg.fetch || fetch;
  let res;
  try {
    res = await fetchImpl(url, { method: opts.method || "GET", body: opts.body, headers });
  } catch (e) {
    return { status: 0, error: e?.cause?.code || e?.message || "unreachable" };
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body };
}

/**
 * Send one record. Outcomes:
 *   recorded — 201
 *   already  — 409, and the stored event with this id is the same act
 *   refused  — 409 for any other reason, or 400 (the record itself is wrong)
 *   failed   — the ledger could not take it now (network, 401, 413, 5xx)
 */
export async function sendRecord(cfg, record) {
  const path = `/api/logs/${cfg.log}/events`;
  const r = await request(cfg, path, { method: "POST", body: JSON.stringify(record) });
  if (r.status === 201) return { outcome: "recorded", seq: r.body?.seq };
  if (r.status === 409) {
    const back = await request(cfg, `${path}/${encodeURIComponent(record.id)}`);
    if (back.status === 200 && back.body?.record && sameAct(back.body.record, record)) {
      return { outcome: "already" };
    }
    return { outcome: "refused", message: r.body?.error || "guard refused" };
  }
  if (r.status === 400) return { outcome: "refused", message: r.body?.error || "parse error" };
  const why = r.status === 0 ? `cannot reach the endpoint (${r.error})` : `HTTP ${r.status}${r.body?.error ? `: ${r.body.error}` : ""}`;
  return { outcome: "failed", message: why };
}

// ------------------------------------------------------------------ outbox lock
//
// Every change to the outbox file (append, rewrite, the refused file) happens
// inside a short critical section guarded by an O_EXCL lock file. Network
// sends happen outside it, so the lock is held for milliseconds and a lock
// older than LOCK_STALE_MS belongs to a process that died or was suspended
// mid-write. Each holder writes a random token into the lock; stealing and
// releasing move the lock aside and check that token first, so a process can
// never remove a lock it does not hold (CodeQL js/file-system-race).

const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 5_000;
const LOCK_POLL_MS = 25;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Read a lock through one descriptor: its age and the token its holder wrote.
 * Null when the path is gone. The token, not the inode, names the holder,
 * because a filesystem may hand a freed inode number to the next lock.
 */
function readLock(path) {
  let fd;
  try {
    fd = openSync(path, "r");
  } catch {
    return null;
  }
  try {
    return { mtimeMs: fstatSync(fd).mtimeMs, token: readFileSync(fd, "utf8") };
  } finally {
    closeSync(fd);
  }
}

/**
 * Move the lock aside and remove it only if it still carries `token`.
 * If another process replaced it in the meantime, hand theirs back.
 * Internal to the outbox lock; exported for tests.
 * @returns {boolean} true when the lock holding `token` was removed
 */
export function removeLockIf(lock, token) {
  const aside = `${lock}.aside-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    renameSync(lock, aside);
  } catch {
    return false; // already gone, or another process moved it first
  }
  if (readLock(aside)?.token === token) {
    unlinkSync(aside);
    return true;
  }
  try {
    linkSync(aside, lock); // fails only if a newer lock already exists
  } catch {
    /* a newer holder exists; theirs stands */
  }
  unlinkSync(aside);
  return false;
}

/** Take the stale lock at `lock` away from a dead holder. */
function stealIfStale(lock) {
  const seen = readLock(lock);
  if (seen === null || Date.now() - seen.mtimeMs <= LOCK_STALE_MS) return false;
  return removeLockIf(lock, seen.token);
}

/**
 * Run `fn` synchronously with the outbox lock held. Waits up to
 * LOCK_WAIT_MS; on timeout returns `{locked: false}` and runs nothing.
 * @returns {{locked: true, value: any} | {locked: false}}
 */
function withOutboxLock(cfg, fn) {
  const lock = `${cfg.outboxPath}.lock`;
  mkdirSync(dirname(lock), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + LOCK_WAIT_MS;
  let fd = null;
  while (fd === null) {
    try {
      fd = openSync(lock, "wx", 0o600);
    } catch (e) {
      if (e?.code !== "EEXIST") throw e;
      if (stealIfStale(lock)) continue;
      if (Date.now() >= deadline) return { locked: false };
      sleepSync(LOCK_POLL_MS);
    }
  }
  const token = `${process.pid}-${randomBytes(8).toString("hex")}`;
  try {
    writeFileSync(fd, token);
  } finally {
    closeSync(fd);
  }
  try {
    return { locked: true, value: fn() };
  } finally {
    removeLockIf(lock, token);
  }
}

// ------------------------------------------------------------------ outbox

function refusedPath(cfg) {
  return `${cfg.outboxPath.replace(/\.jsonl$/, "")}.refused.jsonl`;
}

function readJsonl(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

/**
 * Queued records, oldest first. Masked before they were ever written.
 * Reads without the lock: a rewrite lands by atomic rename.
 */
export function readOutbox(cfg) {
  return readJsonl(cfg.outboxPath);
}

/** Caller holds the lock. */
function writeOutbox(cfg, records) {
  if (records.length === 0) {
    try {
      unlinkSync(cfg.outboxPath);
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
    return;
  }
  const tmp = `${cfg.outboxPath}.tmp-${process.pid}`;
  writeFileSync(tmp, records.map((r) => JSON.stringify(r)).join("\n") + "\n", { mode: 0o600 });
  renameSync(tmp, cfg.outboxPath);
}

/**
 * Queue one record, once. Under the lock, so an append can never land on a
 * file that a flush is about to replace. A lock that can't be had is an
 * error, never a silent drop.
 */
function enqueue(cfg, record) {
  const r = withOutboxLock(cfg, () => {
    if (readOutbox(cfg).some((q) => q.id === record.id)) return;
    appendFileSync(cfg.outboxPath, JSON.stringify(record) + "\n", { mode: 0o600 });
  });
  if (!r.locked) {
    throw new IngressError(`could not queue ${record.id}: the outbox at ${cfg.outboxPath} stayed locked; nothing recorded`, EXIT.unrecorded);
  }
}

/**
 * Send queued records in order and stop at the first that can't be sent now,
 * so a marker never lands before the event it targets. Sends run outside the
 * lock; two flushers may send the same record, which the deterministic id
 * and the read-back on 409 make harmless. A refused record is moved aside to
 * outbox-<log>.refused.jsonl and reported, not retried.
 *
 * @returns {Promise<{sent: {id: string, type: string, outcome: string}[],
 *   refused: {id: string, type: string, message: string}[], pending: number,
 *   failure: string | null, busy: boolean}>}
 */
export async function flushOutbox(cfg) {
  const queue = readOutbox(cfg);
  const sent = [];
  const refused = [];
  let failure = null;
  for (const rec of queue) {
    const r = await sendRecord(cfg, rec);
    if (r.outcome === "recorded" || r.outcome === "already") {
      sent.push({ id: rec.id, type: rec.type, outcome: r.outcome });
    } else if (r.outcome === "refused") {
      refused.push({ rec, message: r.message });
    } else {
      failure = r.message;
      break;
    }
  }
  const settled = withOutboxLock(cfg, () => {
    const already = new Set(readJsonl(refusedPath(cfg)).map((r) => r.id));
    for (const { rec } of refused) {
      if (!already.has(rec.id)) appendFileSync(refusedPath(cfg), JSON.stringify(rec) + "\n", { mode: 0o600 });
    }
    const done = new Set([...sent.map((x) => x.id), ...refused.map((x) => x.rec.id)]);
    const rest = readOutbox(cfg).filter((rec) => !done.has(rec.id));
    writeOutbox(cfg, rest);
    return rest.length;
  });
  const report = refused.map(({ rec, message }) => ({ id: rec.id, type: rec.type, message }));
  if (!settled.locked) {
    // Sends are idempotent, so leaving everything queued loses nothing; the next flush settles it.
    return { sent, refused: report, pending: readOutbox(cfg).length, failure, busy: true };
  }
  return { sent, refused: report, pending: settled.value, failure, busy: false };
}

/**
 * Emit one act: queue it (deduplicated by id), then flush the whole queue in
 * order. Unconfigured is a no-op with a notice and touches no disk.
 */
export async function emit(input, cfg, deps = {}) {
  if (cfg.mode !== "configured") return { configured: false, notice: UNCONFIGURED_NOTICE };
  const record = await buildRecord(input, cfg, deps);
  enqueue(cfg, record);
  const flushed = await flushOutbox(cfg);
  return { configured: true, record, ...flushed };
}
