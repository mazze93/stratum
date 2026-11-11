/**
 * Ingress (ct-reshape T1) — the council's acceptance gate as executable tests.
 *
 * The ledger here is a local HTTP server that mirrors worker/src/index.ts
 * (routes, auth, status mapping) over the REAL core guards and the REAL
 * bearer check from worker/src/auth.ts, so every refusal below is the
 * contract's own. The CLI is spawned the way a plugin hook would call it.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  ContractViolation,
  EpisodicLog,
  ParseError,
  Status,
  authorityOf,
  canonicalize,
  eventToRecord,
  recordToEvent,
} from "@stratum/core";
import { bearerOk, canRead, canWrite, isValidLogId } from "../../worker/src/auth.js";
import {
  EXIT,
  MASK_TOKEN,
  UNCONFIGURED_NOTICE,
  buildRecord,
  canonicalJson,
  confirmHumanGesture,
  emissionId,
  removeLockIf,
  sendRecord,
  type ConfiguredIngress,
  type IngressRecord,
} from "../lib/ingress.mjs";

const CLI = fileURLToPath(new URL("../bin/stratum.mjs", import.meta.url));
const TOKEN = "test-token-not-a-secret";
const LOG = "ingress-test";
const AGENT = "cognitive-topology";

// ------------------------------------------------------------------ fake ledger

interface Ledger {
  url: string;
  logs: Map<string, EpisodicLog>;
  bodies: string[];
  requests: number;
  down: boolean;
  server: Server;
}

const readBody = (req: IncomingMessage) =>
  new Promise<string>((ok) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => ok(b));
  });

async function startLedger(): Promise<Ledger> {
  const ledger = { logs: new Map(), bodies: [], requests: 0, down: false } as unknown as Ledger;
  const logOf = (id: string) => {
    if (!ledger.logs.has(id)) ledger.logs.set(id, new EpisodicLog());
    return ledger.logs.get(id)!;
  };
  ledger.server = createServer(async (req, res) => {
    ledger.requests++;
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (ledger.down) return send(503, { error: "unavailable" });
    const m = /^\/api\/logs\/([^/]+)\/events(?:\/([^/?]+))?$/.exec(req.url ?? "");
    if (!m) return send(404, { error: "not found" });
    const logId = m[1]!;
    if (!isValidLogId(logId)) return send(400, { error: "invalid log id" });
    const headers = new Headers();
    if (req.headers.authorization) headers.set("authorization", req.headers.authorization);
    const authed = await bearerOk(new Request("http://x/", { headers }), TOKEN);
    const writing = req.method !== "GET";
    if (!(writing ? canWrite(logId, authed) : canRead(logId, authed))) return send(401, { error: "unauthorized" });
    const log = logOf(logId);
    if (req.method === "GET" && m[2]) {
      const id = decodeURIComponent(m[2]);
      if (!log.has(id)) return send(404, { error: "unknown event" });
      return send(200, { record: eventToRecord(log.get(id)) });
    }
    if (req.method === "POST" && !m[2]) {
      const raw = await readBody(req);
      ledger.bodies.push(raw);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(400, { error: "body must be a JSON event record" });
      }
      try {
        const ev = log.append(recordToEvent(body));
        return send(201, { ok: true, event: eventToRecord(ev), seq: ev.seq, head: ev.seq });
      } catch (e) {
        if (e instanceof ParseError) return send(400, { error: e.message });
        if (e instanceof ContractViolation) return send(409, { error: e.message });
        throw e;
      }
    }
    return send(404, { error: "not found" });
  });
  await new Promise<void>((ok) => ledger.server.listen(0, "127.0.0.1", ok));
  ledger.url = `http://127.0.0.1:${(ledger.server.address() as AddressInfo).port}`;
  return ledger;
}

// ------------------------------------------------------------------ harness

let home = "";
let ledger: Ledger;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "stratum-ingress-home-"));
  ledger = await startLedger();
});
afterEach(async () => {
  await new Promise<void>((ok) => ledger.server.close(() => ok()));
});

interface Run { status: number | null; stdout: string; stderr: string }

/** Async spawn: the fake ledger lives in this process and must keep serving. */
function stratum(args: string[], input: unknown, env: Record<string, string | undefined> = {}, cwd?: string) {
  const base: Record<string, string | undefined> = { ...process.env };
  for (const k of ["STRATUM_LOG", "STRATUM_TOKEN", "STRATUM_AGENT", "STRATUM_ENDPOINT", "XDG_STATE_HOME"]) delete base[k];
  return new Promise<Run>((ok) => {
    const child = spawn("node", [CLI, ...args], {
      cwd,
      env: {
        ...base,
        HOME: home,
        NO_COLOR: "1",
        STRATUM_ENDPOINT: ledger.url,
        STRATUM_TOKEN: TOKEN,
        STRATUM_LOG: LOG,
        STRATUM_AGENT: AGENT,
        ...env,
      } as NodeJS.ProcessEnv,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("close", (status) => ok({ status, stdout, stderr }));
    child.stdin.end(input === undefined ? "" : typeof input === "string" ? input : JSON.stringify(input));
  });
}

const emitCli = (input: unknown, env: Record<string, string | undefined> = {}, cwd?: string) =>
  stratum(["emit"], input, env, cwd);

const outboxPath = () => join(home, ".local", "state", "stratum", `outbox-${LOG}.jsonl`);
const events = () => ledger.logs.get(LOG)?.eventsUpto() ?? [];

const cfg = (over: Partial<ConfiguredIngress> = {}): ConfiguredIngress => ({
  mode: "configured",
  endpoint: ledger.url,
  token: TOKEN,
  log: LOG,
  agent: AGENT,
  outboxPath: outboxPath(),
  allowInsecure: false,
  ...over,
});

function gitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "stratum-ingress-repo-"));
  const sh = (...a: string[]) => {
    const r = spawnSync("git", a, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
  };
  sh("init", "-q");
  sh("config", "user.email", "t@example.invalid");
  sh("config", "user.name", "t");
  sh("config", "commit.gpgsign", "false");
  sh("remote", "add", "origin", "https://github.com/mazze93/demo.git");
  writeFileSync(join(dir, "README"), "fixture\n");
  sh("add", ".");
  sh("commit", "-q", "-m", "init");
  return dir;
}

