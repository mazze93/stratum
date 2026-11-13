#!/usr/bin/env node
/**
 * Bake the static strata figure into the landing page.
 *
 * Reads a projection JSON on stdin, draws the section with the SAME module
 * the browser uses (atrium/public/strata-draw.js), and splices it between
 * the GENERATED STRATA markers in atrium/public/index.html.
 *
 * Also bakes the underlying event records as inline JSON, so the audit panel
 * works with no network and no JS beyond the page's own module — the record
 * behind a layer is part of the plate, not an enhancement.
 *
 * Usage:
 *   python3 scripts/validate-trace.py data/genesis-trace.jsonl --json \
 *     | node scripts/render-strata-svg.mjs data/genesis-trace.jsonl
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

const tracePath = process.argv[2] ?? "data/genesis-trace.jsonl";
const records = readFileSync(join(ROOT, tracePath), "utf8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
/* Per-epoch projection frames, computed by the Python oracle (see
   scripts/render-epoch-frames.py) and piped in as argv[3] or a sibling file.
   The scrubber steps through real projections, not a browser reimplementation
   of the fold — so "deterministic replay" on the page is literally true. */
const framesPath = process.argv[3];
const frames = framesPath ? readFileSync(join(ROOT, framesPath), "utf8").trim() : "[]";

const dataBlock =
  `<script type="application/json" id="strata-records">` +
  JSON.stringify(records).replace(/</g, "\\u003c") +
  `</script>\n` +
  `<script type="application/json" id="strata-frames">` +
  frames.replace(/</g, "\\u003c") +
  `</script>`;

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
const next = html.slice(0, start + BEGIN.length) + "\n" + svg + "\n" + dataBlock + "\n" + html.slice(end);
writeFileSync(page, next);
console.error(
  `render-strata-svg: baked figure at epoch ${projection.epoch} (${svg.length} bytes) ` +
    `+ ${records.length} records (${dataBlock.length} bytes) into index.html`
);
