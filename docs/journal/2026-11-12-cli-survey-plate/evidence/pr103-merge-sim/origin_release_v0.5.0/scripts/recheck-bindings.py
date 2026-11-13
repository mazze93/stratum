#!/usr/bin/env python3
"""Re-run every reproducible_check binding at its pinned commit (ADR-003 R3, tp-023).

A v2 binding makes evidence *re-checkable*. This makes it *re-checked*: for each
distinct reproducible_check in the traces whose repo is this repository, it
checks out the pinned commit in a clean detached worktree, runs the command,
and compares what it can re-derive:

  * the exit code                         — must equal expect_exit
  * output_path's sha256 after the run    — must equal output_sha256
  * inputs whose id names a file in the checkout — sha256 must match
    (an input id that isn't a repo file — e.g. a Temenos signal id — is
    reported as unverifiable here, not failed: this tool can't see it)

Nothing supplied is trusted: commit ids, digests and paths are re-derived from
the checkout (claude-stamp's verify-release rule). Bindings for other repos are
reported and skipped. The tool never writes to the traces — a re-check result
is a separate act of evidence, recorded by a human or a reviewed PR.

Exit: 0 every own-repo binding reproduced · 1 at least one did not · 2 usage/load error

Usage:
  python3 scripts/recheck-bindings.py [trace.jsonl ...] [--repo host/owner/name]
                                      [--timeout SECONDS] [--list] [--checkout DIR]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "reference"))

from tessera_projection import ReproducibleCheck, is_repo_relative_path, load_log  # noqa: E402


def normalize_repo(url: str) -> str | None:
    """host/path — no scheme, no .git, and never userinfo (a remote can embed a token)."""
    u = url.strip()
    m = re.match(r"^[^@/]+@([^:/]+):(.+)$", u)  # git@host:owner/repo.git
    if m:
        u = f"{m.group(1)}/{m.group(2)}"
    else:
        m = re.match(r"^[a-z][a-z0-9+.-]*://(?:[^@/]*@)?([^/]+)(/.*)?$", u, re.I)
        if not m:
            return None
        u = m.group(1) + (m.group(2) or "")
    u = re.sub(r"\.git$", "", u).rstrip("/")
    return u or None


CHECKOUT = ROOT  # the git repository whose bindings are re-run (--checkout)


def git(*args: str, cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=cwd or CHECKOUT, capture_output=True, text=True, check=check)


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def collect(paths: list[Path]) -> list[tuple[ReproducibleCheck, list[str]]]:
    """Distinct reproducible_check bindings across the traces, with where each is cited."""
    seen: dict[tuple, tuple[ReproducibleCheck, list[str]]] = {}
    for path in paths:
        records = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
        log = load_log(records)  # every guard re-runs; a corrupt trace fails here
        for ev in log.events_upto():
            for e in ev.evidence:
                b = e.binding
                if isinstance(b, ReproducibleCheck):
                    key = (b.repo, b.commit, b.command, b.expect_exit, b.inputs, b.output_sha256, b.output_path)
                    seen.setdefault(key, (b, []))[1].append(f"{path.name}:{ev.id}")
    return list(seen.values())


def recheck(b: ReproducibleCheck, timeout: int) -> tuple[bool, list[str]]:
    notes: list[str] = []
    if git("cat-file", "-e", f"{b.commit}^{{commit}}", check=False).returncode != 0:
        return False, [f"commit {b.commit[:12]} is not in this clone (fetch full history?)"]
    tmp = Path(tempfile.mkdtemp(prefix="stratum-recheck-"))
    wt = tmp / "wt"
    try:
        git("worktree", "add", "--detach", "--quiet", str(wt), b.commit)
        if git("rev-parse", "HEAD", cwd=wt).stdout.strip() != b.commit:
            return False, ["worktree HEAD does not equal the pinned commit"]
        ok = True
        for input_id, want in b.inputs:
            f = wt / input_id
            if is_repo_relative_path(input_id) and f.is_file():
                got = sha256_file(f)
                if got != want:
                    ok = False
                    notes.append(f"input {input_id}: sha256 {got[:12]} != pinned {want[:12]}")
            else:
                notes.append(f"input {input_id}: not a file in the checkout — unverifiable here")
        try:
            r = subprocess.run(["bash", "-c", b.command], cwd=wt, capture_output=True, text=True, timeout=timeout)
            code = r.returncode
        except subprocess.TimeoutExpired:
            return False, notes + [f"timed out after {timeout}s"]
        if code != b.expect_exit:
            ok = False
            tail = (r.stdout + r.stderr).strip().splitlines()[-3:]
            notes.append(f"exit {code} != expected {b.expect_exit}" + (f" — {' | '.join(tail)}" if tail else ""))
        if b.output_sha256 is not None:
            out = wt / b.output_path
            if not out.is_file():
                ok = False
                notes.append(f"output {b.output_path}: missing after the run")
            elif (got := sha256_file(out)) != b.output_sha256:
                ok = False
                notes.append(f"output {b.output_path}: sha256 {got[:12]} != pinned {b.output_sha256[:12]}")
        return ok, notes
    finally:
        git("worktree", "remove", "--force", str(wt), check=False)
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("traces", nargs="*", type=Path)
    ap.add_argument("--repo", help="this repository's identity (default: normalized origin remote)")
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--list", action="store_true", help="list bindings without running them")
    ap.add_argument("--checkout", type=Path, default=ROOT, help="git repository to re-run in (default: this one)")
    a = ap.parse_args()
    global CHECKOUT
    CHECKOUT = a.checkout.resolve()

    paths = a.traces or sorted((ROOT / "data").glob("*-trace.jsonl"))
    repo = a.repo or normalize_repo(git("remote", "get-url", "origin", check=False).stdout)
    if not repo:
        print("recheck: cannot name this repo — pass --repo host/owner/name", file=sys.stderr)
        return 2
    try:
        bindings = collect(paths)
    except Exception as e:  # a trace that fails the contract is a load error, not a re-check result
        print(f"recheck: trace failed to load: {e}", file=sys.stderr)
        return 2

    own = [(b, cites) for b, cites in bindings if b.repo == repo]
    foreign = [(b, cites) for b, cites in bindings if b.repo != repo]
    print(f"recheck  repo {repo} · {len(own)} binding(s) to re-run · {len(foreign)} foreign skipped")
    for b, cites in foreign:
        print(f"  SKIP  {b.repo} @ {b.commit[:12]}  ({', '.join(cites)})")
    failed = 0
    for b, cites in own:
        label = f"{b.commit[:12]}  $ {b.command}"
        if a.list:
            print(f"  ----  {label}  ({', '.join(cites)})")
            continue
        ok, notes = recheck(b, a.timeout)
        failed += not ok
        print(f"  {'PASS' if ok else 'FAIL'}  {label}  ({', '.join(cites)})")
        for n in notes:
            print(f"        {n}")
    if not a.list:
        print(f"{len(own) - failed}/{len(own)} reproduced" + ("" if not failed else " — evidence did NOT reproduce"))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
