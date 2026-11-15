#!/usr/bin/env node
/**
 * Fail before publishing if npm would normalize away the executable.
 * Strict manifest validation plus a real publish dry-run: npm pack alone
 * does not exercise publish normalization. Never publish or change a tag here.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function validateManifest(pkg) {
  if (pkg.bin?.stratum !== "bin/stratum.mjs") {
    throw new Error('bin.stratum must be exactly "bin/stratum.mjs"; npm publish can remove ./bin paths');
  }
}

export function validatePublishOutput(output) {
  if (/auto.correct|invalid.{0,120}removed|bin\[stratum\].{0,120}invalid/is.test(output)) {
    throw new Error("npm publish normalized the manifest; fix it before release");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL("../cli/", import.meta.url));
  validateManifest(JSON.parse(readFileSync(new URL("../cli/package.json", import.meta.url), "utf8")));
  const result = spawnSync("npm", ["publish", "--dry-run", "--access", "public", "--ignore-scripts"], {
    cwd: dir, encoding: "utf8", env: { ...process.env, npm_config_provenance: "false" },
  });
  const output = (result.stdout || "") + (result.stderr || "");
  process.stdout.write(output);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  validatePublishOutput(output);
}
