/**
 * Off-system anchor of each allowlisted log's head (R2, ADR-004, tp-035).
 *
 * A Cron Trigger, never the write path: appends never wait on checkmate.
 * Per allowlisted log, each tick:
 *
 *   1. stats() — skip an empty log (the hub needs rows >= 1).
 *   2. GET  {CHECKMATE_URL}/api/hub/ledger-anchors?ledger=stratum:<logId>;
 *      the row with the most `rows` is the hub's last anchor.
 *   3. Judge LOCALLY first, from the log's own stored, load-verified chain:
 *        first      no anchor yet
 *        extends    our chain at that row equals the hub's head
 *        hub-ahead  the hub's row is past our head (we lost a tail, OR
 *                   someone else wrote a longer anchor under this name)
 *        forked     our chain at that row differs from the hub's head
 *      Stratum's verdict is the label of record: the hub's 409 kind can
 *      mislead (a same-length rewrite comes back as ledger-regression).
 *   4. POST /api/hub/ledger-anchor {ledger, rows, head, prevHead} with exactly
 *      what Stratum has, even when it disagrees. The hub refuses any
 *      disagreement with 409 AND records it as a critical incident in its own
 *      chain: the break is the record.
 *   5. One structured log line per log. Secrets never appear in it.
 *
 * Inert until provisioned: with CHECKMATE_CLIENT_ID / _SECRET unset it logs
 * `not-configured` and makes zero outbound calls. A bad config (non-https URL,
 * an id over 56 characters, a playground-* id) is refused whole, also with
 * zero outbound calls: a typo in a var should be loud, not partly obeyed.
 *
 * Pure of Cloudflare imports (the gate-policy.ts pattern): fetch, the clock
 * signal and the DO accessors are injected, so vitest drives it with fakes.
 */

import { isPlayground, isValidLogId } from "./auth.js";

export const DEFAULT_CHECKMATE_URL = "https://checkmate.mazzeleczzare.com";
export const DEFAULT_ANCHOR_LOGS = "demo";
export const LEDGER_PREFIX = "stratum:";
/** checkmate caps ledger ids at 64 characters; "stratum:" takes 8. */
export const MAX_ANCHOR_LOG_ID = 56;
export const REQUEST_TIMEOUT_MS = 8_000;

const HEX64 = /^[0-9a-f]{64}$/;
/** Loopback http is allowed for a local workerd smoke only; it never leaves the host. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

// ---- configuration --------------------------------------------------------

export interface AnchorEnv {
  CHECKMATE_URL?: string;
  ANCHOR_LOGS?: string;
  CHECKMATE_CLIENT_ID?: string;
  CHECKMATE_CLIENT_SECRET?: string;
}

export interface AnchorConfig {
  /** origin only, no trailing slash */
  url: string;
  logs: string[];
  credentials: { clientId: string; clientSecret: string };
}

export type ConfigResult =
  | { ok: true; config: AnchorConfig }
  | { ok: false; outcome: "not-configured" | "config-refused"; reason: string };

function parseUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const secure = u.protocol === "https:" || (u.protocol === "http:" && LOOPBACK.has(u.hostname));
  const bare = u.username === "" && u.password === "" && u.pathname === "/" && u.search === "" && u.hash === "";
  return secure && bare ? u.origin : null;
}

/** Split ANCHOR_LOGS on commas or whitespace; order kept, duplicates dropped. */
export function parseLogList(raw: string): string[] {
  return [...new Set(raw.split(/[\s,]+/).filter((s) => s.length > 0))];
}

/** Why an id may not be anchored, or null when it may. */
export function refuseLogId(id: string): string | null {
  if (!isValidLogId(id)) return `"${id}" is not a valid log id`;
  if (id.length > MAX_ANCHOR_LOG_ID) {
    return `"${id}" is over ${MAX_ANCHOR_LOG_ID} characters (the hub caps ledger ids at 64)`;
  }
  if (isPlayground(id)) return `"${id}" is a playground (public-write; anyone could inflate it)`;
  return null;
}

