import { describe, expect, test } from "vitest";
import { recordToEvent } from "@stratum/core";
import {
  lastHubRow,
  parseAnchorConfig,
  parseLogList,
  runAnchors,
  type AnchorDeps,
  type AnchorEnv,
  type AnchorLine,
} from "../src/anchor.js";
import { PersistentLog, type EventStore } from "../src/persist.js";

// ---- fakes ----------------------------------------------------------------

/** Minimal in-memory store; rollback is not exercised here (persist.test.ts owns that). */
class MemStore implements EventStore {
  rows: { seq: number; id: string; record: string; chain: string | null }[] = [];
  readAll() {
    return this.rows.map((r) => ({ seq: r.seq, record: JSON.parse(r.record) as unknown, chain: r.chain }));
  }
  insert(seq: number, id: string, record: string, chain: string) {
    this.rows.push({ seq, id, record, chain });
  }
  setChain(seq: number, chain: string) {
    this.rows.find((r) => r.seq === seq)!.chain = chain;
  }
  transaction<T>(fn: () => T): T {
    return fn();
  }
}

const decision = (id: string, agent = "t") =>
  recordToEvent({
    id,
    type: "decision",
    agent_id: agent,
    schema_version: 1,
    birth_status: "pending_evidence",
    evidence: [],
    targets: [],
    is_trust_root: false,
  });

/** One Stratum log as the DO exposes it: stats() and anchorPoint() over a real chain. */
class FakeLog {
  store = new MemStore();
  constructor(n = 0, agent = "t") {
    this.append(n, agent);
  }
  get p() {
    return new PersistentLog(this.store); // fresh load each call, like a cold DO
  }
  append(n: number, agent = "t") {
    const p = this.p;
    const start = p.log.head + 1;
    for (let i = 0; i < n; i++) p.append(decision(`e-${start + i}`, agent));
  }
  /** Drop the last k rows straight from storage (the tail loss R2 exists to catch). */
  dropTail(k: number) {
    this.store.rows.splice(this.store.rows.length - k, k);
  }
}

interface HubAnchor {
  id: string;
  at: number;
  ledger: string;
  rows: number;
  head: string;
  prev_head: string | null;
  by: string;
}

/**
 * Port of checkmate src/hub.ts handleLedgerAnchor + listLedgerAnchors (f8c7ad4):
 * unchanged first, then `rows <= last.rows` → ledger-regression, then a
 * prevHead mismatch → ledger-fork; every refusal records a critical incident.
 */
class FakeHub {
  anchors: HubAnchor[] = [];
  incidents: { id: string; kind: string }[] = [];
  requests: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
  /** substrings of urls whose fetch rejects, as a timeout would; "$" anchors at the end */
  failing = new Set<string>();
  getStatus = 200;
  getBody: unknown = undefined;
  private n = 0;

  fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const headers = { ...(init.headers as Record<string, string>) };
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    this.requests.push({ method: init.method ?? "GET", url, headers, body });
    for (const f of this.failing) {
      if (f.endsWith("$") ? url.endsWith(f.slice(0, -1)) : url.includes(f)) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }
    const u = new URL(url);
    if (headers["CF-Access-Client-Id"] !== "id-123" || headers["CF-Access-Client-Secret"] !== "s3cr3t-value") {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (init.method === "GET" && u.pathname === "/api/hub/ledger-anchors") {
      if (this.getBody !== undefined) return Response.json(this.getBody, { status: this.getStatus });
      const ledger = u.searchParams.get("ledger") ?? "";
      const rows = this.anchors.filter((a) => a.ledger === ledger).sort((a, b) => a.rows - b.rows || a.at - b.at);
      return Response.json(rows, { status: this.getStatus });
    }
    if (init.method === "POST" && u.pathname === "/api/hub/ledger-anchor") return this.anchor(body);
    return Response.json({ error: "not found" }, { status: 404 });
  };

