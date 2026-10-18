# PLAN — Checkmate × Stratum joint M0

**Ask (restated):** implement milestone M0 (WP00–WP04) of the Checkmate and
Stratum Joint Implementation Specification v1.1: a refreshed baseline with
negative controls, frozen managed-client/event-v3 schemas plus one immutable
fixture bundle, the `@stratum/decisions` contract package, and Checkmate
pinning and consuming exactly those artifacts. No schema-3 producer, no deploy.
Approved by mazze 2026-10-18 ("Go: all of M0"; distribution = vendored tarball).

**Spec:** `docs/specs/checkmate-joint-v1.1/` (contract `9261ba30…`, docx
`3682b38a…`; `validate_handoff.py` passes — packaging only).

**Repos and files in scope:**
- stratum: `docs/specs/checkmate-joint-v1.1/`, `docs/journal/2026-10-18-checkmate-m0/`,
  `schemas/event.v3.schema.json`, `schemas/managed-client.v1.schema.json`,
  `fixtures/managed-client-v1/`, `core/src/managed.ts` (+ index export),
  `reference/managed.py`, tests in `core/test/` and `reference/`,
  `decisions/` (new workspace), root `package.json` workspaces, trace
  `data/checkmate-trace.jsonl` (+ renderer registration, regenerated DECISIONS.md).
- checkmate: `vendor/stratum/`, `src/stratum-client.ts`, `src/decision-client.ts`,
  `src/types.ts`, `public/app.js`, `test/security-regressions.test.ts`,
  `test/stratum-contract.test.ts`, `scripts/verify-vendor.mjs`, `package.json`,
  journal pointers.

## Phases (one PR each, merged when that repo's checks pass)

| # | Repo | WP | Exit |
|---|---|---|---|
| S1 | stratum | WP00 + WP01 | bundle + journal committed; schemas/fixtures frozen with manifest digest; TS and Python agree on every fixture digest; v3 records refused by both readers; v1/v2 goldens unchanged |
| S2 | stratum | WP03 | `@stratum/decisions` contracts + runtime schemas; negative compile cases (A21); refuses unknown kind / invalid JSON; no ambient I/O |
| C1 | checkmate | WP00 + WP02 | negative controls committed; vendored tarball + fixture bundle pinned by sha256 and Stratum revision; digests recomputed identically in checkmate CI |
| C2 | checkmate | WP04 | consume shared types; advisory preflight preview envelope (`acknowledged_snapshot: null`, cannot authorize); runtime validation at REST/MCP |

## Constraints
- Stratum stays generic: no vulnerability labels in `core/`; research obligations live in the profile fixtures.
- No new runtime dependencies (repo idiom: hand-written decoders, schema files kept in step by tests).
- Fixture expectations are never edited downstream to make a side pass; a change means a new digest.
- No v3 producer, no deploy, no external action.