export function parseAnchorConfig(env: AnchorEnv): ConfigResult {
  const clientId = env.CHECKMATE_CLIENT_ID ?? "";
  const clientSecret = env.CHECKMATE_CLIENT_SECRET ?? "";
  if (clientId === "" || clientSecret === "") {
    return { ok: false, outcome: "not-configured", reason: "CHECKMATE_CLIENT_ID / CHECKMATE_CLIENT_SECRET unset" };
  }
  const url = parseUrl(env.CHECKMATE_URL ?? DEFAULT_CHECKMATE_URL);
  if (url === null) {
    return { ok: false, outcome: "config-refused", reason: "CHECKMATE_URL must be a bare https origin" };
  }
  const logs = parseLogList(env.ANCHOR_LOGS ?? DEFAULT_ANCHOR_LOGS);
  for (const id of logs) {
    const why = refuseLogId(id);
    if (why !== null) return { ok: false, outcome: "config-refused", reason: why };
  }
  return { ok: true, config: { url, logs, credentials: { clientId, clientSecret } } };
}

// ---- the tick -------------------------------------------------------------

/** unknown = not judged yet (the hub could not be read). */
export type LocalVerdict = "first" | "extends" | "hub-ahead" | "forked" | "empty" | "load-failed" | "unknown";

export interface HubRow {
  rows: number;
  head: string;
  by: string | null;
  at: number | null;
}

/** One line per log per tick. Never carries a credential. */
export interface AnchorLine {
  event: "stratum.anchor";
  log: string;
  ledger: string;
  local: LocalVerdict;
  /** anchored · unchanged · refused:<kind> · not-sent · transport · hub-error:<status> · hub-malformed · error */
  hub: string;
  rows?: number;
  head?: string;
  prevHead?: string;
  /** the hub's last anchor before this tick */
  hubLast?: HubRow;
  incident?: string;
  error?: string;
}

/** The run-level line when nothing is attempted (not-configured, config-refused). */
export interface AnchorSkipLine {
  event: "stratum.anchor";
  outcome: "not-configured" | "config-refused";
  reason: string;
}

export interface LogStats {
  events: number;
  head_digest: string;
}

export interface AnchorDeps {
  env: AnchorEnv;
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  stats: (logId: string) => Promise<LogStats>;
  anchorPoint: (logId: string, rows: number) => Promise<string | null>;
  log: (line: AnchorLine | AnchorSkipLine) => void;
  /** per-request abort signal; injected so tests need no real clock */
  timeout?: () => AbortSignal;
}

class Transport extends Error {}

function headersFor(config: AnchorConfig, json: boolean): Record<string, string> {
  const h: Record<string, string> = {
    "CF-Access-Client-Id": config.credentials.clientId,
    "CF-Access-Client-Secret": config.credentials.clientSecret,
    "user-agent": "stratum-anchor/1",
  };
  if (json) h["content-type"] = "application/json";
  return h;
}

