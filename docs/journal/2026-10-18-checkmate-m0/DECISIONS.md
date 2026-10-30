# DECISIONS — Checkmate × Stratum joint M0

Append-only. `date · decision · why · how to reverse`.

---

**2026-10-18 · Load-bearing assumption: the work does not already exist, and the
baselines are where the spec says.** Checked: Stratum `main` = `d5a526b`, equal
to the spec's pinned baseline; no `schemas/event.v3*`, `managed-client*`,
`fixtures/` or `decisions/` exist; ADR-003 phases 1–2 merged, phase 3
(registry/signing) not built — matches spec §3. Checkmate `main` = `753bfaa`,
28 commits past the spec's `36a4ef3`: publication authority (A12) already
closed and deployed (`931adb65`); probes still reproduce A01, A02, A14.
· Why: session-journal Phase 0. · Reverse: n/a (a check).

**2026-10-18 · Authoritative spec = bundle v1.1, not the inbox v1 docx.** The
inbox `…Specification.docx` (530k) lacks the handoff XML part and fails the
validator; the `stratum-checkmate/` copy (622k) is v1.1 (adds §13
`@stratum/decisions`) and passes. · Why: the validator and the contract digest
bind v1.1. · Reverse: n/a.

**2026-10-18 · Distribution = vendored `npm pack` tarball in Checkmate,
pinned by sha256 + Stratum revision; CI verifies the digest.** mazze chose it
over GitHub Packages / a source copy. · Why: Stratum is a private monorepo and
npm cannot install a git subdirectory; a tarball needs no registry token in
either CI. · Reverse: publish to npm.pkg.github.com and swap the dependency
spec; digests stay the identity.

**2026-10-18 · Trace events are authored as `agent_id: claude`, never as mazze.**
`tp-000` was written as a ratified mazze event; this burst will not mint human
authority on mazze's behalf — that is the defect class the spec exists to
remove. · Why: I5/R40. · Reverse: mazze may append a ratification event.

**2026-10-30 · Resume check (Phase 0 of a new session): the 2026-10-18 plan and
WIP still apply; one state record is stale.** Checked: this branch merges clean
onto Stratum `main` `8e7e854`, which is one commit past the `d5a526b` baseline
(the AGENTS.md pointer, #93). The WIP commit `97b80e6` adds only
`core/src/managed.ts` and `reference/managed.py`, marked unverified, while
`handoff-state.json` still says WP01 `not_started`. Checkmate `main` moved too:
PR #13 (`0e452cf`) shipped `src/stratum.ts`, a read-only adapter on the shared
bearer, which C1/C2's planned `src/stratum-client.ts` must reconcile with, not
duplicate. That touches the C phases, not S1. Authorization: mazze's 2026-10-18
"Go: all of M0", plus "begin the work" (2026-10-30); this resume waits for go.
· Why: session-journal Phase 0. · Reverse: n/a (a check).
