import { describe, it, expect } from "vitest";
import { audit, hub, call } from "./helpers";

describe("review probes: current assurance boundaries", () => {
  it("accepts agent closure with zero phase evidence and a valid chain", async () => {
    const id = "review-zero-evidence";
    const a = audit(id);
    await call(a, `audit/${id}/create`, "agent", { title: "Synthetic review", target: "fixture", claim: "Synthetic claim" });
    const closed = await call(a, `audit/${id}/verdict`, "agent", { verdict: "class-closed", disposition: "no-action" });
    const phases = await call(a, `audit/${id}/phases`, "agent");
    const verified = await call(a, `audit/${id}/verify`, "agent");
    expect(closed.status).toBe(200);
    expect(phases.data).toHaveLength(0);
    expect(verified.data.ok).toBe(true);
    console.log("PROBE closure_without_evidence", JSON.stringify({ status: closed.status, phases: phases.data.length, chainOk: verified.data.ok }));
  });
  it("accepts draft first with null payload and advances currentPhase", async () => {
    const id = "review-draft-first";
    const a = audit(id);
    await call(a, `audit/${id}/create`, "agent", { title: "Synthetic review", target: "fixture", claim: "Synthetic claim" });
    const phase = await call(a, `audit/${id}/phase`, "agent", { phase: "draft", payload: null });
    const summary = await call(a, `audit/${id}/summary`, "agent");
    expect(phase.status).toBe(200);
    expect(summary.data.header.currentPhase).toBe("draft");
    expect(summary.data.phasesRecorded).toEqual(["draft"]);
    console.log("PROBE draft_first", JSON.stringify({ status: phase.status, currentPhase: summary.data.header.currentPhase, phasesRecorded: summary.data.phasesRecorded }));
  });
  it("exposes agent-designated published advisory without human publication approval", async () => {
    const created = await call(hub(), "hub/advisory", "agent", { direction: "reported", title: "Synthetic review", package: "synthetic-review-package", state: "draft" });
    const changed = await call(hub(), "hub/set-advisory-state", "agent", { advisoryRecordId: created.data.id, state: "published", advisoryId: "REVIEW-SYNTHETIC-ID", url: "https://example.com/synthetic-review" });
    const projected = await call(hub(), "hub/public-projection", "agent");
    expect(changed.status).toBe(200);
    expect(projected.data.publishedAdvisories).toContainEqual(expect.objectContaining({ advisoryId: "REVIEW-SYNTHETIC-ID" }));
    console.log("PROBE agent_publication", JSON.stringify({ status: changed.status, projected: true, belowThreshold: projected.data.withheld }));
  });
  it("counts duplicate metric submissions separately", async () => {
    const metric = { auditId: "review-zero-evidence", subject: "synthetic-review-method", subjectKind: "method", result: "real-bug" };
    const first = await call(hub(), "hub/skill-metric", "agent", metric);
    const second = await call(hub(), "hub/skill-metric", "agent", metric);
    const metrics = await call(hub(), "hub/skill-efficacy", "agent");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const row = metrics.data.find((x: any) => x.subject === metric.subject);
    expect(row.total).toBe(2);
    console.log("PROBE repeated_metric", JSON.stringify({ total: row.total, realBugCount: row.counts["real-bug"] }));
  });
});