// ------------------------------------------------------------------ tests

describe("identity: deterministic, idempotent, canonical", () => {
  test("the id is a digest of the record without its metadata, so a retry is the same id", async () => {
    const a = await buildRecord({ type: "decision", narrative: "adopt the ingress", pending: true }, { agent: AGENT });
    const b = await buildRecord({ type: "decision", narrative: "adopt the ingress", pending: true }, { agent: AGENT });
    expect(a.id).toMatch(/^dec-[0-9a-f]{24}$/);
    expect(a.id).toBe(b.id);
    expect(emissionId({ ...a, timestamp: "1999-01-01T00:00:00Z" })).toBe(a.id);
    const c = await buildRecord({ type: "decision", narrative: "adopt the ingress" }, { agent: AGENT });
    expect(c.id).not.toBe(a.id); // a different birth status is a different act
  });

  test("canonical form matches core's RFC 8785 canonicalize byte for byte", async () => {
    const r = await buildRecord({ type: "foreclosure", narrative: "no YAML writer — ever ✓" }, { agent: AGENT });
    expect(canonicalJson(r)).toBe(canonicalize(r));
  });

  test("re-emitting the same act records it once and says so", async () => {
    const input = { type: "decision", narrative: "route decisions through Stratum", pending: true };
    const first = await emitCli(input);
    expect(first.status, first.stderr).toBe(EXIT.ok);
    expect(first.stdout).toMatch(/recorded · decision/);
    const second = await emitCli(input);
    expect(second.status, second.stderr).toBe(EXIT.ok);
    expect(second.stdout).toMatch(/already recorded/);
    expect(events()).toHaveLength(1);
  });

  test("a 409 on an id that holds a DIFFERENT act is a refusal, not 'already'", async () => {
    const a = await buildRecord({ type: "decision", narrative: "first" }, { agent: AGENT });
    expect((await sendRecord(cfg(), a)).outcome).toBe("recorded");
    const impostor: IngressRecord = { ...a, claim: { narrative: "something else" } };
    const r = await sendRecord(cfg(), impostor);
    expect(r.outcome).toBe("refused");
    expect(r.message).toMatch(/duplicate event id/);
  });
});

