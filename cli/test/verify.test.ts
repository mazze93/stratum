/**
 * `stratum verify --run` — the CLI's default path produces v2 bound evidence
 * the contract accepts, and refuses to bind anything it can't pin honestly.
 * Runs the real CLI (--dry-run, no server) in a scratch git repo.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test } from "vitest";
import { loadLog, Status } from "@stratum/core";

const CLI = fileURLToPath(new URL("../bin/stratum.mjs", import.meta.url));
const TOKEN = "ghp_SECRETSECRETSECRET";
let repo = "";
let home = "";

const sh = (cmd: string[], cwd = repo) => {
  const r = spawnSync(cmd[0]!, cmd.slice(1), { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const stratum = (...args: string[]) =>
  spawnSync("node", [CLI, ...args], {
    cwd: repo, encoding: "utf8",
    env: { ...process.env, HOME: home, NO_COLOR: "1", STRATUM_AGENT: "tester" },
  });

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "stratum-home-"));
  repo = mkdtempSync(join(tmpdir(), "stratum-repo-"));
  sh(["git", "init", "-q"]);
  sh(["git", "config", "user.email", "t@example.invalid"]);
  sh(["git", "config", "user.name", "t"]);
  sh(["git", "config", "commit.gpgsign", "false"]);
  // An https remote with an embedded token — must never reach the ledger.
  sh(["git", "remote", "add", "origin", `https://mazze93:${TOKEN}@github.com/mazze93/demo.git`]);
  writeFileSync(join(repo, "input.txt"), "fixture input\n");
  writeFileSync(join(repo, ".gitignore"), "report.json\n");
  sh(["git", "add", "."]);
  sh(["git", "commit", "-q", "-m", "init"]);
});

describe("stratum verify --run (ADR-003 §3)", () => {
  test("binds command, commit, exit, inputs, and output; the contract accepts it", () => {
    const r = stratum("verify", "d-1", "--run", "echo '{\"ok\":true}' > report.json",
                      "--input", "fixture=input.txt", "--output", "report.json", "--dry-run");
    expect(r.status, r.stderr).toBe(0);
    const rec = JSON.parse(r.stdout);
    const b = rec.evidence[0].binding;
    expect(rec.schema_version).toBe(2);
    expect(b.commit).toBe(sh(["git", "rev-parse", "HEAD"]));
    expect(b.repo).toBe("github.com/mazze93/demo");
    expect(b.expect_exit).toBe(0);
    expect(b.inputs).toEqual([{ id: "fixture", sha256: createHash("sha256").update("fixture input\n").digest("hex") }]);
    expect(b.output_sha256).toBe(createHash("sha256").update('{"ok":true}\n').digest("hex"));

    const log = loadLog([
      { id: "d-1", type: "decision", agent_id: "t", schema_version: 2, birth_status: "pending_evidence",
        claim: {}, evidence: [], targets: [], is_trust_root: false, timestamp: null },
      rec,
    ]);
    expect(log.statusAt("d-1", log.head)).toBe(Status.Validated);
  });

  test("never writes remote userinfo (an embedded token) into the record", () => {
    const r = stratum("verify", "d-1", "--run", "true", "--dry-run");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain(TOKEN);
    expect(r.stdout).not.toContain("mazze93:");
  });

  test("refuses a dirty tree — the tested tree must be the pinned commit", () => {
    writeFileSync(join(repo, "input.txt"), "edited, uncommitted\n");
    const r = stratum("verify", "d-1", "--run", "true", "--dry-run");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("dirty");
    expect(r.stdout).toBe("");
  });

  test("records nothing when the check fails", () => {
    const r = stratum("verify", "d-1", "--run", "exit 3", "--dry-run");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("exit 3, expected 0");
    expect(r.stdout).toBe("");
  });

  test("an expected non-zero exit can be bound explicitly", () => {
    const r = stratum("verify", "d-1", "--run", "exit 3", "--expect-exit", "3", "--dry-run");
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).evidence[0].binding.expect_exit).toBe(3);
  });

  test("legacy --ref still works but warns that it is unbound", () => {
    const r = stratum("verify", "d-1", "--ref", "eyeballed it", "--dry-run");
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("UNBOUND");
    expect(JSON.parse(r.stdout).schema_version).toBe(1);
  });
});
