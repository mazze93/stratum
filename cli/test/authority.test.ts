/**
 * Exercise the real CLI against a recorder. Refusal must send zero requests:
 * a reassuring message is insufficient when an authority event can persist.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";

const cli = fileURLToPath(new URL("../bin/stratum.mjs", import.meta.url));
const requests: string[] = [];
const server = createServer((req, res) => {
  requests.push(req.url || "");
  req.resume();
  res.writeHead(201, { "content-type": "application/json" });
  res.end('{"ok":true}');
});
let endpoint = "";
beforeAll(async () => {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no recorder address");
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((done, reject) => server.close((e) => e ? reject(e) : done())); });

async function run(args: string[], agent?: string) {
  const env = { ...process.env };
  delete env["STRATUM_AGENT"];
  delete env["STRATUM_TOKEN"];
  const child = spawn("node", [cli, ...args], {
    env: { ...env, HOME: mkdtempSync(join(tmpdir(), "stratum-authority-")),
      STRATUM_ENDPOINT: endpoint, STRATUM_LOG: "review", NO_COLOR: "1",
      ...(agent === undefined ? {} : { STRATUM_AGENT: agent }) },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", (b) => { stdout += String(b); });
  child.stderr.on("data", (b) => { stderr += String(b); });
  child.stdin.end();
  const status = await new Promise<number | null>((done, reject) => {
    child.on("error", reject); child.on("close", done);
  });
  return { status, stdout, stderr };
}

test("writes cannot silently impersonate mazze", async () => {
  const before = requests.length;
  for (const args of [["decide", "x"], ["ratify", "dec-x"], ["verify", "dec-x", "--ref", "x"]]) {
    const r = await run(args);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no agent named");
  }
  expect(requests).toHaveLength(before);
});

test("an explicit agent cannot ratify through a noninteractive shell", async () => {
  const before = requests.length;
  const r = await run(["ratify", "dec-x"], "codex-probe");
  expect(r.status).toBe(4);
  expect(r.stderr).toContain("ratification needs a human");
  expect(requests).toHaveLength(before);
});

test("explicit write identity is preserved in a dry-run verification", async () => {
  const r = await run(["verify", "dec-x", "--ref", "legacy", "--dry-run"], "codex-probe");
  expect(r.status, r.stderr).toBe(0);
  expect(JSON.parse(r.stdout).agent_id).toBe("codex-probe");
});

test("read and help commands need no write identity", async () => {
  expect((await run(["help"])).status).toBe(0);
});
