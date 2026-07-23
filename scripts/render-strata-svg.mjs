#!/usr/bin/env node
/**
 * Bake the static strata figure into the landing page.
 *
 * Reads a projection JSON on stdin, draws the section with the SAME module
 * the browser uses (atrium/public/strata-draw.js), and splices it between
 * the GENERATED STRATA markers in atrium/public/index.html.
 *
 * Usage:
 *   python3 scripts/validate-trace.py data/genesis-trace.jsonl --json \
 *     | node scripts/render-strata-svg.mjs
 *
 * Deterministic: same projection in, byte-identical figure out.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { drawStrata } = await import(join(ROOT, "atrium/public/strata-draw.js"));

const projection = JSON.parse(readFileSync(0, "utf8"));
const svg = drawStrata(projection);

const page = join(ROOT, "atrium/public/index.html");
const html = readFileSync(page, "utf8");
const BEGIN = "<!-- BEGIN GENERATED STRATA (scripts/render-strata-svg.mjs) — do not hand-edit -->";
const END = "<!-- END GENERATED STRATA -->";
const start = html.indexOf(BEGIN);
const end = html.indexOf(END);
if (start === -1 || end === -1) {
  console.error("render-strata-svg: markers not found in atrium/public/index.html");
  process.exit(1);
}
const next = html.slice(0, start + BEGIN.length) + "\n" + svg + "\n" + html.slice(end);
writeFileSync(page, next);
console.error(`render-strata-svg: baked figure at epoch ${projection.epoch} (${svg.length} bytes) into index.html`);
