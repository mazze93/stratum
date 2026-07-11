/**
 * Pure rate-gate policy for playground creation — no Cloudflare imports,
 * so the decision logic is testable in plain vitest. The DO shell in
 * gate.ts owns storage and calls decide().
 */

export const PER_IP_HOURLY = 5;
export const GLOBAL_DAILY = 200;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterSeconds: number };

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