  /** A foreign writer: any checkmate agent credential can post under any name. */
  foreign(ledger: string, rows: number, head = "e".repeat(64)) {
    this.anchors.push({ id: `lan_${++this.n}`, at: 1, ledger, rows, head, prev_head: null, by: "agent" });
  }

  private anchor(b: { ledger: string; rows: number; head: string; prevHead?: string }): Response {
    const prevHead = b.prevHead ?? null;
    const last = this.anchors
      .filter((a) => a.ledger === b.ledger)
      .sort((x, y) => y.rows - x.rows || y.at - x.at)[0];
    if (last && b.rows === last.rows && b.head === last.head) {
      return Response.json({ ok: true, unchanged: true, rows: b.rows, head: b.head });
    }
    let refusal: string | null = null;
    if (last && b.rows <= last.rows) refusal = "ledger-regression";
    else if (last && prevHead !== last.head) refusal = "ledger-fork";
    if (refusal) {
      const id = `inc_${++this.n}`;
      this.incidents.push({ id, kind: refusal });
      return Response.json(
        { error: refusal, incident: id, anchored: { rows: last!.rows, head: last!.head } },
        { status: 409 },
      );
    }
    const id = `lan_${++this.n}`;
    this.anchors.push({
      id, at: this.n, ledger: b.ledger, rows: b.rows, head: b.head,
      prev_head: last ? prevHead : null, by: "agent",
    });
    return Response.json({ ok: true, id, rows: b.rows, head: b.head });
  }
}

const SECRET = "s3cr3t-value";
const ENV: AnchorEnv = {
  CHECKMATE_URL: "https://checkmate.example.test",
  ANCHOR_LOGS: "demo",
  CHECKMATE_CLIENT_ID: "id-123",
  CHECKMATE_CLIENT_SECRET: SECRET,
};

function rig(logs: Record<string, FakeLog>, env: AnchorEnv = ENV) {
  const hub = new FakeHub();
  const lines: unknown[] = [];
  const doCalls: string[] = [];
  const deps: AnchorDeps = {
    env,
    fetch: hub.fetch,
    stats: async (id) => {
      doCalls.push(`stats:${id}`);
      const p = logs[id]!.p;
      return { events: p.log.head + 1, head_digest: p.headDigest };
    },
    anchorPoint: async (id, rows) => {
      doCalls.push(`anchorPoint:${id}:${rows}`);
      return logs[id]!.p.chainAt(rows);
    },
    log: (l) => lines.push(l),
    timeout: () => new AbortController().signal,
  };
  const tick = async () => (await runAnchors(deps)) as AnchorLine[];
  return { hub, lines, doCalls, deps, tick };
}

const posts = (hub: FakeHub) => hub.requests.filter((r) => r.method === "POST");

// ---- configuration --------------------------------------------------------

