import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
// The CLI ships JavaScript without declarations, like ingress.mjs.
// @ts-expect-error release utility is a zero-dependency JS module
import { validateManifest, validatePublishOutput } from "../../scripts/check-package.mjs";

test("reject the old bin entry that publish removes", () => {
  expect(() => validateManifest({ bin: { stratum: "./bin/stratum.mjs" } })).toThrow();
  expect(() => validateManifest({ bin: { stratum: "bin/stratum.mjs" } })).not.toThrow();
});

test("npm success cannot hide manifest normalization warnings", () => {
  expect(() => validatePublishOutput('npm warn "bin[stratum]" script name was invalid and removed')).toThrow();
  expect(() => validatePublishOutput("npm warn auto-corrected some errors")).toThrow();
  expect(() => validatePublishOutput("npm notice package contents")).not.toThrow();
});

test("the checkout CLI is executable through its shebang", () => {
  const cli = fileURLToPath(new URL("../bin/stratum.mjs", import.meta.url));
  expect(execFileSync(cli, ["--version"], { encoding: "utf8" }).trim()).toMatch(/^\d+\.\d+\.\d+$/);
});
