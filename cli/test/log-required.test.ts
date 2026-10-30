/**
 * There is no default log. Appends are permanent, so a command that touches a
 * log refuses unless one is named (--log, STRATUM_LOG or config) — a silent
 * fallback is how decisions landed in the wrong log (checkmate
 * inc_ztZNYXxw6aR_29Vl, inc_5he7fLwavybF7G8p).
 *
 * The endpoint is a closed local port: a command that got past the guard
 * fails with "cannot reach", so the refusal message proves no request was sent.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test } from "vitest";

const CLI = fileURLToPath(new URL("../bin/stratum.mjs", import.meta.url));
const CLOSED = "http://127.0.0.1:9";
let home = "";

const run = (args: string[], env: Record<string, string> = {}) => {
  const base = { ...process.env };
  delete base["STRATUM_LOG"];
  return spawnSync("node", [CLI, ...args], {
    encoding: "utf8",
    env: { ...base, HOME: home, NO_COLOR: "1", STRATUM_AGENT: "tester", STRATUM_ENDPOINT: CLOSED, ...env },
  });
};
const NO_LOG = /no log named/;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "stratum-home-"));
});

describe("every log command refuses without a named log, before any request", () => {
  const cases: [string, string[]][] = [
    ["decide", ["decide", "x"]],
    ["foreclose", ["foreclose", "x"]],
    ["ratify", ["ratify", "dec-1"]],
    ["dispute", ["dispute", "dec-1"]],
    ["reject", ["reject", "dec-1"]],
    ["contradict", ["contradict", "dec-1"]],
    ["verify --ref", ["verify", "dec-1", "--ref", "checked"]],
    ["status", ["status", "dec-1"]],
    ["tessera", ["tessera"]],
    ["log", ["log"]],
    ["export", ["export"]],
  ];
  for (const [name, args] of cases) {
    test(name, () => {
      const r = run(args);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(NO_LOG);
      expect(r.stderr).not.toMatch(/cannot reach/);
    });
  }
});

test("a bare --log is refused rather than read as a log named 'true'", () => {
  const r = run(["decide", "x", "--log"]);
  expect(r.status).toBe(1);
  expect(r.stderr).toMatch(/--log needs a log id/);
});

describe("a named log is honored from each source (the request then fails on the closed port)", () => {
  test("--log", () => expect(run(["log", "--log", "scratch"]).stderr).toMatch(/cannot reach/));
  test("STRATUM_LOG", () => expect(run(["log"], { STRATUM_LOG: "scratch" }).stderr).toMatch(/cannot reach/));
  test("config log", () => {
    mkdirSync(join(home, ".config", "stratum"), { recursive: true });
    writeFileSync(join(home, ".config", "stratum", "config.json"), JSON.stringify({ log: "scratch" }));
    expect(run(["log"]).stderr).toMatch(/cannot reach/);
  });
});

test("commands that touch no log still work without one", () => {
  const init = run(["init"]);
  expect(init.status).toBe(0);
  expect(init.stdout).toMatch(/log\s+none/);
  expect(run(["help"]).status).toBe(0);
});
