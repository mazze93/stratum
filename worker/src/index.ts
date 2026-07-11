/**
 * Stratum API — thin Hono adapter over the Durable Object gate.
 * The DO owns correctness; this layer owns HTTP, auth, and routing.
 *
 * Error mapping mirrors the contract: parse failures → 400,
 * guard violations → 409 (the wire refuses what the log refuses).
 */

import { Hono } from "hono";
import { bearerOk, canRead, canWrite, isValidLogId } from "./auth.js";
import type { Env } from "./env.js";
import type { AppendResult, SeedResult } from "./do.js";

export { StratumLogDO } from "./do.js";
export { PlaygroundGateDO } from "./gate.js";

const app = new Hono<{ Bindings: Env }>();

const stub = (env: Env, logId: string) =>
  env.STRATUM_LOG.get(env.STRATUM_LOG.idFromName(logId));

const failStatus = (r: Extract<AppendResult | SeedResult, { ok: false }>): 400 | 409 | 413 =>
  r.kind === "parse" ? 400 : r.kind === "cap" ? 413 : 409;

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "stratum", version: "0.3.0" }),
);

/** Create a per-visitor sandbox log, cloned from the curated demo seed. */
app.post("/api/playground", async (c) => {
  const logId = `playground-${crypto.randomUUID().slice(0, 8)}`;
  const seedRecords = await stub(c.env, "demo").exportEvents();
  const result = await stub(c.env, logId).seedIfEmpty(seedRecords);
  if (!result.ok) return c.json({ error: result.message }, failStatus(result));
  return c.json({ log: logId, events: result.events }, 201);
});

app.use("/api/logs/:logId/*", async (c, next) => {
  const logId = c.req.param("logId");
  if (!isValidLogId(logId)) return c.json({ error: "invalid log id" }, 400);
  const authed = await bearerOk(c.req.raw, c.env.STRATUM_TOKEN);
  const writing = c.req.method !== "GET";
  const allowed = writing ? canWrite(logId, authed) : canRead(logId, authed);
  if (!allowed) return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.get("/api/logs/:logId/projection", async (c) => {
  const epochRaw = c.req.query("epoch");
  let epoch: number | undefined;
  if (epochRaw !== undefined) {
    epoch = Number(epochRaw);
    if (!Number.isInteger(epoch) || epoch < -1) {
      return c.json({ error: "epoch must be an integer >= -1" }, 400);
    }
  }
  return c.json(await stub(c.env, c.req.param("logId")).projection(epoch));
});

app.get("/api/logs/:logId/events", async (c) =>
  c.json(await stub(c.env, c.req.param("logId")).exportEvents()),
);

app.get("/api/logs/:logId/events/:eventId", async (c) => {
  const detail = await stub(c.env, c.req.param("logId")).eventDetail(
    c.req.param("eventId"),
  );
  if (detail === null) return c.json({ error: "unknown event" }, 404);
  return c.json(detail);
});

app.post("/api/logs/:logId/events", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "body must be a JSON event record" }, 400);
  }
  const result = await stub(c.env, c.req.param("logId")).appendEvent(body);
  if (!result.ok) return c.json({ error: result.message }, failStatus(result));
  return c.json(result, 201);
});

/** Seed an empty log wholesale (idempotent; refuses non-empty). Authed always. */
app.post("/api/logs/:logId/seed", async (c) => {
  const authed = await bearerOk(c.req.raw, c.env.STRATUM_TOKEN);
  if (!authed) return c.json({ error: "unauthorized" }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "body must be a JSON array of event records" }, 400);
  }
  if (!Array.isArray(body)) {
    return c.json({ error: "body must be a JSON array of event records" }, 400);
  }
  const result = await stub(c.env, c.req.param("logId")).seedIfEmpty(body);
  if (!result.ok) return c.json({ error: result.message }, failStatus(result));
  return c.json(result, result.seeded ? 201 : 200);
});

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json({ error: "not found" }, 404);
  }
  // Non-API paths fall through to static assets via wrangler's assets config;
  // reaching here means the asset also missed.
  return c.text("not found", 404);
});

export default app;
