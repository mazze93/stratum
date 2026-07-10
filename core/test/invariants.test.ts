/**
 * The 16 invariants of the Event Epistemic Contract, ported 1:1 from
 * reference/test_tessera_projection.py. Test names match the Python exactly;
 * if a test here disagrees with its Python twin, the Python wins.
 */

import { describe, expect, test } from "vitest";
import {
  Authority,
  ChainDepthExceeded,
  ContractViolation,
  EpisodicLog,
  Evidence,
  IncompleteProjection,
  Status,
  StratumEvent,
  TRANSITION_EFFECT,
  TRANSITIONS,
  authoritativeFingerprint,
  loadLog,
  projectTessera,
  requireAuthoritative,
  serializeLog,
} from "../src/index.js";

// --- builders (mirror the Python helpers) -----------------------------------

function decision(
  id: string,
  opts: {
    status?: Status;
    evidence?: Evidence[];
    targets?: string[];
    ts?: string | null;
    narrative?: string;
    root?: boolean;
  } = {},
): StratumEvent {
  return {
    id,
    type: "decision",
    agentId: "executor",
    schemaVersion: 1,
    seq: -1,
    birthStatus: opts.status ?? Status.Asserted,
    claim: { narrative: opts.narrative ?? "d" },
    evidence: opts.evidence ?? [],
    targets: opts.targets ?? [],
    isTrustRoot: opts.root ?? false,
    timestamp: opts.ts ?? null,
  };
}

function ev(
  id: string,
  type: string,
  opts: {
    evidence?: Evidence[];
    targets?: string[];
    ts?: string | null;
    status?: Status;
  } = {},
): StratumEvent {
  return {
    id,
    type,
    agentId: "verifier",
    schemaVersion: 1,
    seq: -1,
    birthStatus: opts.status ?? Status.Asserted,
    claim: {},
    evidence: opts.evidence ?? [],
    targets: opts.targets ?? [],
    isTrustRoot: false,
    timestamp: opts.ts ?? null,
  };
}

const CHECK: Evidence = { kind: "test_exit", ref: "suite#42", checkedAt: "t0.9", signer: null };

// --- I1 ---------------------------------------------------------------------

test("test_i1_claim_only_cannot_validate", () => {
  const log = new EpisodicLog();
  log.append(decision("d1", { status: Status.PendingEvidence }));
  expect(() => log.append(ev("v1", "verification", { targets: ["d1"] }))).toThrowError(/I1/);
});

test("test_i1_checked_evidence_validates", () => {
  const log = new EpisodicLog();
  log.append(decision("d1", { status: Status.PendingEvidence }));
  log.append(ev("v1", "verification", { targets: ["d1"], evidence: [CHECK] }));
  expect(log.statusAt("d1", log.head)).toBe(Status.Validated);
});

// --- I2 ---------------------------------------------------------------------

test("test_i2_supersession_preserves_chain", () => {
  const log = new EpisodicLog();
  log.append(decision("d1", { status: Status.PendingEvidence }));
  log.append(ev("v1", "verification", { targets: ["d1"], evidence: [CHECK] }));
  log.append(decision("d2", { status: Status.PendingEvidence, targets: ["d1"] }));
  log.append(ev("s1", "supersession", { targets: ["d1"] }));
  const proj = projectTessera(log);
  const d2 = proj.authoritative.recent_decisions.find((d) => d.id === "d2")!;
  expect(d2.revision_chain).toContain("d1");
  expect(log.statusAt("d1", log.head)).toBe(Status.Superseded);
});

// --- I3 ---------------------------------------------------------------------

test("test_i3a_depth_circuit_breaker", () => {
  const log = new EpisodicLog();
  let prev: string | null = null;
  let tripped = -1;
  for (let i = 0; i < 20; i++) {
    const did = `d${i}`;
    log.append(
      decision(did, { status: Status.PendingEvidence, targets: prev ? [prev] : [] }),
    );
    log.append(ev(`v${i}`, "verification", { targets: [did], evidence: [CHECK] }));
    try {
      log.append(ev(`s${i}`, "supersession", { targets: [did] }));
    } catch (e) {
      expect(e).toBeInstanceOf(ChainDepthExceeded);
      tripped = i;
      break;
    }
    prev = did;
  }
  expect(tripped).toBeGreaterThanOrEqual(8);
});

