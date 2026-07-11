/**
 * PlaygroundGateDO — abuse guard for unauthenticated playground creation.
 *
 * Each POST /api/playground spins up a fresh seeded Durable Object; without
 * a gate the total count (and storage bill) is bounded only by a caller's
 * patience. One global gate instance counts creations in two time buckets:
 *
 *   per-IP  : PER_IP_HOURLY per rolling hour
 *   global  : GLOBAL_DAILY per UTC day
 *
 * Over either limit → denied with a Retry-After hint. The counters are an
 * abuse bound, not billing-grade accounting — losing one on eviction is
 * fine; what matters is that worst-case DO creation is bounded.
 */

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.js";

const PER_IP_HOURLY = 5;
const GLOBAL_DAILY = 200;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterSeconds: number };

/** Pure decision core — exported for direct testing without a DO harness. */
export function decide(
  ipCount: number,
  globalCount: number,
  nowMs: number,
): GateDecision {
  if (globalCount >= GLOBAL_DAILY) {
    return {
      allowed: false,
      reason: "playground creation is at its daily cap — try again tomorrow",
      retryAfterSeconds: Math.ceil((DAY_MS - (nowMs % DAY_MS)) / 1000),
    };
  }
  if (ipCount >= PER_IP_HOURLY) {
    return {
      allowed: false,
      reason: "too many playgrounds from this address — try again in an hour",
      retryAfterSeconds: Math.ceil((HOUR_MS - (nowMs % HOUR_MS)) / 1000),
    };
  }
  return { allowed: true };
}

export class PlaygroundGateDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS counters (
           bucket  TEXT PRIMARY KEY,
           n       INTEGER NOT NULL,
           expires INTEGER NOT NULL
         )`,
      );
    });
  }

  /** Check-and-increment. Single-threaded in the DO, so no read/write race. */
  check(ip: string): GateDecision {
    const now = Date.now();
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM counters WHERE expires < ?", now);

    const ipKey = `ip:${ip}:${Math.floor(now / HOUR_MS)}`;
    const dayKey = `day:${Math.floor(now / DAY_MS)}`;
    const count = (key: string): number =>
      sql.exec<{ n: number }>("SELECT n FROM counters WHERE bucket = ?", key).toArray()[0]?.n ?? 0;

    const decision = decide(count(ipKey), count(dayKey), now);
    if (!decision.allowed) return decision;

    const bump = (key: string, expires: number) =>
      sql.exec(
        `INSERT INTO counters (bucket, n, expires) VALUES (?, 1, ?)
         ON CONFLICT(bucket) DO UPDATE SET n = n + 1`,
        key,
        expires,
      );
    bump(ipKey, now + HOUR_MS);
    bump(dayKey, now + DAY_MS);
    return decision;
  }
}
