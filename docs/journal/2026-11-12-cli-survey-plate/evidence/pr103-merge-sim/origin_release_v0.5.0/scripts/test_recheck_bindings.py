"""
test_recheck_bindings.py — the re-checker re-derives, and fails honestly (tp-023).

Builds a scratch git repo with two commits, writes v2 bindings against it, and
runs scripts/recheck-bindings.py as a subprocess. Each case pins a way evidence
can fail to reproduce.

Run:  python3 scripts/test_recheck_bindings.py
"""

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOL = HERE / "recheck-bindings.py"
REPO_ID = "example.invalid/me/demo"


def sh(*cmd, cwd):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def make_repo(tmp: Path):
    r = tmp / "repo"
    r.mkdir()
    sh("git", "init", "-q", cwd=r)
    for k, v in (("user.email", "t@example.invalid"), ("user.name", "t"), ("commit.gpgsign", "false")):
        sh("git", "config", k, v, cwd=r)
    (r / "check.sh").write_text('echo \'{"ok":true}\' > out.json\n')
    (r / "input.txt").write_text("v1\n")
    sh("git", "add", ".", cwd=r)
    sh("git", "commit", "-q", "-m", "one", cwd=r)
    c1 = sh("git", "rev-parse", "HEAD", cwd=r)
    (r / "input.txt").write_text("v2\n")
    (r / "check.sh").write_text("exit 7\n")
    sh("git", "commit", "-qam", "two", cwd=r)
    c2 = sh("git", "rev-parse", "HEAD", cwd=r)
    return r, c1, c2


def trace(tmp: Path, bindings: list) -> Path:
    recs = [{"id": "d", "type": "decision", "agent_id": "t", "schema_version": 2,
             "birth_status": "pending_evidence", "claim": {}, "evidence": [], "targets": [],
             "is_trust_root": False, "timestamp": None}]
    for i, b in enumerate(bindings):
        recs.append({"id": f"e{i}", "type": "decision", "agent_id": "t", "schema_version": 2,
                     "birth_status": "pending_evidence", "claim": {},
                     "evidence": [{"kind": "test_exit", "ref": b["command"], "checked_at": None,
                                   "signer": None, "binding": b}],
                     "targets": [], "is_trust_root": False, "timestamp": None})
    p = tmp / f"t{len(list(tmp.glob('t*.jsonl')))}-trace.jsonl"
    p.write_text("".join(json.dumps(r) + "\n" for r in recs))
    return p


def run(repo: Path, t: Path):
    r = subprocess.run([sys.executable, str(TOOL), str(t), "--repo", REPO_ID, "--checkout", str(repo)],
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def check(commit, command, exit=0, **kw):
    return {"type": "reproducible_check", "command": command, "repo": REPO_ID,
            "commit": commit, "expect_exit": exit, **kw}


OUT = hashlib.sha256(b'{"ok":true}\n').hexdigest()
IN_V1 = hashlib.sha256(b"v1\n").hexdigest()


def test_reproducing_binding_passes(tmp, repo, c1, c2):
    code, out = run(repo, trace(tmp, [check(c1, "bash check.sh", output_sha256=OUT, output_path="out.json",
                                            inputs=[{"id": "input.txt", "sha256": IN_V1}])]))
    assert code == 0 and "1/1 reproduced" in out, out


def test_runs_at_the_pinned_commit_not_head(tmp, repo, c1, c2):
    # HEAD's check.sh exits 7; the binding pins c1, where it exits 0.
    code, out = run(repo, trace(tmp, [check(c1, "bash check.sh")]))
    assert code == 0, out
    code, out = run(repo, trace(tmp, [check(c2, "bash check.sh")]))
    assert code == 1 and "exit 7 != expected 0" in out, out


def test_output_digest_mismatch_fails(tmp, repo, c1, c2):
    code, out = run(repo, trace(tmp, [check(c1, "bash check.sh", output_sha256="0" * 64, output_path="out.json")]))
    assert code == 1 and "output out.json: sha256" in out, out


def test_missing_output_fails(tmp, repo, c1, c2):
    code, out = run(repo, trace(tmp, [check(c1, "true", output_sha256=OUT, output_path="never.json")]))
    assert code == 1 and "missing after the run" in out, out


def test_input_digest_is_rederived_from_the_checkout(tmp, repo, c1, c2):
    code, out = run(repo, trace(tmp, [check(c2, "true", inputs=[{"id": "input.txt", "sha256": IN_V1}])]))
    assert code == 1 and "input input.txt: sha256" in out, out   # at c2 input.txt is v2


def test_non_file_input_is_unverifiable_not_failed(tmp, repo, c1, c2):
    code, out = run(repo, trace(tmp, [check(c1, "true", inputs=[{"id": "temenos:signal-42", "sha256": "a" * 64}])]))
    assert code == 0 and "unverifiable here" in out, out


def test_unknown_commit_fails(tmp, repo, c1, c2):
    code, out = run(repo, trace(tmp, [check("f" * 40, "true")]))
    assert code == 1 and "not in this clone" in out, out


def test_foreign_repo_is_skipped(tmp, repo, c1, c2):
    b = check(c1, "true")
    b["repo"] = "github.com/someone/else"
    code, out = run(repo, trace(tmp, [b]))
    assert code == 0 and "SKIP" in out and "0 binding(s) to re-run" in out, out


def test_worktrees_are_cleaned_up(tmp, repo, c1, c2):
    run(repo, trace(tmp, [check(c1, "true")]))
    assert sh("git", "worktree", "list", cwd=repo).count("\n") == 0   # only the main checkout


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        with tempfile.TemporaryDirectory() as d:
            tmp = Path(d)
            repo, c1, c2 = make_repo(tmp)
            t(tmp, repo, c1, c2)
        print(f"  ok  {t.__name__}")
    print(f"\n{len(tests)}/{len(tests)} re-checker properties hold.")
