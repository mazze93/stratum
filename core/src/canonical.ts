/**
 * Canonical bytes — RFC 8785 (JSON Canonicalization Scheme). ADR-003 §5.
 *
 * One byte form both implementations produce identically, so hashes and
 * signatures computed in TypeScript and in the Python oracle agree. The
 * reference twin is reference/canonical.py; core/test/canonical.test.ts pins
 * both against data/canonical.golden.json.
 *
 * Refused rather than guessed (fail-closed): non-finite numbers, integers
 * outside the IEEE-754 safe range, lone surrogates, and non-JSON values.
 */

import { ContractViolation } from "./contract.js";

function str(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) throw new ContractViolation("canonical: lone surrogate");
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new ContractViolation("canonical: lone surrogate");
    }
  }
  // JSON.stringify on a well-formed string is exactly RFC 8785 §3.2.2.2.
  return JSON.stringify(s);
}

function num(n: number): string {
  if (!Number.isFinite(n)) throw new ContractViolation("canonical: non-finite number");
  if (Number.isInteger(n) && !Number.isSafeInteger(n)) {
    throw new ContractViolation("canonical: integer outside the safe range");
  }
  // ES Number::toString is RFC 8785 §3.2.2.3; -0 serializes as 0.
  return Object.is(n, -0) ? "0" : String(n);
}

/** Compare keys by UTF-16 code units (RFC 8785 §3.2.3). */
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return num(value);
    case "string":
      return str(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort(byCodeUnits);
      return `{${keys.map((k) => `${str(k)}:${canonicalize(obj[k])}`).join(",")}}`;
    }
    default:
      throw new ContractViolation(`canonical: ${typeof value} is not a JSON value`);
  }
}

export const canonicalBytes = (value: unknown): Uint8Array =>
  new TextEncoder().encode(canonicalize(value));
