/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("dashboard.get rolls up the seeded program", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const d = await t.query(api.dashboard.get, {});

  expect(d.program?.name).toBe("Q3 Platform Launch");

  // 9 deliverables: Checkout, IAP, App Store, Data Pipeline, Analytics, Reporting
  // are red (blocked/cascade/cycle); Auth, API Gateway, Billing Ledger green.
  expect(d.deliverableTotals).toEqual({ green: 3, amber: 0, red: 6, total: 9 });
  expect(d.programRag).toBe("red");
  expect(d.atRisk.deliverables).toBe(6);
  expect(d.dependencyTotals.total).toBe(8);
  expect(d.atRisk.cycles).toBe(1);

  // Top blockers: at-risk deliverables with downstream reach > 0, ranked by
  // count desc then title asc. Every dependency is a hard block, so reach now
  // follows all edges (the old soft edges included).
  expect(d.topBlockers.map((b) => b.title)).toEqual([
    "Analytics Dashboard", // reaches Reporting Service, Data Pipeline (2)
    "Checkout API",        // reaches In-App Purchase, App Store Release (2)
    "Data Pipeline",       // reaches Analytics Dashboard, Reporting Service (2)
    "Reporting Service",   // reaches Data Pipeline, Analytics Dashboard (2)
    "In-App Purchase",     // reaches App Store Release (1)
  ]);
  expect(d.topBlockers[0].downstreamCount).toBe(2);

  // Per-team health: every team surfaced, worst-first.
  const data = d.teams.find((tm) => tm.name === "Data")!;
  expect(data.rag).toBe("red"); // Pipeline/Analytics/Reporting all red
  expect(data.counts).toEqual({ green: 0, amber: 0, red: 3 });

  // RAID roll-ups.
  expect(d.raid.risks.open).toBe(3);
  expect(d.raid.risks.mitigating).toBe(1);
  expect(d.raid.risks.topOpenByScore[0]).toEqual({
    title: "PCI review may slip", score: 20, teamName: "Payments",
  });
  expect(d.raid.issues.bySeverity).toEqual({ low: 0, medium: 0, high: 1, critical: 1 });
  expect(d.raid.assumptions).toEqual({ unvalidated: 1, validated: 1, invalidated: 1 });
});

test("dashboard.get returns an empty payload with no active program", async () => {
  const t = convexTest(schema, modules);
  const d = await t.query(api.dashboard.get, {});
  expect(d.program).toBeNull();
  expect(d.programRag).toBe("green");
  expect(d.deliverableTotals.total).toBe(0);
  expect(d.topBlockers).toEqual([]);
});