test("test_i3b_fanin_distinct_from_depth", () => {
  const log = new EpisodicLog();
  const shared: Evidence = { kind: "file_hash", ref: "config.yaml#sha", checkedAt: "t0", signer: null };
  for (let i = 0; i < 5; i++) {
    log.append(decision(`d${i}`, { status: Status.PendingEvidence, evidence: [shared] }));
  }
  log.append(
    ev("inv1", "invalidation", { targets: ["config.yaml#sha"], status: Status.PendingEvidence }),
  );
  const proj = projectTessera(log);
  const demoted = proj.authoritative.recent_decisions.filter(
    (d) => d.authority === Authority.Provisional,
  );
  expect(demoted).toHaveLength(5);
  for (let i = 0; i < 5; i++) {
    expect(log.statusAt(`d${i}`, log.head)).toBe(Status.PendingEvidence);
  }
});

test("test_review_clears_on_overturned_invalidation", () => {
  const log = new EpisodicLog();
  const fact: Evidence = { kind: "file_hash", ref: "x.yaml#sha", checkedAt: "t0", signer: null };
  log.append(decision("d1", { status: Status.PendingEvidence, evidence: [fact] }));
  log.append(ev("v1", "verification", { targets: ["d1"], evidence: [CHECK] }));
  log.append(ev("inv1", "invalidation", { targets: ["x.yaml#sha"], status: Status.PendingEvidence }));
  expect(log.underReview("d1", log.head)).toBe(true);
  // overturning a pending invalidation is a rejection, which lands in an
  // OVERTURNED status and clears review with no cleanup actor
  log.append(ev("r_inv", "rejection", { targets: ["inv1"] }));
  expect(log.underReview("d1", log.head)).toBe(false);
  expect(projectTessera(log).authoritative.recent_decisions[0]!.authority).toBe(
    Authority.Verified,
  );
});

// --- determinism: wall-clock independence -----------------------------------

test("test_determinism_under_timestamp_permutation", () => {
  const build = (ts: string[]) => {
    const log = new EpisodicLog();
    log.append(decision("d1", { status: Status.PendingEvidence, ts: ts[0] }));
    log.append(ev("v1", "verification", { targets: ["d1"], evidence: [CHECK], ts: ts[1] }));
    log.append(decision("d2", { status: Status.PendingEvidence, ts: ts[2] }));
    return projectTessera(log);
  };
  expect(build(["2026-01-01", "2026-01-02", "2026-01-03"])).toEqual(
    build(["2030-12-31", "1999-01-01", "2026-06-20"]),
  );
});

// --- replay proven by an actual serialization round-trip ---------------------

function richLog(): EpisodicLog {
  const log = new EpisodicLog();
  log.append(decision("d1", { status: Status.PendingEvidence }));
  log.append(ev("v1", "verification", { targets: ["d1"], evidence: [CHECK] }));
  log.append(decision("d2", { status: Status.PendingEvidence, targets: ["d1"] }));
  log.append(ev("s1", "supersession", { targets: ["d1"] }));
  log.append({
    id: "f1",
    type: "foreclosure",
    agentId: "architect",
    schemaVersion: 1,
    seq: -1,
    birthStatus: Status.Ratified,
    isTrustRoot: true,
    claim: { narrative: "no kafka" },
    evidence: [],
    targets: [],
    timestamp: null,
  });
  const fact: Evidence = { kind: "file_hash", ref: "y#sha", checkedAt: "t0", signer: null };
  log.append(decision("d3", { status: Status.PendingEvidence, evidence: [fact] }));
  log.append(ev("inv1", "invalidation", { targets: ["y#sha"], status: Status.PendingEvidence }));
  return log;
}

test("test_i4_replay_from_serialized_log", () => {
  const log = richLog();
  const live = projectTessera(log);
  // cross a REAL serialization boundary (what survives disk / the wire)
  const records = JSON.parse(JSON.stringify(serializeLog(log)));
  const reloaded = loadLog(records);
  const replay = projectTessera(reloaded);
  expect(replay).toEqual(live);
  expect(authoritativeFingerprint(replay)).toEqual(authoritativeFingerprint(live));
});

test("test_corrupt_persisted_log_fails_on_load", () => {
  const records: unknown[] = serializeLog(richLog());
  records.push({
    id: "bad",
    type: "verification",
    agent_id: "x",
    schema_version: 1,
    birth_status: "asserted",
    claim: {},
    evidence: [], // no checked evidence
    targets: ["d3"],
    is_trust_root: false,
    timestamp: null,
  });
  expect(() => loadLog(records)).toThrowError(ContractViolation);
});

// --- axiom vs evidence trust are different tiers ------------------------------