describe("evidence is produced by running the check, never supplied", () => {
  const forged = [
    ["typed checked_at evidence", { evidence: [{ kind: "test_exit", ref: "npm test", checked_at: "2026-11-11T00:00:00Z", signer: null }] }, /"evidence" is refused: evidence is produced by running the check/],
    ["a top-level checked_at", { checked_at: "2026-11-11T00:00:00Z" }, /"checked_at" is refused/],
    ["a hand-written binding", { binding: { type: "reproducible_check", command: "npm test", repo: "github.com/x/y", commit: "a".repeat(40), expect_exit: 0 } }, /"binding" is refused/],
    ["a claimed exit code", { exit_code: 0 }, /unknown field "exit_code"/],
  ] as const;
  for (const [name, extra, why] of forged) {
    test(`refused before any request: ${name}`, async () => {
      const r = await emitCli({ type: "verification", target: "dec-x", run: "true", ...extra });
      expect(r.status).toBe(EXIT.error);
      expect(r.stderr).toMatch(why);
      expect(ledger.requests).toBe(0);
      expect(existsSync(outboxPath())).toBe(false);
    });
  }

  test("prose can't smuggle evidence either: claim, birth_status and id are refused on a decision", async () => {
    for (const extra of [{ claim: { narrative: "x" } }, { birth_status: "validated" }, { id: "dec-mine" }]) {
      const r = await emitCli({ type: "decision", narrative: "x", ...extra });
      expect(r.status).toBe(EXIT.error);
    }
    expect(ledger.requests).toBe(0);
  });

  test("a check that exits non-zero records nothing, whatever the caller expected", async () => {
    const repo = gitRepo();
    const r = await emitCli({ type: "verification", target: "dec-x", run: "exit 1" }, {}, repo);
    expect(r.status).toBe(EXIT.error);
    expect(r.stderr).toMatch(/check failed: exit 1, expected 0 — nothing recorded/);
    expect(ledger.requests).toBe(0);
  });

  test("a passing check binds the observed exit to the commit, and the ledger validates the target", async () => {
    const repo = gitRepo();
    const dec = await emitCli({ type: "decision", narrative: "the fixture builds", pending: true }, {}, repo);
    expect(dec.status, dec.stderr).toBe(EXIT.ok);
    const target = events()[0]!.id;
    const ver = await emitCli({ type: "verification", target, run: "test -f README" }, {}, repo);
    expect(ver.status, ver.stderr).toBe(EXIT.ok);
    const log = ledger.logs.get(LOG)!;
    expect(log.statusAt(target, log.head)).toBe(Status.Validated);
    expect(authorityOf(log, target, log.head)).toBe("authoritative_verified");
    const v = eventToRecord(log.eventsUpto()[1]!);
    expect(v.schema_version).toBe(2);
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).stdout.trim();
    expect(v.evidence[0]!.binding).toMatchObject({ type: "reproducible_check", command: "test -f README", commit: head, expect_exit: 0, repo: "github.com/mazze93/demo" });
  });

  test("the ledger itself refuses a v2 verification with only a typed timestamp (I1)", async () => {
    const dec = await buildRecord({ type: "decision", narrative: "x", pending: true }, { agent: AGENT });
    await sendRecord(cfg(), dec);
    const forgedVerification: IngressRecord = {
      id: "ver-forged", type: "verification", agent_id: AGENT, schema_version: 2, birth_status: "asserted",
      claim: {}, evidence: [{ kind: "test_exit", ref: "npm test", checked_at: "2026-11-11T00:00:00Z", signer: AGENT }],
      targets: [dec.id], is_trust_root: false, timestamp: null,
    };
    const r = await sendRecord(cfg(), forgedVerification);
    expect(r.outcome).toBe("refused");
    expect(r.message).toMatch(/I1: v2 verification/);
  });
});

