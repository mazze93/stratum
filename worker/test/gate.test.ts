import { expect, test } from "vitest";
import { decide } from "../src/gate-policy.js";

const NOW = 1_700_000_000_000;

test("allows under both limits", () => {
  expect(decide(0, 0, NOW)).toEqual({ allowed: true });
  expect(decide(4, 199, NOW).allowed).toBe(true);
});

test("denies at the per-IP hourly limit with an hour-scale retry hint", () => {
  const d = decide(5, 10, NOW);
  expect(d.allowed).toBe(false);
  if (!d.allowed) {
    expect(d.retryAfterSeconds).toBeGreaterThan(0);
    expect(d.retryAfterSeconds).toBeLessThanOrEqual(3600);
  }
});

test("denies at the global daily limit even for a fresh IP", () => {
  const d = decide(0, 200, NOW);
  expect(d.allowed).toBe(false);
  if (!d.allowed) {
    expect(d.reason).toContain("daily");
    expect(d.retryAfterSeconds).toBeLessThanOrEqual(86_400);
  }
});

test("global cap wins over per-IP cap in the reported reason", () => {
  const d = decide(5, 200, NOW);
  expect(d.allowed).toBe(false);
  if (!d.allowed) expect(d.reason).toContain("daily");
});
