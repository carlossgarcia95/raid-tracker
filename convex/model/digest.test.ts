import { describe, expect, test } from "vitest";
import {
  composeDigest,
  mondayOfWeekUTC,
  weekKeyOf,
  type DigestContext,
} from "./digest";
import type { Doc, Id } from "../_generated/dataModel";

// --- tiny builders (cast plain objects to Docs; composer only reads fields it needs) ---
const deliv = (id: string, title: string, teamId: string): Doc<"deliverables"> =>
  ({ _id: id, owningTeamId: teamId, title, status: "in_progress" }) as unknown as Doc<"deliverables">;
const team = (id: string, name: string): Doc<"teams"> =>
  ({ _id: id, name }) as unknown as Doc<"teams">;
const edge = (
  id: string,
  provider: string,
  consumer: string,
  neededByDate: number,
  committedDate: number | undefined,
): Doc<"dependencies"> =>
  ({ _id: id, providerDeliverableId: provider, consumerDeliverableId: consumer, neededByDate, committedDate }) as unknown as Doc<"dependencies">;
const change = (
  entityType: Doc<"statusChanges">["entityType"],
  entityId: string,
  field: string,
  oldValue: string,
  newValue: string,
): Doc<"statusChanges"> =>
  ({ _id: `c_${entityId}_${field}`, entityType, entityId, field, oldValue, newValue }) as unknown as Doc<"statusChanges">;

const NOW = Date.UTC(2026, 6, 22, 12, 0, 0); // Wed 2026-07-22

function ctx(over: Partial<DigestContext> = {}): DigestContext {
  return {
    deliverableById: new Map(),
    teamById: new Map(),
    edgeById: new Map(),
    reach: {},
    ...over,
  };
}

describe("date helpers", () => {
  test("mondayOfWeekUTC snaps back to Monday 00:00 UTC", () => {
    // 2026-07-22 is a Wednesday → Monday is 2026-07-20.
    expect(mondayOfWeekUTC(NOW)).toBe(Date.UTC(2026, 6, 20));
  });
  test("weekKeyOf formats the Monday as YYYY-MM-DD", () => {
    expect(weekKeyOf(NOW)).toBe("2026-07-20");
  });
  test("a Sunday belongs to the week that started the previous Monday", () => {
    const sun = Date.UTC(2026, 6, 26, 9); // Sun 2026-07-26
    expect(weekKeyOf(sun)).toBe("2026-07-20");
  });
  test("a Monday is its own week start", () => {
    const mon = Date.UTC(2026, 6, 20, 1);
    expect(weekKeyOf(mon)).toBe("2026-07-20");
  });
});

describe("composeDigest", () => {
  test("empty week yields an all-quiet digest with zero counts", () => {
    const r = composeDigest([], ctx(), NOW);
    expect(r.weekKey).toBe("2026-07-20");
    expect(r.totalChanges).toBe(0);
    expect(r.worsenedCount).toBe(0);
    expect(r.improvedCount).toBe(0);
    expect(r.markdown).toContain("all quiet");
  });

  test("a deliverable that went blocked is worsening and shows its downstream blast radius", () => {
    const g = ctx({
      deliverableById: new Map([["d1" as Id<"deliverables">, deliv("d1", "Checkout API", "t1")]]),
      teamById: new Map([["t1" as Id<"teams">, team("t1", "Payments")]]),
      reach: { d1: 2 },
    });
    const r = composeDigest([change("deliverable", "d1", "status", "in_progress", "blocked")], g, NOW);
    expect(r.worsenedCount).toBe(1);
    expect(r.markdown).toContain("## ⚠️ Went at-risk this week");
    expect(r.markdown).toContain("### Payments");
    expect(r.markdown).toContain("Checkout API");
    expect(r.markdown).toContain("`in_progress → blocked`");
    expect(r.markdown).toContain("blocks **2** downstream deliverables");
  });

  test("a dependency going red is worsening and shows provider→consumer plus slack", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const g = ctx({
      deliverableById: new Map([
        ["p" as Id<"deliverables">, deliv("p", "Auth Service", "t1")],
        ["c" as Id<"deliverables">, deliv("c", "Checkout API", "t2")],
      ]),
      teamById: new Map([
        ["t1" as Id<"teams">, team("t1", "Platform")],
        ["t2" as Id<"teams">, team("t2", "Payments")],
      ]),
      edgeById: new Map([["e1" as Id<"dependencies">, edge("e1", "p", "c", NOW + 20 * DAY, NOW + 22 * DAY)]]),
    });
    const r = composeDigest([change("dependency", "e1", "rag", "amber", "red")], g, NOW);
    expect(r.worsenedCount).toBe(1);
    expect(r.markdown).toContain("Auth Service → Checkout API");
    expect(r.markdown).toContain("`amber → red`");
    expect(r.markdown).toContain("-2 days slack"); // neededBy − committed = 20 − 22
    expect(r.markdown).toContain("### Payments"); // grouped under the consumer's team
  });

  test("an improvement lands in the Recovered section", () => {
    const g = ctx({
      deliverableById: new Map([["d1" as Id<"deliverables">, deliv("d1", "Data Pipeline", "t1")]]),
      teamById: new Map([["t1" as Id<"teams">, team("t1", "Data")]]),
    });
    const r = composeDigest([change("deliverable", "d1", "status", "blocked", "in_progress")], g, NOW);
    expect(r.improvedCount).toBe(1);
    expect(r.worsenedCount).toBe(0);
    expect(r.markdown).toContain("## ✅ Recovered / improved");
    expect(r.markdown).toContain("Data Pipeline");
  });

  test("a mixed week counts each bucket and renders all sections", () => {
    const g = ctx({
      deliverableById: new Map([
        ["d1" as Id<"deliverables">, deliv("d1", "Checkout API", "t1")],
        ["d2" as Id<"deliverables">, deliv("d2", "Data Pipeline", "t1")],
      ]),
      teamById: new Map([["t1" as Id<"teams">, team("t1", "Core")]]),
      reach: { d1: 1 },
    });
    const r = composeDigest(
      [
        change("deliverable", "d1", "status", "in_progress", "blocked"), // worse
        change("deliverable", "d2", "status", "blocked", "in_progress"), // better
      ],
      g,
      NOW,
    );
    expect(r.totalChanges).toBe(2);
    expect(r.worsenedCount).toBe(1);
    expect(r.improvedCount).toBe(1);
    expect(r.markdown).toContain("**1 went at-risk · 1 recovered · 2 changes**");
  });
});
