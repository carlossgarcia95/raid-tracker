import { expect, test } from "vitest";
import { rollUp, type RollupInput } from "./rollups";

const base: RollupInput = {
  program: { name: "P", status: "active" },
  deliverables: [
    { id: "d1", title: "Alpha", owningTeamId: "t1", effectiveRag: "red", reasons: ["blocked"] },
    { id: "d2", title: "Beta", owningTeamId: "t1", effectiveRag: "green", reasons: [] },
    { id: "d3", title: "Gamma", owningTeamId: "t2", effectiveRag: "amber", reasons: ["overdue"] },
  ],
  edgeRags: ["green", "red"],
  teams: [
    { id: "t1", name: "Platform", color: "#111" },
    { id: "t2", name: "Data", color: "#222" },
  ],
  downstreamCount: { d1: 2, d2: 0, d3: 0 },
  cycleCount: 1,
  risks: [
    { score: 20, status: "open", title: "R1", teamName: "Platform" },
    { score: 8, status: "open", title: "R2", teamName: "Data" },
    { score: 12, status: "mitigating", title: "R3", teamName: "Data" },
  ],
  issues: [
    { status: "open", severity: "high" },
    { status: "in_progress", severity: "critical" },
    { status: "resolved", severity: "medium" },
  ],
  assumptions: [
    { validationStatus: "unvalidated" },
    { validationStatus: "validated" },
    { validationStatus: "invalidated" },
  ],
};

test("rollUp totals and program RAG use worst-case", () => {
  const r = rollUp(base);
  expect(r.deliverableTotals).toEqual({ green: 1, amber: 1, red: 1, total: 3 });
  expect(r.dependencyTotals).toEqual({ green: 1, amber: 0, red: 1, total: 2 });
  expect(r.programRag).toBe("red");
  expect(r.atRisk).toEqual({ deliverables: 2, dependencies: 1, cycles: 1 });
});

test("rollUp per-team health is worst-case and sorted worst-first", () => {
  const r = rollUp(base);
  expect(r.teams.map((t) => t.name)).toEqual(["Platform", "Data"]); // red team first
  const platform = r.teams.find((t) => t.name === "Platform")!;
  expect(platform.rag).toBe("red");
  expect(platform.counts).toEqual({ green: 1, amber: 0, red: 1 });
  expect(platform.total).toBe(2);
});

test("rollUp top blockers exclude zero-reach and sort by count then title", () => {
  const r = rollUp(base);
  // Only d1 is at-risk AND has downstream reach > 0.
  expect(r.topBlockers.map((b) => b.title)).toEqual(["Alpha"]);
  expect(r.topBlockers[0].downstreamCount).toBe(2);
  expect(r.topBlockers[0].teamName).toBe("Platform");
});

test("rollUp RAID summary counts by status/severity/validation", () => {
  const r = rollUp(base);
  expect(r.raid.risks.open).toBe(2);
  expect(r.raid.risks.mitigating).toBe(1);
  expect(r.raid.risks.topOpenByScore.map((x) => x.title)).toEqual(["R1", "R2"]); // open only, score desc
  expect(r.raid.issues).toEqual({
    open: 1,
    inProgress: 1,
    resolved: 1,
    bySeverity: { low: 0, medium: 0, high: 1, critical: 1 }, // resolved medium excluded
  });
  expect(r.raid.assumptions).toEqual({ unvalidated: 1, validated: 1, invalidated: 1 });
});

test("rollUp on an empty program returns a zeroed, green payload", () => {
  const r = rollUp({
    program: null, deliverables: [], edgeRags: [], teams: [],
    downstreamCount: {}, cycleCount: 0, risks: [], issues: [], assumptions: [],
  });
  expect(r.program).toBeNull();
  expect(r.programRag).toBe("green");
  expect(r.deliverableTotals).toEqual({ green: 0, amber: 0, red: 0, total: 0 });
  expect(r.topBlockers).toEqual([]);
  expect(r.atRisk).toEqual({ deliverables: 0, dependencies: 0, cycles: 0 });
});
