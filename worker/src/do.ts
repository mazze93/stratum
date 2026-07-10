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
  EpisodicLog,
  ParseError,
  Status,
  authorityOf,
  eventToRecord,
  loadLog,
  projectTessera,
  recordToEvent,
  revisionChain,
  serializeLog,
  type EventRecord,
  type Tessera,
} from "@stratum/core";
import type { Env } from "./env.js";

/** Per-log event cap — a cheap abuse guard, generous for real use. */
const MAX_EVENTS = 5000;

export type AppendResult =
  | { ok: true; event: EventRecord; seq: number; head: number }
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
  private log: EpisodicLog | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS events (
           seq    INTEGER PRIMARY KEY,
           id     TEXT NOT NULL UNIQUE,
           record TEXT NOT NULL
         )`,
      );
    });
  }

  private ensureLog(): EpisodicLog {
    if (this.log === null) {
      const rows = this.ctx.storage.sql
        .exec<{ record: string }>("SELECT record FROM events ORDER BY seq")
        .toArray();
      this.log = loadLog(rows.map((r) => JSON.parse(r.record) as unknown));
    }
    return this.log;
  }

  appendEvent(raw: unknown): AppendResult {
    const log = this.ensureLog();
    if (log.head + 1 >= MAX_EVENTS) {
      return { ok: false, kind: "cap", message: `log is at its ${MAX_EVENTS}-event cap` };
    }
    try {
      const sequenced = log.append(recordToEvent(raw));
      const record = eventToRecord(sequenced);
      this.ctx.storage.sql.exec(
        "INSERT INTO events (seq, id, record) VALUES (?, ?, ?)",
        sequenced.seq,
        sequenced.id,
        JSON.stringify(record),
      );
      return { ok: true, event: record, seq: sequenced.seq, head: log.head };
    } catch (e) {
      // The in-memory log is untouched on guard failure (append throws before push).
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
    let seeded: EpisodicLog;
    try {
      seeded = loadLog(records); // every guard runs; a bad seed rejects atomically
    } catch (e) {
      if (e instanceof ParseError) return { ok: false, kind: "parse", message: e.message };
      if (e instanceof ContractViolation) {
        return { ok: false, kind: "violation", message: e.message };
      }
      throw e;
    }
    for (const record of serializeLog(seeded)) {
      this.ctx.storage.sql.exec(
        "INSERT INTO events (seq, id, record) VALUES (?, ?, ?)",
        seeded.get(record.id).seq,
        record.id,
        JSON.stringify(record),
      );
    }
    this.log = seeded;
    return { ok: true, seeded: true, events: seeded.head + 1 };
  }

  stats(): { events: number; head: number } {
    const log = this.ensureLog();
    return { events: log.head + 1, head: log.head };
  }
}