describe("ratification needs a human's own act", () => {
  test("no TTY: refused with the command for the human, nothing sent", async () => {
    const r = await emitCli({ type: "ratification", target: "dec-abc" });
    expect(r.status).toBe(EXIT.gesture);
    expect(r.stderr).toMatch(/stratum ratify dec-abc/);
    expect(ledger.requests).toBe(0);
  });

  test("a TTY and the id typed back: a v1 ratification with no evidence", async () => {
    const io = { stdin: { isTTY: true }, stderr: { isTTY: true, write: () => {} }, readLine: async () => "dec-abc\n" };
    const rec = await buildRecord({ type: "ratification", target: "dec-abc" }, { agent: AGENT }, { io });
    expect(rec).toMatchObject({ type: "ratification", schema_version: 1, evidence: [], targets: ["dec-abc"] });
  });

  test("a TTY but the wrong id typed back: refused", async () => {
    const io = { stdin: { isTTY: true }, stderr: { isTTY: true, write: () => {} }, readLine: async () => "yes" };
    await expect(confirmHumanGesture("dec-abc", io)).rejects.toMatchObject({ code: EXIT.gesture });
  });

  test("other human acts are not emit-able at all", async () => {
    for (const type of ["dispute", "rejection", "contradiction", "supersession", "trust_root_revoked", "invalidation"]) {
      const r = await emitCli({ type, target: "dec-abc" });
      expect(r.status).toBe(EXIT.error);
    }
    expect(ledger.requests).toBe(0);
  });
});

describe("masking boundary (secure-pride simulation)", () => {
  const CLIENT = "Bull City Harm Reduction";
  const EMAIL = "intake@bullcity.example";
  const input = {
    type: "decision",
    narrative: `Rotate ${CLIENT}'s DNS records; contact ${EMAIL} before the change window.`,
    mask: [CLIENT],
    mask_patterns: ["[\\w.+-]+@[\\w-]+\\.[\\w.]+"],
  };
  const leaks = (s: string) => s.includes(CLIENT) || s.includes(EMAIL) || s.includes("Bull City");

  test("nothing unmasked reaches the outbox, the terminal, the id, or the wire", async () => {
    ledger.down = true;
    const queued = await emitCli(input);
    expect(queued.status).toBe(EXIT.unrecorded);
    const box = readFileSync(outboxPath(), "utf8");
    expect(leaks(box)).toBe(false);
    expect(box).toContain(MASK_TOKEN);
    expect(leaks(queued.stdout + queued.stderr)).toBe(false);

    ledger.down = false;
    const flushed = await stratum(["outbox", "--flush"], undefined);
    expect(flushed.status, flushed.stderr).toBe(EXIT.ok);
    expect(leaks(flushed.stdout + flushed.stderr)).toBe(false);
    expect(ledger.bodies.every((b) => !leaks(b))).toBe(true);
    const stored = eventToRecord(events()[0]!);
    expect(stored.claim["narrative"]).toBe(`Rotate ${MASK_TOKEN}'s DNS records; contact ${MASK_TOKEN} before the change window.`);
    expect(leaks(stored.id)).toBe(false);
  });

  test("the id is derived from masked bytes: two clients, one masked act, one id", async () => {
    const a = await buildRecord(input, { agent: AGENT });
    const b = await buildRecord({ ...input, narrative: input.narrative.replace(CLIENT, "Another Org"), mask: ["Another Org"] }, { agent: AGENT });
    expect(a.id).toBe(b.id);
  });

  test("a check whose binding would carry a masked identifier is refused, not leaked", async () => {
    const repo = gitRepo();
    const r = await emitCli({ type: "verification", target: "dec-x", run: `echo ${CLIENT}`, mask: [CLIENT] }, {}, repo);
    expect(r.status).toBe(EXIT.error);
    expect(r.stderr).toMatch(/masked identifier/);
    expect(ledger.bodies).toHaveLength(0);
  });
});