describe("anchor config — refused at parse, zero outbound calls", () => {
  test("unset credentials: not-configured, and nothing calls out", async () => {
    for (const env of [
      { ...ENV, CHECKMATE_CLIENT_ID: undefined },
      { ...ENV, CHECKMATE_CLIENT_SECRET: "" },
      {},
    ]) {
      const { hub, lines, doCalls, tick } = rig({ demo: new FakeLog(3) }, env);
      await tick();
      expect(hub.requests).toHaveLength(0);
      expect(doCalls).toHaveLength(0);
      expect(lines).toEqual([{ event: "stratum.anchor", outcome: "not-configured", reason: expect.any(String) }]);
    }
  });

  test("non-https URLs are refused; a bare https origin and loopback http are kept", () => {
    for (const url of [
      "http://checkmate.example.test",
      "ftp://checkmate.example.test",
      "https://user:pw@checkmate.example.test",
      "https://checkmate.example.test/api",
      "https://checkmate.example.test/?x=1",
      "not a url",
      "http://10.0.0.1",
    ]) {
      const r = parseAnchorConfig({ ...ENV, CHECKMATE_URL: url });
      expect(r.ok, url).toBe(false);
      if (!r.ok) expect(r.outcome).toBe("config-refused");
    }
    const ok = parseAnchorConfig({ ...ENV, CHECKMATE_URL: "https://checkmate.example.test/" });
    expect(ok.ok && ok.config.url).toBe("https://checkmate.example.test");
    const local = parseAnchorConfig({ ...ENV, CHECKMATE_URL: "http://127.0.0.1:8788" });
    expect(local.ok && local.config.url).toBe("http://127.0.0.1:8788");
    const dflt = parseAnchorConfig({ ...ENV, CHECKMATE_URL: undefined });
    expect(dflt.ok && dflt.config.url).toBe("https://checkmate.mazzeleczzare.com");
  });

  test("a 57-character id, a playground id, or an invalid id refuses the whole config", async () => {
    const id56 = "a".repeat(56);
    expect(parseAnchorConfig({ ...ENV, ANCHOR_LOGS: `demo,${id56}` }).ok).toBe(true);
    for (const logs of [`demo,${"a".repeat(57)}`, "demo playground-x", "demo,Bad_Id", "-lead"]) {
      const r = parseAnchorConfig({ ...ENV, ANCHOR_LOGS: logs });
      expect(r.ok, logs).toBe(false);
    }
    const { hub, lines, tick } = rig({ demo: new FakeLog(2) }, { ...ENV, ANCHOR_LOGS: "demo,playground-x" });
    await tick();
    expect(hub.requests).toHaveLength(0);
    expect(lines).toEqual([
      { event: "stratum.anchor", outcome: "config-refused", reason: expect.stringContaining("playground") },
    ]);
  });

  test("the allowlist splits on commas and whitespace, dedupes, defaults to demo", () => {
    expect(parseLogList(" demo, workspace\nstele ,demo ")).toEqual(["demo", "workspace", "stele"]);
    expect(parseLogList("")).toEqual([]);
    const r = parseAnchorConfig({ ...ENV, ANCHOR_LOGS: undefined });
    expect(r.ok && r.config.logs).toEqual(["demo"]);
  });
});

// ---- the tick against a faithful hub --------------------------------------

