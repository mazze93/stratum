/**
 * StratumLogDO — one Durable Object per log. The single-writer gate:
 * appends serialize in this object's single-threaded scope, and every
 * contract guard runs here, at one door, before anything persists
 * (ADR-002's single-synchronous-gate principle as infrastructure).
 *
 * Storage model: the append-only event stream, one row per event, the full
 * wire record as JSON. The in-memory EpisodicLog is a cache rebuilt via
 * loadLog — which re-runs every guard, so a corrupt store fails on load,
 * never silently in projection.
 */

import { DurableObject } from "cloudflare:workers";
import {
  ContractViolation,
  ParseError,
  Status,
  authorityOf,
  eventToRecord,
  projectTessera,
  recordToEvent,
  revisionChain,
  serializeLog,
  type EpisodicLog,
  type EventRecord,
  type Tessera,
} from "@stratum/core";
import type { Env } from "./env.js";
import { PersistentLog } from "./persist.js";

/** Per-log event cap — a cheap abuse guard, generous for real use. */
const MAX_EVENTS = 5000;

export type AppendResult =
  | { ok: true; event: EventRecord; seq: number; head: number; head_digest: string }
  | { ok: false; kind: "parse" | "violation" | "cap"; message: string };

export type SeedResult =
  | { ok: true; seeded: boolean; events: number }
  | { ok: false; kind: "parse" | "violation" | "cap"; message: string };

export interface EventDetail {
  record: EventRecord;
  status: Status;
  authority: string;
  under_review: boolean;
  evidence_refs: string[];
  revision_chain: string[];
}

export class StratumLogDO extends DurableObject<Env> {
  private readonly store: PersistentLog;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS events (
           seq    INTEGER PRIMARY KEY,
           id     TEXT NOT NULL UNIQUE,
           record TEXT NOT NULL,
           chain  TEXT
         )`,
      );
    });
    const sql = ctx.storage.sql;
    this.store = new PersistentLog({
      readAll: () =>
        sql
          .exec<{ seq: number; record: string; chain: string | null }>(
            "SELECT seq, record, chain FROM events ORDER BY seq",
          )
          .toArray()
          .map((r) => ({ seq: r.seq, record: JSON.parse(r.record) as unknown, chain: r.chain })),
      insert: (seq, id, record, chain) => {
        sql.exec(
          "INSERT INTO events (seq, id, record, chain) VALUES (?, ?, ?, ?)",
          seq,
          id,
          record,
          chain,
        );
      },
      setChain: (seq, chain) => {
        sql.exec("UPDATE events SET chain = ? WHERE seq = ?", chain, seq);
      },
      // Rolls back on throw (SQLite-backed DO API). Implicit write coalescing
      // alone would still commit rows written before a caught exception.
      transaction: (fn) => ctx.storage.transactionSync(fn),
    });
    ctx.blockConcurrencyWhile(async () => {
      // Pre-chain table (tp-009): add the column and chain every row in ONE
      // transaction. The missing column is the only thing that authorizes
      // chaining; afterwards an unchained row is a break (touchstone P2).
      const cols = sql.exec<{ name: string }>("PRAGMA table_info(events)").toArray();
      if (!cols.some((c) => c.name === "chain")) {
        ctx.storage.transactionSync(() => {
          sql.exec("ALTER TABLE events ADD COLUMN chain TEXT");
          this.store.migrateLegacy();
        });
      }
    });
  }

  private ensureLog(): EpisodicLog {
    return this.store.log;
  }

  appendEvent(raw: unknown): AppendResult {
    const log = this.ensureLog();
    if (log.head + 1 >= MAX_EVENTS) {
      return { ok: false, kind: "cap", message: `log is at its ${MAX_EVENTS}-event cap` };
    }
    try {
      const { event, chain } = this.store.append(recordToEvent(raw));
      return {
        ok: true,
        event: eventToRecord(event),
        seq: event.seq,
        head: event.seq,
        head_digest: chain,
      };
    } catch (e) {
      // Guard failure: memory untouched (append throws before push). Storage
      // failure: rolled back, cache dropped, rethrown — see persist.ts.
      if (e instanceof ParseError) return { ok: false, kind: "parse", message: e.message };
      if (e instanceof ContractViolation) {
        return { ok: false, kind: "violation", message: e.message };
      }
      throw e;
    }
  }

  projection(epoch?: number): Tessera {
    return projectTessera(this.ensureLog(), epoch);
  }

  exportEvents(): EventRecord[] {
    return serializeLog(this.ensureLog());
  }

  eventDetail(eventId: string): EventDetail | null {
    const log = this.ensureLog();
    if (!log.has(eventId)) return null;
    const ev = log.get(eventId);
    return {
      record: eventToRecord(ev),
      status: log.statusAt(eventId, log.head),
      authority: authorityOf(log, eventId, log.head),
      under_review: log.underReview(eventId, log.head),
      evidence_refs: [...log.evidenceRefsOf(eventId, log.head)].sort(),
      revision_chain: revisionChain(log, ev),
    };
  }

  /** Seed an EMPTY log from a full record array (validated as a whole). */
  seedIfEmpty(records: unknown[]): SeedResult {
    const existing = this.ensureLog();
    if (existing.head >= 0) return { ok: true, seeded: false, events: existing.head + 1 };
    if (records.length >= MAX_EVENTS) {
      return { ok: false, kind: "cap", message: `seed exceeds ${MAX_EVENTS}-event cap` };
    }
    try {
      // every guard runs first; then all rows commit in one transaction, or none
      this.store.seedIfEmpty(records);
    } catch (e) {
      if (e instanceof ParseError) return { ok: false, kind: "parse", message: e.message };
      if (e instanceof ContractViolation) {
        return { ok: false, kind: "violation", message: e.message };
      }
      throw e;
    }
    return { ok: true, seeded: true, events: this.store.log.head + 1 };
  }

  /** The log's content address at its head (tp-009) — what anchors and evidence cite. */
  stats(): { events: number; head: number; head_digest: string } {
    const log = this.ensureLog();
    return { events: log.head + 1, head: log.head, head_digest: this.store.headDigest };
  }
}
