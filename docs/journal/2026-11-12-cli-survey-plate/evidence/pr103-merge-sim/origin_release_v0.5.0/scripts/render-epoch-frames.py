#!/usr/bin/env python3
"""Emit one compact projection frame per epoch, for the landing's scrubber.

Every frame is produced by the reference oracle at that epoch — dragging the
scrubber does not run a reimplemented fold in the browser, it steps through
projections the Python semantics oracle already computed. That keeps the
landing honest (no third implementation to drift from the contract) and keeps
the claim on the page literally true: this IS deterministic replay.

Frames carry only what the figure needs — id, authority, status, active —
because narratives are already baked once alongside the records.

Usage:
  python3 scripts/render-epoch-frames.py [trace.jsonl] > frames.json
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))

from tessera_projection import load_log, project_tessera  # noqa: E402


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    path = Path(args[0]) if args else ROOT / "data" / "genesis-trace.jsonl"
    records = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    log = load_log(records)

    frames = []
    for epoch in range(log.head + 1):
        proj = project_tessera(log, epoch)
        a = proj["authoritative"]
        frames.append({
            "epoch": epoch,
            "decisions": [
                {"id": d["id"], "authority": d["authority"], "status": d["status"],
                 "revision_chain": d["revision_chain"]}
                for d in a["recent_decisions"]
            ],
            "foreclosures": [
                {"id": f["id"], "authority": f["authority"], "status": f["status"],
                 "active": f["active"]}
                for f in a["foreclosed_options"]
            ],
        })

    json.dump(frames, sys.stdout, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