describe("degradation: unset is a notice, configured-but-failing is loud", () => {
  test("unset: no request, no file, the notice, exit 0", async () => {
    const r = await emitCli({ type: "decision", narrative: "x" }, { STRATUM_LOG: undefined });
    expect(r.status).toBe(EXIT.ok);
    expect(r.stderr).toContain(UNCONFIGURED_NOTICE);
    expect(ledger.requests).toBe(0);
    expect(existsSync(join(home, ".local"))).toBe(false);
  });

  test("unset with --required: the notice and a non-zero exit", async () => {
    const r = await stratum(["emit", "--required"], { type: "decision", narrative: "x" }, { STRATUM_LOG: undefined });
    expect(r.status).toBe(EXIT.unrecorded);
    expect(r.stderr).toContain(UNCONFIGURED_NOTICE);
  });

  test("unreachable: queued, counted on every run, flushed in order once it's back", async () => {
    const closed = { STRATUM_ENDPOINT: "http://127.0.0.1:9" };
    const one = await emitCli({ type: "decision", narrative: "first", pending: true }, closed);
    expect(one.status).toBe(EXIT.unrecorded);
    expect(one.stderr).toMatch(/1 event\(s\) unrecorded for log ingress-test/);
    const two = await emitCli({ type: "foreclosure", narrative: "second" }, closed);
    expect(two.stderr).toMatch(/2 event\(s\) unrecorded/);

    const status = await stratum(["outbox"], undefined);
    expect(status.status).toBe(EXIT.unrecorded);
    expect(status.stdout).toMatch(/2 event\(s\) unrecorded/);

    const flushed = await stratum(["outbox", "--flush"], undefined);
    expect(flushed.status, flushed.stderr).toBe(EXIT.ok);
    expect(events().map((e) => e.type)).toEqual(["decision", "foreclosure"]);
    expect(existsSync(outboxPath())).toBe(false);
  });

  test("a wrong token is an integrity failure: queued and shown, never a silent no-op", async () => {
    const r = await emitCli({ type: "decision", narrative: "x" }, { STRATUM_TOKEN: "wrong" });
    expect(r.status).toBe(EXIT.unrecorded);
    expect(r.stderr).toMatch(/HTTP 401/);
    expect(r.stderr).not.toContain("wrong");
    expect(events()).toHaveLength(0);
  });

  test("a guard refusal exits 2 and moves the record aside instead of retrying it forever", async () => {
    const dec = await emitCli({ type: "decision", narrative: "asserted, not pending" });
    const target = events()[0]!.id;
    expect(dec.status).toBe(EXIT.ok);
    const repo = gitRepo();
    // asserted -> validated is not a legal transition: the contract refuses it
    const r = await emitCli({ type: "verification", target, run: "true" }, {}, repo);
    expect(r.status).toBe(EXIT.refused);
    expect(r.stderr).toMatch(/illegal transition asserted -> validated/);
    expect(existsSync(outboxPath())).toBe(false);
    const dir = join(home, ".local", "state", "stratum");
    expect(readdirSync(dir)).toContain(`outbox-${LOG}.refused.jsonl`);
  });

  test("single-parent lineage is refused before the wire", async () => {
    const r = await emitCli({ type: "decision", narrative: "x", targets: ["a", "b"] });
    expect(r.status).toBe(EXIT.error);
    expect(ledger.requests).toBe(0);
  });

  test("the token never travels over plaintext http to a non-local host", async () => {
    const r = await emitCli({ type: "decision", narrative: "x" }, { STRATUM_ENDPOINT: "http://ledger.example.invalid" });
    expect(r.status).toBe(EXIT.error);
    expect(r.stderr).toMatch(/plaintext http/);
  });

  test("an automated client must name itself: no agent, no emit", async () => {
    const r = await emitCli({ type: "decision", narrative: "x" }, { STRATUM_AGENT: undefined });
    expect(r.status).toBe(EXIT.error);
    expect(r.stderr).toMatch(/no agent named/);
  });
});

