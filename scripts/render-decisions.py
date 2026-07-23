#!/usr/bin/env python3
"""Render docs/DECISIONS.md as a PROJECTION of every recorded trace.

Never hand-edit the output — regenerate it:
  python3 scripts/render-decisions.py > docs/DECISIONS.md

With no arguments, renders every trace in TRACES (in order). Pass explicit
paths to render a subset:
  python3 scripts/render-decisions.py data/stele-trace.jsonl

Two faces per decision, after the decision-telemetry method:
the clean record as projected (status, tier, evidence), and the shadow
trace it buried (oscillation, ghost edges), with its honesty tag and
certainty weight. Da'ath — the mechanism itself — stays empty by design.

Each trace is projected independently. They are separate trust scopes with
their own trust roots, and merging them would fabricate a lineage that does
not exist in any log.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))

from tessera_projection import load_log, project_tessera  # noqa: E402

TIER_MARK = {
    "authoritative_axiomatic": "◆ AXIOMATIC",
    "authoritative_verified": "● VERIFIED",
    "authoritative_provisional": "◐ PROVISIONAL",
    "narrative": "○ narrative",
}

# Ordered. Each entry: (filename, display title, one-line scope description).
TRACES = [
    ("genesis-trace.jsonl", "Genesis",
     "The recorded decisions of this repository's own construction."),
    ("stele-trace.jsonl", "Stele",
     "Cross-project use: STELE decisions routed through Stratum."),
    ("atrium-trace.jsonl", "Public launch",
     "The public landing surface — this session's own decisions, recorded live."),
]


def render_trace(path: Path, title: str, blurb: str, w) -> None:
    """Append one trace's projection to the output via `w`."""
    records = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    by_id = {r["id"]: r for r in records}
    log = load_log(records)          # guards re-run; a corrupt trace fails here
    proj = project_tessera(log)
    decisions = proj["authoritative"]["recent_decisions"]
    foreclosures = proj["authoritative"]["foreclosed_options"]
    verifications = [r for r in records if r["type"] == "verification"]

    w(f"# {title}")
    w("")
    w(f"*{blurb}*")
    w("")
    w(f"> `data/{path.name}` · epoch {proj['epoch']} · {len(records)} events · "
      f"{len(decisions)} decisions · {len(foreclosures)} foreclosures")
    w("")

    w("## Decisions")
    w("")
    if not decisions:
        w("*None recorded.*")
        w("")
    for d in decisions:
        r = by_id[d["id"]]
        w(f"### {d['id']} — {TIER_MARK[d['authority']]} · {d['status']}")
        w("")
        w(f"**{r['agent_id']}** · {r.get('timestamp') or 'no timestamp'}"
          + (" · **trust root**" if r.get("is_trust_root") else ""))
        w("")
        w(str(d.get("narrative") or "(no narrative)"))
        w("")
        if len(d["revision_chain"]) > 1:
            w(f"*Revision chain:* `{' → '.join(d['revision_chain'])}`")
            w("")
        for e in r.get("evidence", []):
            state = f"checked {e['checked_at']}" if e.get("checked_at") else "cited — not checked"
            w(f"- evidence · `{e['kind']}` · {e['ref']} · **{state}**")
        if r.get("evidence"):
            w("")
        shadow = (r.get("claim") or {}).get("shadow")
        if shadow:
            tag = shadow.get("tag", "RECON")
            cert = shadow.get("certainty")
            head = f"Shadow [{tag}" + (f" · certainty {cert}" if cert is not None else "") + "]"
            w(f"> **{head}** — {shadow.get('trace', '')}")
            w("")

    w("## Foreclosures — ghost edges")
    w("")
    if not foreclosures:
        w("*None recorded.*")
        w("")
    for f in foreclosures:
        r = by_id[f["id"]]
        standing = "standing" if f["active"] else "REOPENED / overturned"
        w(f"### {f['id']} — {standing}")
        w("")
        w(str(f.get("narrative") or ""))
        w("")
        shadow = (r.get("claim") or {}).get("shadow")
        if shadow:
            edges = shadow.get("ghost_edges") or []
            if edges:
                w("*Ghost edges:* " + " · ".join(f"~~`{g}`~~" for g in edges))
                w("")
            w(f"> **Shadow [{shadow.get('tag', 'RECON')} · certainty {shadow.get('certainty', '?')}]** "
              f"— {shadow.get('trace', '')}")
            w("")

    w("## Checked-evidence ledger")
    w("")
    rows = [(v, e) for v in verifications for e in v.get("evidence", []) if e.get("checked_at")]
    if not rows:
        w("*No checked evidence yet — every decision above is provisional or axiomatic.*")
        w("")
        return
    w("| verification | target | what was checked | when |")
    w("|---|---|---|---|")
    for v, e in rows:
        w(f"| `{v['id']}` | `{v['targets'][0]}` | {e['ref']} | {e['checked_at']} |")
    w("")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if args:
        selected = []
        for a in args:
            p = Path(a)
            known = next((t for t in TRACES if t[0] == p.name), None)
            selected.append((p, known[1] if known else p.stem, known[2] if known else ""))
    else:
        selected = [(ROOT / "data" / fn, title, blurb) for fn, title, blurb in TRACES]

    out = []
    w = out.append

    w("# Decisions — projected from the traces")
    w("")
    w("> **Do not hand-edit.** Regenerate with "
      "`python3 scripts/render-decisions.py > docs/DECISIONS.md`.")
    w(">")
    w("> Each entry has two faces: the clean record as the projection renders it, "
      "and the *shadow trace* — what the clean record buried, tagged `TRACE` when "
      "sourced from surfaced deliberation or `RECON` when reconstructed, with a "
      "certainty weight. Ghost edges are roads deliberately not taken.")
    w(">")
    w("> Traces are projected **independently**. Each carries its own trust root, "
      "so they are separate trust scopes; a merged projection would imply a shared "
      "lineage that exists in no log.")
    w("")
    for path, title, blurb in selected:
        w("---")
        w("")
        render_trace(path, title, blurb, w)

    w("---")
    w("")
    w("### Da'ath")
    w("")
    w("The mechanism that produced these convergences — whether each was discovery or "
      "retrieval — is not recorded here, because it cannot be. The void stays empty; "
      "anything placed in it would be fabrication of the unknowable.")
    w("")

    print("\n".join(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
