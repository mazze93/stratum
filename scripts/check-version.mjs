#!/usr/bin/env node
/**
 * One version, everywhere it is stated. Root package.json is the source;
 * every other statement must equal it, and a release tag must be v<version>.
 * Run in CI on every PR and as the first gate of the release workflow.
 *
 *   node scripts/check-version.mjs            # check the tree
 *   node scripts/check-version.mjs --tag v0.5.0   # also check a tag name
 * Exit: 0 consistent · 1 drift (each mismatch printed)
 */
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const version = JSON.parse(read("package.json")).version;
const problems = [];
// SemVer 2.0.0 core, with optional pre-release and build metadata.
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version)) {
  problems.push(`package.json version "${version}" is not SemVer`);
}

for (const p of ["core/package.json", "worker/package.json", "cli/package.json"]) {
  const v = JSON.parse(read(p)).version;
  if (v !== version) problems.push(`${p} says ${v}`);
}
// The landing masthead names the version it links to.
const landing = read("atrium/public/index.html");
const mast = landing.match(/class="mast-ver"[^>]*>v([0-9][^ <]*)/);
if (!mast) problems.push("atrium/public/index.html: no mast-ver version found");
else if (mast[1] !== version) problems.push(`atrium/public/index.html masthead says v${mast[1]}`);
// The changelog must carry an entry for this version. A literal prefix match,
// not a regex built from the version string.
const heading = `## [${version}]`;
if (!read("CHANGELOG.md").split("\n").some((line) => line.startsWith(heading))) {
  problems.push(`CHANGELOG.md has no "## [${version}]" entry`);
}
const i = process.argv.indexOf("--tag");
const tag = i > 0 ? process.argv[i + 1] : process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : null;
if (tag && tag !== `v${version}`) problems.push(`tag ${tag} is not v${version}`);

if (problems.length) {
  console.error(`✗ version drift (package.json says ${version}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`✓ version ${version} is consistent${tag ? ` with tag ${tag}` : ""}`);
