/**
 * Legible fail-closed load errors. A stored log that fails the contract on
 * load (a guard, a parse, or a chain break) must refuse to serve — but it
 * should say WHY, not return a bare "Internal Server Error" that takes a
 * production tail to diagnose (2026-10-07 incident, tp-021).
 *
 * The DO prefixes load failures with LOAD_FAILURE; the Worker's onError maps
 * that prefix to a JSON 500 carrying the contract's own message, and anything
 * else to a generic 500 so unexpected internals never leak.
 */

export const LOAD_FAILURE = "stored log fails the contract on load: ";

export function loadFailure(e: unknown): Error {
  return new Error(LOAD_FAILURE + (e instanceof Error ? e.message : String(e)));
}

export function errorBody(e: unknown): { error: string; kind: "load_failure" | "internal" } {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.startsWith(LOAD_FAILURE)
    ? { error: msg, kind: "load_failure" }
    : { error: "internal error", kind: "internal" };
}