test("test_axiom_and_evidence_trust_are_distinct", () => {
  const log = new EpisodicLog();
  log.append(decision("root", { status: Status.Ratified, root: true })); // authority-declared
  log.append(decision("d1", { status: Status.PendingEvidence }));
  log.append(ev("v1", "verification", { targets: ["d1"], evidence: [CHECK] })); // evidence-checked
  const proj = projectTessera(log);
  const auth = Object.fromEntries(
    proj.authoritative.recent_decisions.map((d) => [d.id, d.authority]),
  );
  expect(auth["root"]).toBe(Authority.Axiomatic);
  expect(auth["d1"]).toBe(Authority.Verified);
  expect(auth["root"]).not.toBe(auth["d1"]); // the distinction is preserved, not collapsed
});

// --- quorum must count only CHECKED signatures -------------------------------

test("test_quorum_rejects_unchecked_signatures", () => {
  const log = new EpisodicLog();
  log.append(decision("r1", { status: Status.Ratified, root: true }));
  // two DISTINCT signer strings, but BOTH unchecked (checkedAt = null)
  const unchecked = ev("rev", "trust_root_revoked", {
    targets: ["r1"],
    evidence: [
      { kind: "policy_authority", ref: "A", checkedAt: null, signer: "A" },
      { kind: "policy_authority", ref: "B", checkedAt: null, signer: "B" },
    ],
  });
  expect(() => log.append(unchecked)).toThrowError(/CHECKED/i);
  expect(log.statusAt("r1", log.head)).toBe(Status.Ratified); // NOT revoked
});

test("test_quorum_accepts_checked_distinct_signatures", () => {
  const log = new EpisodicLog();
  log.append(decision("r1", { status: Status.Ratified, root: true }));
  log.append(
    ev("rev", "trust_root_revoked", {
      targets: ["r1"],
      evidence: [
        { kind: "policy_authority", ref: "A", checkedAt: "t", signer: "A" },
        { kind: "policy_authority", ref: "B", checkedAt: "t", signer: "B" },
      ],
    }),
  );
  expect(log.statusAt("r1", log.head)).toBe(Status.Contradicted);
});

// --- ontology completeness vs the status space ------------------------------

test("test_ontology_covers_status_space", () => {
  const reachable = new Set<Status>();
  for (const outs of Object.values(TRANSITIONS)) {
    for (const s of outs) reachable.add(s);
  }
  const covered = new Set(Object.values(TRANSITION_EFFECT));
  const missing = [...reachable].filter((s) => !covered.has(s));
  expect(missing).toEqual([]);
});

// --- fail-closed completeness + LTS guard -----------------------------------

test("test_fail_closed_on_missing_backing", () => {
  const log = new EpisodicLog();
  log.append(decision("d1", { status: Status.PendingEvidence }));
  expect(requireAuthoritative(log, "decision", "d1").id).toBe("d1");
  expect(() => requireAuthoritative(log, "decision", "ghost")).toThrowError(
    IncompleteProjection,
  );
});

test("test_illegal_transition_rejected", () => {
  const log = new EpisodicLog();
  log.append(decision("d1", { status: Status.Asserted }));
  expect(() =>
    log.append(ev("v1", "verification", { targets: ["d1"], evidence: [CHECK] })),
  ).toThrowError(/illegal transition/);
});

test("test_multi_parent_lineage_rejected", () => {
  const log = new EpisodicLog();
  log.append(decision("a", { status: Status.PendingEvidence }));
  log.append(decision("b", { status: Status.PendingEvidence }));
  expect(() =>
    log.append(decision("c", { status: Status.PendingEvidence, targets: ["a", "b"] })),
  ).toThrowError(/multi-parent/);
});

// --- port-boundary checks (TS-side additions, beyond the 16) -----------------

describe("port boundary", () => {
  test("duplicate event id rejected", () => {
    const log = new EpisodicLog();
    log.append(decision("d1"));
    expect(() => log.append(decision("d1"))).toThrowError(/duplicate/);
  });

  test("unknown event type rejected", () => {
    const log = new EpisodicLog();
    expect(() => log.append({ ...decision("x"), type: "vibes" })).toThrowError(
      /unknown event type/,
    );
  });

  test("invalid birth_status fails parse, not projection", () => {
    expect(() =>
      loadLog([
        {
          id: "z",
          type: "decision",
          agent_id: "a",
          schema_version: 1,
          birth_status: "confident", // not a status
          claim: {},
          evidence: [],
          targets: [],
          is_trust_root: false,
          timestamp: null,
        },
      ]),
    ).toThrowError(/birth_status/);
  });
});
