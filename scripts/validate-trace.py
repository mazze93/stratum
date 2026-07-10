#!/usr/bin/env python3
"""Validate a Stratum event trace against the reference implementation.

Loads a JSONL trace through load_log (which re-runs every contract guard) and
projects the Tessera. A trace that violates the contract fails HERE, loudly —
this is the empirical check MEMORY_MODEL §8 calls for: if real workflow events
need something the ontology cannot record, this script is where it surfaces.

Usage:
  python3 scripts/validate-trace.py [trace.jsonl] [--json]

  --json  emit the full projection (stable keys) for golden-file comparison
          against the TypeScript port.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))

from tessera_projection import (  # noqa: E402
    authoritative_fingerprint,
    load_log,
    project_tessera,
)


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    as_json = "--json" in sys.argv
    path = Path(args[0]) if args else ROOT / "data" / "genesis-trace.jsonl"

    records = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    log = load_log(records)  # guards re-run; corrupt trace fails on load
    proj = project_tessera(log)

    if as_json:
        print(json.dumps(proj, indent=2, sort_keys=True))
        return 0

    fp = authoritative_fingerprint(proj)
    decisions = proj["authoritative"]["recent_decisions"]
    forecl = proj["authoritative"]["foreclosed_options"]
    tiers: dict[str, int] = {}
    for d in decisions:
        tiers[d["authority"]] = tiers.get(d["authority"], 0) + 1

    print(f"trace     {path.name}")
    print(f"events    {len(records)}  ·  head epoch {proj['epoch']}")
    print(f"decisions {len(decisions)}  ·  foreclosures {len(forecl)} "
          f"({sum(1 for f in forecl if f['active'])} active)")
    for tier, n in sorted(tiers.items()):
        print(f"  {tier:28s} {n}")
    print(f"fingerprint entries {len(fp)}")
    print("OK — trace loads clean; every guard passed; projection is total.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
