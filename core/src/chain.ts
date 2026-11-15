/**
 * Hash chain over persisted records — ADR-003 §8, tp-009 (after claude-stamp).
 *
 *   link(prev, record) = sha256_hex( utf8(prev) ‖ JCS(record) ),  genesis = "0"×64
 *
 * The chain lives in the storage layer, not in the event: records stay
 * seq-free, v1 traces need no rewrite, and the head digest is one content
 * address for a whole log at its head. Guards catch an incoherent log on
 * load; the chain catches a coherent one that was edited, reordered, or had
 * rows removed from the middle. A dropped TAIL is undetectable locally (a
 * prefix is a valid chain) — only an anchored head digest catches it.
 * Reference twin: reference/canonical.py `chain_digest`.
 */

import { canonicalize } from "./canonical.js";
import { sha256Hex } from "./sha256.js";

export const GENESIS_DIGEST = "0".repeat(64);

export const chainLink = (prev: string, record: unknown): string =>
  sha256Hex(prev + canonicalize(record));

/** The head digest of a record sequence (GENESIS_DIGEST when empty). */
export function chainDigest(records: readonly unknown[]): string {
  let prev = GENESIS_DIGEST;
  for (const r of records) prev = chainLink(prev, r);
  return prev;
}

/**
 * How a log relates to an anchor someone holds for it (R2, ADR-004).
 *
 *   extends    rows <= len and the first `rows` records chain to `head`
 *   truncated  rows > len: the anchor is ahead of this log (a dropped tail,
 *              or a longer anchor someone else wrote under the same name)
 *   forked     the prefix of that length chains to a different head
 *
 * The checkmate hub is not an extension proof (its own words), so Stratum
 * carries one. Run it over NORMALIZED wire records (serializeLog, what
 * GET /events returns), never over raw trace lines: a file can carry fields
 * the stored chain does not hash. Reference twin: canonical.py `anchor_verdict`.
 */
export type AnchorVerdict = "extends" | "truncated" | "forked";

export function anchorVerdict(
  records: readonly unknown[],
  anchor: { readonly rows: number; readonly head: string },
): AnchorVerdict {
  if (!Number.isSafeInteger(anchor.rows) || anchor.rows < 0) {
    throw new RangeError(`anchor rows must be a non-negative integer, got ${String(anchor.rows)}`);
  }
  if (anchor.rows > records.length) return "truncated";
  return chainDigest(records.slice(0, anchor.rows)) === anchor.head ? "extends" : "forked";
}