describe("outbox under concurrency (CodeQL js/file-system-race)", () => {
  const lockPath = () => `${outboxPath()}.lock`;
  const plantLock = (ageMs: number) => {
    mkdirSync(join(home, ".local", "state", "stratum"), { recursive: true });
    writeFileSync(lockPath(), "");
    const t = (Date.now() - ageMs) / 1000;
    utimesSync(lockPath(), t, t);
  };

  test("hooks emitting at once never lose a queued record", async () => {
    const closed = { STRATUM_ENDPOINT: "http://127.0.0.1:9" };
    const n = 12;
    const runs = await Promise.all(
      Array.from({ length: n }, (_, i) => emitCli({ type: "decision", narrative: `parallel ${i}`, pending: true }, closed)),
    );
    for (const r of runs) expect(r.status, r.stderr).toBe(EXIT.unrecorded);
    const queued = readFileSync(outboxPath(), "utf8").trim().split("\n").map((l) => JSON.parse(l).id);
    expect(new Set(queued).size).toBe(n);
    expect(queued).toHaveLength(n);
    const flushed = await stratum(["outbox", "--flush"], undefined);
    expect(flushed.status, flushed.stderr).toBe(EXIT.ok);
    expect(events()).toHaveLength(n);
    expect(existsSync(lockPath())).toBe(false);
  }, 30_000);

  test("the same act emitted twice while down is queued once", async () => {
    const closed = { STRATUM_ENDPOINT: "http://127.0.0.1:9" };
    const act = { type: "decision", narrative: "said twice", pending: true };
    await emitCli(act, closed);
    const again = await emitCli(act, closed);
    expect(again.stderr).toMatch(/1 event\(s\) unrecorded/);
    expect(readFileSync(outboxPath(), "utf8").trim().split("\n")).toHaveLength(1);
  });

  test("releasing never removes a lock that another process now holds", () => {
    plantLock(0);
    writeFileSync(lockPath(), "mine");
    unlinkSync(lockPath()); // ours was taken over while we were suspended...
    writeFileSync(lockPath(), "theirs"); // ...and the next holder may even reuse the inode
    expect(removeLockIf(lockPath(), "mine")).toBe(false);
    expect(readFileSync(lockPath(), "utf8")).toBe("theirs");
    expect(removeLockIf(lockPath(), "theirs")).toBe(true);
    expect(existsSync(lockPath())).toBe(false);
  });

  test("a lock left by a dead process is taken over", async () => {
    plantLock(60_000);
    const r = await emitCli({ type: "decision", narrative: "after a crash", pending: true });
    expect(r.status, r.stderr).toBe(EXIT.ok);
    expect(events()).toHaveLength(1);
    expect(existsSync(lockPath())).toBe(false);
  });

  test("a live lock is waited on; one that never frees is an error, never a silent drop", async () => {
    plantLock(0);
    const r = await emitCli({ type: "decision", narrative: "blocked", pending: true });
    expect(r.status).toBe(EXIT.unrecorded);
    expect(r.stderr).toMatch(/stayed locked; nothing recorded/);
    expect(existsSync(outboxPath())).toBe(false);
    expect(ledger.requests).toBe(0);
    expect(existsSync(lockPath())).toBe(true); // someone else's lock is never removed
  }, 15_000);
});