describe("runAnchors — local verdict first, then exactly what Stratum has", () => {
  test("first anchor: no prevHead, Access headers sent, hub records it", async () => {
    const demo = new FakeLog(3);
    const { hub, tick } = rig({ demo });
    const [line] = await tick();
    expect(line).toMatchObject({ log: "demo", ledger: "stratum:demo", local: "first", hub: "anchored", rows: 3 });
    expect(line!.head).toBe(demo.p.headDigest);
    const [post] = posts(hub);
    expect(post!.body).toEqual({ ledger: "stratum:demo", rows: 3, head: demo.p.headDigest });
    expect(post!.headers["CF-Access-Client-Id"]).toBe("id-123");
    expect(hub.requests[0]!.url).toBe(
      "https://checkmate.example.test/api/hub/ledger-anchors?ledger=stratum%3Ademo",
    );
  });

  test("no change: extends locally, unchanged at the hub, no incident", async () => {
    const demo = new FakeLog(3);
    const { hub, tick } = rig({ demo });
    await tick();
    const [line] = await tick();
    expect(line).toMatchObject({ local: "extends", hub: "unchanged" });
    expect(hub.incidents).toHaveLength(0);
  });

  test("an extension sends prevHead = our stored chain at the anchored row", async () => {
    const demo = new FakeLog(3);
    const { hub, tick } = rig({ demo });
    await tick();
    const at3 = demo.p.chainAt(3);
    demo.append(2);
    const [line] = await tick();
    expect(line).toMatchObject({ local: "extends", hub: "anchored", rows: 5, prevHead: at3 });
    expect(posts(hub).at(-1)!.body).toMatchObject({ rows: 5, prevHead: at3 });
    expect(hub.anchors.map((a) => a.rows)).toEqual([3, 5]);
  });

  test("a dropped tail: hub-ahead locally, refused:ledger-regression with its incident id", async () => {
    const demo = new FakeLog(5);
    const { hub, tick } = rig({ demo });
    await tick();
    demo.dropTail(2);
    const [line] = await tick();
    expect(line).toMatchObject({ local: "hub-ahead", hub: "refused:ledger-regression", rows: 3 });
    expect(line!.incident).toBe(hub.incidents[0]!.id);
    expect(line!.hubLast).toMatchObject({ rows: 5, by: "agent" });
    // exactly what Stratum has: no prevHead, because it has no row 5
    expect(posts(hub).at(-1)!.body).not.toHaveProperty("prevHead");
  });

  test("touchstone P1: a same-length rewrite is forked locally even though the hub says regression", async () => {
    const logs = { demo: new FakeLog(4) };
    const { hub, tick } = rig(logs);
    await tick();
    logs.demo = new FakeLog(4, "rewriter"); // recomputed chain, same length
    const [line] = await tick();
    expect(line).toMatchObject({ local: "forked", hub: "refused:ledger-regression", rows: 4 });
    expect(line!.prevHead).toBe(logs.demo.p.chainAt(4));
    expect(hub.incidents.map((i) => i.kind)).toEqual(["ledger-regression"]);
  });

  test("a rewrite followed by new appends: forked locally, refused:ledger-fork", async () => {
    const logs = { demo: new FakeLog(3) };
    const { hub, tick } = rig(logs);
    await tick();
    logs.demo = new FakeLog(6, "rewriter");
    const [line] = await tick();
    expect(line).toMatchObject({ local: "forked", hub: "refused:ledger-fork", rows: 6 });
    expect(hub.anchors).toHaveLength(1); // nothing new accepted
  });

  test("touchstone P2: a foreign anchor far past our head is hub-ahead, naming who wrote it", async () => {
    const demo = new FakeLog(3);
    const { hub, doCalls, tick } = rig({ demo });
    hub.foreign("stratum:demo", 1_000_000_000);
    const [line] = await tick();
    expect(line).toMatchObject({ local: "hub-ahead", hub: "refused:ledger-regression" });
    expect(line!.hubLast).toEqual({ rows: 1_000_000_000, head: "e".repeat(64), by: "agent", at: 1 });
    // judged from one snapshot: no DO call for a row past the head
    expect(doCalls).toEqual(["stats:demo"]);
  });

  test("a never-anchored empty log is skipped after checking the hub", async () => {
    const { hub, lines, tick } = rig({ demo: new FakeLog(0) });
    await tick();
    expect(hub.requests).toHaveLength(1);
    expect(posts(hub)).toHaveLength(0);
    expect(lines).toEqual([expect.objectContaining({ log: "demo", local: "empty", hub: "not-sent" })]);
  });

  test("a fully truncated anchored log is hub-ahead, never silently empty", async () => {
    const demo = new FakeLog(3);
    const { hub, tick } = rig({ demo });
    await tick();
    demo.dropTail(3);
    const [line] = await tick();
    expect(line).toMatchObject({ local: "hub-ahead", hub: "not-sent", rows: 0, hubLast: { rows: 3 } });
    expect(posts(hub)).toHaveLength(1); // first anchor only; rows=0 is invalid at the hub
  });

  test("a timeout is reported as transport and the next log is still anchored", async () => {
    const logs = { demo: new FakeLog(2), workspace: new FakeLog(3) };
    const { hub, tick } = rig(logs, { ...ENV, ANCHOR_LOGS: "demo workspace" });
    hub.failing.add("ledger=stratum%3Ademo");
    const lines = await tick();
    expect(lines[0]).toMatchObject({ log: "demo", local: "unknown", hub: "transport", error: "TimeoutError" });
    expect(lines[1]).toMatchObject({ log: "workspace", local: "first", hub: "anchored" });
    // no retries inside a tick: one attempt at demo's read, nothing more
    expect(hub.requests.filter((r) => r.url.includes("stratum%3Ademo"))).toHaveLength(1);
  });

  test("a timeout on the POST keeps the local verdict it already reached", async () => {
    const demo = new FakeLog(2);
    const { hub, tick } = rig({ demo });
    await tick();
    demo.append(1);
    hub.failing.add("/api/hub/ledger-anchor$");
    const [line] = await tick();
    expect(line).toMatchObject({ local: "extends", hub: "transport" });
  });

  test("touchstone (build): a 200 that is not the hub's JSON is never logged as anchored", async () => {
    for (const reply of [
      () => new Response("<html>sign in</html>", { status: 200 }),
      () => Response.json({ unchanged: true }),
      () => Response.json({ ok: false }),
    ]) {
      const { hub, deps, tick } = rig({ demo: new FakeLog(2) });
      deps.fetch = async (url, init) => (init.method === "POST" ? reply() : hub.fetch(url, init));
      const [line] = await tick();
      expect(line!.hub).toBe("hub-malformed");
    }
  });

  test("touchstone (build): redirects are never followed, so the secret cannot travel with one", async () => {
    const { deps, tick } = rig({ demo: new FakeLog(2) });
    const modes: RequestInit["redirect"][] = [];
    deps.fetch = async (_url, init) => {
      modes.push(init.redirect);
      return new Response(null, { status: 302, headers: { location: "https://elsewhere.test/" } });
    };
    const [line] = await tick();
    expect(modes).toEqual(["manual"]);
    expect(line).toMatchObject({ hub: "hub-error:302" });
  });

  test("an unreadable or malformed hub list means no POST (no honest prevHead)", async () => {
    for (const [status, body, want] of [
      [503, { error: "down" }, "hub-error:503"],
      [200, { not: "a list" }, "hub-malformed"],
      [200, [{ rows: 0, head: "a".repeat(64) }], "hub-malformed"],
      [200, [{ rows: 2, head: "NOTHEX" }], "hub-malformed"],
    ] as const) {
      const { hub, tick } = rig({ demo: new FakeLog(2) });
      hub.getStatus = status;
      hub.getBody = body;
      const [line] = await tick();
      expect(line!.hub).toBe(want);
      expect(posts(hub)).toHaveLength(0);
    }
  });

  test("a log whose chain breaks on load is reported, never anchored", async () => {
    const demo = new FakeLog(3);
    demo.store.rows[1]!.chain = "f".repeat(64);
    const { hub, tick } = rig({ demo });
    const [line] = await tick();
    expect(line).toMatchObject({ local: "load-failed", hub: "not-sent" });
    expect(line!.error).toMatch(/chain break at seq 1/);
    expect(hub.requests).toHaveLength(0);
  });

  test("secrets appear in no logged line, across every outcome above", async () => {
    const logs = { demo: new FakeLog(3), workspace: new FakeLog(2) };
    const { hub, lines, tick } = rig(logs, { ...ENV, ANCHOR_LOGS: "demo,workspace" });
    await tick();
    logs.demo.dropTail(1);
    hub.failing.add("stratum%3Aworkspace");
    await tick();
    const text = JSON.stringify(lines);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("id-123");
    expect(lines.length).toBe(4);
  });
});

describe("lastHubRow", () => {
  test("picks the most rows; the later of equal rows; null for none", () => {
    const h = (c: string) => c.repeat(64);
    expect(lastHubRow([])).toBeNull();
    expect(
      lastHubRow([
        { rows: 2, head: h("a"), by: "agent", at: 1 },
        { rows: 7, head: h("b"), by: "agent", at: 2 },
        { rows: 7, head: h("c"), by: "human", at: 3 },
        { rows: 5, head: h("d") },
      ]),
    ).toEqual({ rows: 7, head: h("c"), by: "human", at: 3 });
    expect(lastHubRow(null)).toBeUndefined();
    expect(lastHubRow([{ rows: 1.5, head: h("a") }])).toBeUndefined();
  });
});
