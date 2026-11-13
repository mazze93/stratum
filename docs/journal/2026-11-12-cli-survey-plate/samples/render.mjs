// Regenerates the phase-3 review samples: node docs/journal/2026-11-12-cli-survey-plate/samples/render.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { titleCard, computeNext, nextPanel, nextLine, helpOverview, helpTopic, badge, TIERS } from "../../../../cli/lib/survey.mjs";
const here = new URL(".", import.meta.url);
const proj = JSON.parse(readFileSync(new URL("../../../../data/genesis-projection.golden.json", import.meta.url), "utf8"));
const d = proj.authoritative.recent_decisions;
d[d.length - 3] = { ...d[d.length - 3], status: "pending_evidence", authority: "authoritative_provisional" };
d[d.length - 6] = { ...d[d.length - 6], status: "pending_evidence", authority: "authoritative_provisional" };
const modes = {
  color: { color: "truecolor", plain: false, unicode: true, width: 80 },
  plain: { color: "none", plain: true, unicode: true, width: 80 },
  ascii: { color: "256", plain: false, unicode: false, width: 64 },
};
for (const [name, caps] of Object.entries(modes)) {
  const home = [titleCard(caps, { log: "genesis", epoch: proj.epoch, version: "0.5.0", projection: proj }), "",
    nextPanel(caps, computeNext({ log: "genesis", token: true, outboxPending: 0, projection: proj })), ""].join("\n");
  const write = ["✓ dec-mhx2k-a1f0 recorded · awaiting evidence (seq 42)", nextLine(caps, 'stratum verify dec-mhx2k-a1f0 --run "<check>"', "bind the check once it lands")].join("\n");
  const badges = Object.keys(TIERS).map((k) => "  " + badge(caps, k)).join("\n");
  const ext = name === "plain" ? "txt" : "ans";
  writeFileSync(new URL(`home.${name}.${ext}`, here), home + "\n");
  writeFileSync(new URL(`after-write.${name}.${ext}`, here), write + "\n");
  writeFileSync(new URL(`badges.${name}.${ext}`, here), badges + "\n");
  writeFileSync(new URL(`help.${name}.${ext}`, here), helpOverview(caps) + "\n\n" + helpTopic(caps, "verify") + "\n");
}
// first-run state: nothing configured
writeFileSync(new URL("home.first-run.ans", here), [titleCard(modes.color, { log: null, version: "0.5.0" }), "", nextPanel(modes.color, computeNext({ log: null }))].join("\n") + "\n");