async function call(
  deps: AnchorDeps,
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    const signal = (deps.timeout ?? (() => AbortSignal.timeout(REQUEST_TIMEOUT_MS)))();
    // Never follow a redirect: fetch keeps custom headers across origins, so a
    // 3xx would hand the Access service-token secret to wherever it points.
    // A redirect is reported as hub-error:<status> instead (touchstone, R2 build).
    res = await deps.fetch(url, { ...init, signal, redirect: "manual" });
  } catch (e) {
    // Only the error's name: a message could echo request details.
    throw new Transport(e instanceof Error ? e.name : "unknown");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** The hub row with the most rows, or null; undefined when the list is malformed. */
export function lastHubRow(body: unknown): HubRow | null | undefined {
  if (!Array.isArray(body)) return undefined;
  let last: HubRow | null = null;
  for (const r of body as unknown[]) {
    if (typeof r !== "object" || r === null) return undefined;
    const o = r as Record<string, unknown>;
    if (typeof o.rows !== "number" || !Number.isSafeInteger(o.rows) || o.rows < 1) return undefined;
    if (typeof o.head !== "string" || !HEX64.test(o.head)) return undefined;
    // >= keeps the latest of equal rows, matching the hub's own ORDER BY rows, at
    if (last === null || o.rows >= last.rows) {
      last = {
        rows: o.rows,
        head: o.head,
        by: typeof o.by === "string" ? o.by.slice(0, 64) : null,
        at: typeof o.at === "number" ? o.at : null,
      };
    }
  }
  return last;
}

/**
 * Anchor one log. Never throws: a transport fault (timeout, DNS, reset) keeps
 * whatever the local verdict already was and reports `transport`; anything
 * else unexpected reports `error` for this log, and the tick moves on.
 */
async function anchorOne(deps: AnchorDeps, config: AnchorConfig, logId: string): Promise<AnchorLine> {
  const line: AnchorLine = {
    event: "stratum.anchor",
    log: logId,
    ledger: LEDGER_PREFIX + logId,
    local: "unknown",
    hub: "not-sent",
  };
  try {
    return await anchorSteps(deps, config, logId, line);
  } catch (e) {
    if (e instanceof Transport) return { ...line, hub: "transport", error: e.message };
    return { ...line, hub: "error", error: e instanceof Error ? e.name : "unknown" };
  }
}

async function anchorSteps(
  deps: AnchorDeps,
  config: AnchorConfig,
  logId: string,
  line: AnchorLine,
): Promise<AnchorLine> {
  const ledger = line.ledger;
  let stats: LogStats;
  try {
    stats = await deps.stats(logId);
  } catch (e) {
    // A log that fails its own chain on load is news in itself; never anchor it.
    return { ...line, local: "load-failed", error: e instanceof Error ? e.message.slice(0, 200) : "unknown" };
  }
  line.rows = stats.events;
  line.head = stats.head_digest;

  const read = await call(deps, `${config.url}/api/hub/ledger-anchors?ledger=${encodeURIComponent(ledger)}`, {
    method: "GET",
    headers: headersFor(config, false),
  });
  if (read.status !== 200) return { ...line, hub: `hub-error:${read.status}` };
  const last = lastHubRow(read.body);
  // Without the hub's last anchor there is no honest prevHead: don't post.
  if (last === undefined) return { ...line, hub: "hub-malformed" };

  // An emptied previously anchored log is a regression too. The hub rejects
  // rows=0 as malformed, so report it locally without a misleading POST.
  if (stats.events === 0) {
    return last === null
      ? { ...line, local: "empty" }
      : { ...line, local: "hub-ahead", hubLast: last };
  }

  let prevHead: string | null = null;
  if (last === null) line.local = "first";
  else {
    line.hubLast = last;
    // Judge against one snapshot: a row past stats.events is ahead, even if an
    // append lands between the two DO calls.
    const point = last.rows > stats.events ? null : await deps.anchorPoint(logId, last.rows);
    if (point === null) line.local = "hub-ahead";
    else {
      line.local = point === last.head ? "extends" : "forked";
      prevHead = point;
    }
  }

  const body: Record<string, unknown> = { ledger, rows: stats.events, head: stats.head_digest };
  if (prevHead !== null) {
    body.prevHead = prevHead;
    line.prevHead = prevHead;
  }
  const res = await call(deps, `${config.url}/api/hub/ledger-anchor`, {
    method: "POST",
    headers: headersFor(config, true),
    body: JSON.stringify(body),
  });
  const r = (typeof res.body === "object" && res.body !== null ? res.body : {}) as Record<string, unknown>;
  if (res.status === 200) {
    // Only the hub's own answer counts as witnessed: a 200 that is not
    // {ok:true,…} (an Access page, a proxy) must never read as anchored.
    if (r.ok !== true) return { ...line, hub: "hub-malformed" };
    return { ...line, hub: r.unchanged === true ? "unchanged" : "anchored" };
  }
  if (res.status === 409) {
    const kind = typeof r.error === "string" && /^[a-z-]{1,40}$/.test(r.error) ? r.error : "unknown";
    const out: AnchorLine = { ...line, hub: `refused:${kind}` };
    if (typeof r.incident === "string") out.incident = r.incident.slice(0, 80);
    return out;
  }
  return { ...line, hub: `hub-error:${res.status}` };
}

/**
 * One tick. Logs are anchored one after another; a transport fault on one
 * is reported and the next is still tried. No retries inside a tick: the
 * next tick is the retry. Returns the lines it logged (for tests).
 */
export async function runAnchors(deps: AnchorDeps): Promise<(AnchorLine | AnchorSkipLine)[]> {
  const parsed = parseAnchorConfig(deps.env);
  if (!parsed.ok) {
    const skip: AnchorSkipLine = { event: "stratum.anchor", outcome: parsed.outcome, reason: parsed.reason };
    deps.log(skip);
    return [skip];
  }
  const out: AnchorLine[] = [];
  for (const logId of parsed.config.logs) {
    const line = await anchorOne(deps, parsed.config, logId);
    deps.log(line);
    out.push(line);
  }
  return out;
}
