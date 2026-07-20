# Dashboard & Roll-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/dashboard` landing view that rolls up the Phase-3 cascade engine into program-level RAG, at-risk counts, per-team health, a Top Blockers list, and a RAID summary — live-updating via Convex.

**Architecture:** One thin Convex query (`dashboard.get`) loads the active program's graph, runs the *same* `computeCascade()` the graph view uses, and delegates all aggregation to a pure, unit-tested `model/rollups.ts`. Blast-radius ranking for Top Blockers is a pure `downstreamReach()` added next to the other graph algorithms. The UI is a client component using `preloadQuery` → `usePreloadedQuery`, matching the existing graph page.

**Tech Stack:** Convex (queries + pure model modules), Next.js App Router, TypeScript, Tailwind + shadcn/ui (`Card`, `Badge`, `Table`), Vitest + convex-test. Package manager: **pnpm**.

## Global Constraints

- Package manager is **pnpm** — never `npm`/`yarn`.
- Convex module filenames are camelCase/underscore — **no hyphens** (only a real deploy catches this).
- **No derived value is ever persisted** — `effectiveRag`, totals, blast radius, program RAG are all computed at read time.
- Graph traversal stays in app code over the loaded edges (no new persistence layer).
- Dates are Unix-ms `v.number()`.
- Pure model modules under `convex/model/` take no Convex `ctx` and must remain unit-testable in isolation (mirror `graphAnalysis.ts`).
- Test files (`convex/**/*.test.ts`) stay excluded from the Convex deploy typecheck (`convex/tsconfig.json`) — don't touch that exclude.
- Convex reactive hooks (`useQuery`/`usePreloadedQuery`) run only in `"use client"` components.
- Run `pnpm test`, `pnpm lint`, `pnpm build` before reporting complete.

---

## File Structure

**Backend (Convex):**
- `convex/model/graphData.ts` — *(modify)* add `toAnalysisGraph()` shared builder.
- `convex/graph.ts` — *(modify)* use `toAnalysisGraph()` (pure refactor, no behavior change).
- `convex/model/graphAnalysis.ts` — *(modify)* add pure `downstreamReach()`.
- `convex/model/graphAnalysis.test.ts` — *(modify)* add `downstreamReach` cases.
- `convex/model/rollups.ts` — *(create)* pure aggregation → `DashboardPayload`.
- `convex/model/rollups.test.ts` — *(create)* unit tests for `rollUp`.
- `convex/dashboard.ts` — *(create)* thin `get` query.
- `convex/dashboard.test.ts` — *(create)* integration test over seed.

**Frontend:**
- `lib/rag.ts` — *(create)* shared RAG color/label helpers (relocate `RAG_STROKE`).
- `components/graph/dependency-edge.tsx` — *(modify)* import + re-export `RAG_STROKE` from `lib/rag`.
- `components/ui/card.tsx` — *(create via shadcn)*.
- `components/dashboard/program-banner.tsx` — *(create)*.
- `components/dashboard/stat-tiles.tsx` — *(create)*.
- `components/dashboard/team-health-table.tsx` — *(create)*.
- `components/dashboard/top-blockers.tsx` — *(create)*.
- `components/dashboard/raid-summary.tsx` — *(create)*.
- `components/dashboard/dashboard-view.tsx` — *(create)* client container.
- `app/(app)/dashboard/page.tsx` — *(create)* preload + render.
- `app/page.tsx` — *(modify)* redirect `/deliverables` → `/dashboard`.
- `components/app-sidebar.tsx` — *(modify)* add "Dashboard" nav item first.

---

## Task 1: Shared analysis-graph builder + refactor `graph.ts`

Extract the "build `AnalysisNode[]`/`AnalysisEdge[]` from the loaded graph" step (currently inline in `graph.ts`) into `graphData.ts` so `dashboard.ts` can reuse it. Pure refactor — the existing `graph.test.ts` is the regression guard.

**Files:**
- Modify: `convex/model/graphData.ts`
- Modify: `convex/graph.ts:14-84`
- Test (regression): `convex/graph.test.ts` (unchanged)

**Interfaces:**
- Produces:
  ```ts
  function toAnalysisGraph(
    deliverableById: Map<Id<"deliverables">, Doc<"deliverables">>,
    edges: Doc<"dependencies">[],
  ): { analysisNodes: AnalysisNode[]; analysisEdges: AnalysisEdge[]; renderEdges: Doc<"dependencies">[] }
  ```

- [ ] **Step 1: Add `toAnalysisGraph` to `graphData.ts`**

Append to `convex/model/graphData.ts` (add the two imports at the top of the file):

```ts
import { slackDays } from "./derived";
import type { AnalysisNode, AnalysisEdge } from "./graphAnalysis";

/**
 * Build the pure-analysis node/edge arrays (and the renderable edge subset) from
 * a loaded program graph. Shared by graph.get and dashboard.get so the shaping
 * logic — including the "both endpoints in-program" edge filter React Flow needs
 * — lives once. Every value here is derived, never persisted.
 */
export function toAnalysisGraph(
  deliverableById: Map<Id<"deliverables">, Doc<"deliverables">>,
  edges: Doc<"dependencies">[],
): {
  analysisNodes: AnalysisNode[];
  analysisEdges: AnalysisEdge[];
  renderEdges: Doc<"dependencies">[];
} {
  const renderEdges = edges.filter(
    (e) =>
      deliverableById.has(e.providerDeliverableId) &&
      deliverableById.has(e.consumerDeliverableId),
  );
  const analysisNodes: AnalysisNode[] = [...deliverableById.values()].map((d) => ({
    id: d._id,
    title: d.title,
    status: d.status,
    targetDate: d.targetDate,
  }));
  const analysisEdges: AnalysisEdge[] = renderEdges.map((e) => ({
    id: e._id,
    source: e.providerDeliverableId,
    target: e.consumerDeliverableId,
    rag: e.rag,
    isBlocking: e.isBlocking,
    slackDays: slackDays(e.neededByDate, e.committedDate),
  }));
  return { analysisNodes, analysisEdges, renderEdges };
}
```

- [ ] **Step 2: Refactor `graph.ts` to use it**

In `convex/graph.ts`, replace the imports and the node/edge-building block. New top imports:

```ts
import { query } from "./_generated/server";
import { slackDays } from "./model/derived";
import { loadActiveProgramGraph, toAnalysisGraph } from "./model/graphData";
import { computeCascade } from "./model/graphAnalysis";
```

Replace the body from `const deliverables = [...deliverableById.values()];` through the `const { nodeStates, edgeStates, cycles } = computeCascade(...)` call with:

```ts
    const deliverables = [...deliverableById.values()];
    const { analysisNodes, analysisEdges, renderEdges } = toAnalysisGraph(
      deliverableById,
      inProgramEdges,
    );

    const { nodeStates, edgeStates, cycles } = computeCascade(
      analysisNodes,
      analysisEdges,
      Date.now(),
    );
```

The `AnalysisNode`/`AnalysisEdge` type imports and the manual `renderEdges`/`analysisNodes`/`analysisEdges` construction are now gone. The rest of the handler (building `nodes` and `edges` responses from `renderEdges`) is unchanged. `slackDays` is still used there for the response edges, so keep its import.

- [ ] **Step 3: Run the graph regression tests — must stay green**

Run: `pnpm test convex/graph.test.ts`
Expected: PASS (both tests — 9 nodes / 8 edges, cascade + cycle assertions unchanged).

- [ ] **Step 4: Typecheck**

Run: `pnpm build`
Expected: builds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add convex/model/graphData.ts convex/graph.ts
git commit -m "refactor: extract toAnalysisGraph shared by graph and dashboard queries"
```

---

## Task 2: `downstreamReach` blast-radius traversal

Pure function ranking each deliverable by how many distinct downstream deliverables it reaches via **blocking** edges. Powers Top Blockers.

**Files:**
- Modify: `convex/model/graphAnalysis.ts`
- Test: `convex/model/graphAnalysis.test.ts`

**Interfaces:**
- Consumes: `AnalysisNode`, `AnalysisEdge` (already defined in `graphAnalysis.ts`).
- Produces: `function downstreamReach(nodes: AnalysisNode[], edges: AnalysisEdge[]): Record<string, number>`

- [ ] **Step 1: Write the failing tests**

Append to `convex/model/graphAnalysis.test.ts` (reuse the existing `node`/`edge` helpers and add the import):

```ts
import { downstreamReach } from "./graphAnalysis";

test("downstreamReach counts distinct downstream nodes over blocking edges", () => {
  const nodes = [node("a"), node("b"), node("c")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c")];
  expect(downstreamReach(nodes, edges)).toEqual({ a: 2, b: 1, c: 0 });
});

test("downstreamReach ignores non-blocking edges", () => {
  const nodes = [node("a"), node("b"), node("c")];
  const edges = [
    edge("e1", "a", "b", { isBlocking: false }),
    edge("e2", "b", "c"),
  ];
  // a reaches nothing (its only out-edge is soft); b still reaches c.
  expect(downstreamReach(nodes, edges)).toEqual({ a: 0, b: 1, c: 0 });
});

test("downstreamReach counts a fan-out target once", () => {
  const nodes = [node("a"), node("b"), node("c"), node("d")];
  const edges = [
    edge("e1", "a", "b"),
    edge("e2", "a", "c"),
    edge("e3", "b", "d"),
    edge("e4", "c", "d"),
  ];
  expect(downstreamReach(nodes, edges)["a"]).toBe(3); // b, c, d — d once
});

test("downstreamReach terminates on a cycle and excludes self", () => {
  const nodes = [node("a"), node("b"), node("c")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "c", "a")];
  const reach = downstreamReach(nodes, edges);
  expect(reach["a"]).toBe(2); // b, c — not a itself
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test convex/model/graphAnalysis.test.ts`
Expected: FAIL — `downstreamReach is not a function` / not exported.

- [ ] **Step 3: Implement `downstreamReach`**

Append to `convex/model/graphAnalysis.ts`:

```ts
// Blast radius: for each node, the count of DISTINCT downstream deliverables
// reachable via BLOCKING edges. Non-blocking edges don't propagate a hard slip,
// so they don't count. Iterative DFS with a visited set — terminates on cycles;
// the start node is never counted as its own downstream.
export function downstreamReach(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
): Record<string, number> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!e.isBlocking) continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const result: Record<string, number> = {};
  for (const n of nodes) {
    const seen = new Set<string>();
    const stack = [...(adj.get(n.id) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === n.id || seen.has(cur)) continue;
      seen.add(cur);
      for (const next of adj.get(cur) ?? []) stack.push(next);
    }
    result[n.id] = seen.size;
  }
  return result;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test convex/model/graphAnalysis.test.ts`
Expected: PASS (existing cascade/cycle tests + the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add convex/model/graphAnalysis.ts convex/model/graphAnalysis.test.ts
git commit -m "feat: add downstreamReach blast-radius traversal"
```

---

## Task 3: `rollups.ts` pure aggregation module

Pure function that turns the cascade result + plain deliverable/team/RAID data into the full `DashboardPayload`. No Convex `ctx` — unit-tested with hand-built inputs.

**Files:**
- Create: `convex/model/rollups.ts`
- Test: `convex/model/rollups.test.ts`

**Interfaces:**
- Consumes: `Severity` (from `graphAnalysis.ts`); `downstreamReach` output (a `Record<string, number>`).
- Produces (relied on by Task 4 and the UI): the exported types below and
  `function rollUp(input: RollupInput): DashboardPayload`.

- [ ] **Step 1: Write the failing tests**

Create `convex/model/rollups.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test convex/model/rollups.test.ts`
Expected: FAIL — cannot find module `./rollups`.

- [ ] **Step 3: Implement `rollups.ts`**

Create `convex/model/rollups.ts`:

```ts
// Pure roll-ups over the cascade result — no Convex ctx, unit-tested in isolation
// (mirrors graphAnalysis.ts). Nothing here is persisted (derived at read time).
import type { Severity } from "./graphAnalysis";

export type RagCounts = { green: number; amber: number; red: number };
export type Totals = RagCounts & { total: number };

// Plain inputs (not Convex Docs) so this stays ctx-free and trivially testable.
export type RollupDeliverable = {
  id: string;
  title: string;
  owningTeamId: string;
  effectiveRag: Severity;
  reasons: string[];
};
export type RollupTeam = { id: string; name: string; color: string };
export type RollupRisk = {
  score: number;
  status: "open" | "mitigating" | "closed";
  title: string;
  teamName: string;
};
export type RollupIssue = {
  status: "open" | "in_progress" | "resolved";
  severity: "low" | "medium" | "high" | "critical";
};
export type RollupAssumption = {
  validationStatus: "unvalidated" | "validated" | "invalidated";
};

export type TeamHealth = {
  teamId: string;
  name: string;
  color: string;
  rag: Severity;
  counts: RagCounts;
  total: number;
};
export type TopBlocker = {
  deliverableId: string;
  title: string;
  teamName: string;
  effectiveRag: Severity;
  downstreamCount: number;
  reasons: string[];
};
export type RaidSummary = {
  risks: {
    open: number;
    mitigating: number;
    closed: number;
    topOpenByScore: { title: string; score: number; teamName: string }[];
  };
  issues: {
    open: number;
    inProgress: number;
    resolved: number;
    bySeverity: { low: number; medium: number; high: number; critical: number };
  };
  assumptions: { unvalidated: number; validated: number; invalidated: number };
};
export type DashboardPayload = {
  program: { name: string; status: string } | null;
  programRag: Severity;
  deliverableTotals: Totals;
  dependencyTotals: Totals;
  atRisk: { deliverables: number; dependencies: number; cycles: number };
  teams: TeamHealth[];
  topBlockers: TopBlocker[];
  raid: RaidSummary;
};

export type RollupInput = {
  program: { name: string; status: string } | null;
  deliverables: RollupDeliverable[];
  edgeRags: Severity[];
  teams: RollupTeam[];
  downstreamCount: Record<string, number>;
  cycleCount: number;
  risks: RollupRisk[];
  issues: RollupIssue[];
  assumptions: RollupAssumption[];
};

const RANK: Record<Severity, number> = { green: 0, amber: 1, red: 2 };
const worse = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);

function tally(rags: Severity[]): Totals {
  const counts: RagCounts = { green: 0, amber: 0, red: 0 };
  for (const r of rags) counts[r]++;
  return { ...counts, total: rags.length };
}
const atRiskCount = (t: Totals): number => t.amber + t.red;

export function rollUp(input: RollupInput): DashboardPayload {
  const {
    program, deliverables, edgeRags, teams,
    downstreamCount, cycleCount, risks, issues, assumptions,
  } = input;

  const deliverableTotals = tally(deliverables.map((d) => d.effectiveRag));
  const dependencyTotals = tally(edgeRags);
  const programRag = deliverables.reduce<Severity>(
    (acc, d) => worse(acc, d.effectiveRag),
    "green",
  );

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const healthById = new Map<string, TeamHealth>();
  for (const t of teams) {
    healthById.set(t.id, {
      teamId: t.id, name: t.name, color: t.color,
      rag: "green", counts: { green: 0, amber: 0, red: 0 }, total: 0,
    });
  }
  for (const d of deliverables) {
    const h = healthById.get(d.owningTeamId);
    if (!h) continue;
    h.counts[d.effectiveRag]++;
    h.total++;
    h.rag = worse(h.rag, d.effectiveRag);
  }
  const teamsHealth = [...healthById.values()].sort(
    (a, b) =>
      RANK[b.rag] - RANK[a.rag] ||
      b.counts.red - a.counts.red ||
      a.name.localeCompare(b.name),
  );

  const topBlockers: TopBlocker[] = deliverables
    .filter((d) => d.effectiveRag !== "green" && (downstreamCount[d.id] ?? 0) > 0)
    .map((d) => ({
      deliverableId: d.id,
      title: d.title,
      teamName: teamById.get(d.owningTeamId)?.name ?? "—",
      effectiveRag: d.effectiveRag,
      downstreamCount: downstreamCount[d.id] ?? 0,
      reasons: d.reasons,
    }))
    .sort((a, b) => b.downstreamCount - a.downstreamCount || a.title.localeCompare(b.title))
    .slice(0, 5);

  const openRisks = risks.filter((r) => r.status === "open");
  const raid: RaidSummary = {
    risks: {
      open: openRisks.length,
      mitigating: risks.filter((r) => r.status === "mitigating").length,
      closed: risks.filter((r) => r.status === "closed").length,
      topOpenByScore: [...openRisks]
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, 3)
        .map((r) => ({ title: r.title, score: r.score, teamName: r.teamName })),
    },
    issues: {
      open: issues.filter((i) => i.status === "open").length,
      inProgress: issues.filter((i) => i.status === "in_progress").length,
      resolved: issues.filter((i) => i.status === "resolved").length,
      bySeverity: issues
        .filter((i) => i.status !== "resolved")
        .reduce(
          (acc, i) => {
            acc[i.severity]++;
            return acc;
          },
          { low: 0, medium: 0, high: 0, critical: 0 },
        ),
    },
    assumptions: {
      unvalidated: assumptions.filter((a) => a.validationStatus === "unvalidated").length,
      validated: assumptions.filter((a) => a.validationStatus === "validated").length,
      invalidated: assumptions.filter((a) => a.validationStatus === "invalidated").length,
    },
  };

  return {
    program,
    programRag,
    deliverableTotals,
    dependencyTotals,
    atRisk: {
      deliverables: atRiskCount(deliverableTotals),
      dependencies: atRiskCount(dependencyTotals),
      cycles: cycleCount,
    },
    teams: teamsHealth,
    topBlockers,
    raid,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test convex/model/rollups.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/model/rollups.ts convex/model/rollups.test.ts
git commit -m "feat: add pure rollUp dashboard aggregation"
```

---

## Task 4: `dashboard.get` query + integration test

Wire the pieces: load graph → `toAnalysisGraph` → `computeCascade` + `downstreamReach` → map docs to plain roll-up inputs → `rollUp`. Integration test asserts known values from the seed.

**Files:**
- Create: `convex/dashboard.ts`
- Test: `convex/dashboard.test.ts`

**Interfaces:**
- Consumes: `loadActiveProgramGraph`, `toAnalysisGraph` (Task 1); `computeCascade`, `downstreamReach` (Task 2); `rollUp` + input types (Task 3); `riskScore` (existing `model/derived`).
- Produces: `api.dashboard.get` returning `DashboardPayload`.

- [ ] **Step 1: Write the failing integration test**

Create `convex/dashboard.test.ts`:

```ts
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

  // Top blockers: at-risk deliverables with downstream blocking reach > 0,
  // ranked by count desc then title asc.
  expect(d.topBlockers.map((b) => b.title)).toEqual([
    "Checkout API",     // reaches In-App Purchase, App Store Release (2)
    "Reporting Service", // reaches Data Pipeline, Analytics Dashboard (2)
    "Data Pipeline",     // reaches Analytics Dashboard (1)
    "In-App Purchase",   // reaches App Store Release (1)
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test convex/dashboard.test.ts`
Expected: FAIL — cannot find `api.dashboard.get`.

- [ ] **Step 3: Implement `dashboard.ts`**

Create `convex/dashboard.ts`:

```ts
import { query } from "./_generated/server";
import { loadActiveProgramGraph, toAnalysisGraph } from "./model/graphData";
import { computeCascade, downstreamReach } from "./model/graphAnalysis";
import { rollUp } from "./model/rollups";
import { riskScore } from "./model/derived";

// Program health roll-up. Reuses the SAME cascade the graph view runs
// (ADR-0006: all derived, nothing persisted), then aggregates via the pure
// rollUp helper. Single reactive query — no per-card fan-out.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const graph = await loadActiveProgramGraph(ctx);
    if (!graph) {
      return rollUp({
        program: null, deliverables: [], edgeRags: [], teams: [],
        downstreamCount: {}, cycleCount: 0, risks: [], issues: [], assumptions: [],
      });
    }
    const { program, teamById, deliverableById, edges: inProgramEdges } = graph;

    const { analysisNodes, analysisEdges, renderEdges } = toAnalysisGraph(
      deliverableById,
      inProgramEdges,
    );
    const { nodeStates, edgeStates, cycles } = computeCascade(
      analysisNodes,
      analysisEdges,
      Date.now(),
    );
    const downstreamCount = downstreamReach(analysisNodes, analysisEdges);

    const deliverables = [...deliverableById.values()].map((d) => ({
      id: d._id,
      title: d.title,
      owningTeamId: d.owningTeamId,
      effectiveRag: nodeStates[d._id]?.effectiveRag ?? "green",
      reasons: nodeStates[d._id]?.reasons ?? [],
    }));
    const edgeRags = renderEdges.map((e) => edgeStates[e._id]?.effectiveRag ?? e.rag);
    const teams = [...teamById.values()].map((t) => ({
      id: t._id, name: t.name, color: t.color,
    }));

    const riskDocs = await ctx.db
      .query("risks")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    const risks = riskDocs.map((r) => ({
      score: riskScore(r.probability, r.impact),
      status: r.status,
      title: r.title,
      teamName: teamById.get(r.owningTeamId)?.name ?? "—",
    }));

    const issueDocs = await ctx.db
      .query("issues")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    const issues = issueDocs.map((i) => ({ status: i.status, severity: i.severity }));

    const assumptionDocs = await ctx.db
      .query("assumptions")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    const assumptions = assumptionDocs.map((a) => ({ validationStatus: a.validationStatus }));

    return rollUp({
      program: { name: program.name, status: program.status },
      deliverables,
      edgeRags,
      teams,
      downstreamCount,
      cycleCount: cycles.length,
      risks,
      issues,
      assumptions,
    });
  },
});
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test convex/dashboard.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Full backend suite + typecheck**

Run: `pnpm test && pnpm build`
Expected: all tests pass; build (which typechecks the Convex deploy) succeeds.

- [ ] **Step 6: Commit**

```bash
git add convex/dashboard.ts convex/dashboard.test.ts
git commit -m "feat: add dashboard.get roll-up query"
```

---

## Task 5: Shared RAG helpers + shadcn Card

Relocate `RAG_STROKE` into a shared `lib/rag.ts` (so the dashboard reuses the graph's exact colors without importing a graph component) and add the shadcn `Card` primitive.

**Files:**
- Create: `lib/rag.ts`
- Modify: `components/graph/dependency-edge.tsx:11-15`
- Create (via shadcn): `components/ui/card.tsx`

**Interfaces:**
- Produces: `Severity`, `RAG_STROKE`, `RAG_LABEL`, `RAG_DOT`, `RAG_ORDER` from `@/lib/rag`.

- [ ] **Step 1: Create `lib/rag.ts`**

```ts
// Shared RAG (Red/Amber/Green) presentation tokens. Colors match the graph's
// edge/marker strokes so the graph and dashboard read as one system.
export type Severity = "green" | "amber" | "red";

export const RAG_STROKE: Record<Severity, string> = {
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
};

export const RAG_LABEL: Record<Severity, string> = {
  green: "On track",
  amber: "At risk",
  red: "Critical",
};

// Tailwind background classes for RAG dots/pills (theme-aware via the palette).
export const RAG_DOT: Record<Severity, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export const RAG_ORDER: Record<Severity, number> = { green: 0, amber: 1, red: 2 };
```

- [ ] **Step 2: Re-point `dependency-edge.tsx` at the shared constant**

In `components/graph/dependency-edge.tsx`, replace the inline declaration (currently `export const RAG_STROKE: Record<"green" | "amber" | "red", string> = { ... };`) with a re-export so existing importers (`dependency-graph.tsx`, `node-inspector-panel.tsx`, `graph-legend.tsx`) keep working unchanged:

```ts
export { RAG_STROKE } from "@/lib/rag";
```

- [ ] **Step 3: Add the shadcn Card component**

Run: `pnpm dlx shadcn@latest add card`
Expected: creates `components/ui/card.tsx` (exports `Card`, `CardHeader`, `CardTitle`, `CardContent`, etc.).

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm build && pnpm lint`
Expected: builds and lints clean; the graph still compiles against the re-exported `RAG_STROKE`.

- [ ] **Step 5: Commit**

```bash
git add lib/rag.ts components/graph/dependency-edge.tsx components/ui/card.tsx
git commit -m "feat: shared RAG tokens in lib/rag + add shadcn Card"
```

---

## Task 6: Dashboard UI components + client container

Build the presentational pieces and the client container that subscribes to `dashboard.get`. No component-test harness exists in this repo (tests are Convex-only), so verification here is typecheck + lint; visual/reactive verification happens in Task 7.

**Before writing the stat tiles, load the `dataviz` skill** (`Skill: dataviz`) and follow it for the RAG-total tiles / KPI row so the numbers read as one accessible system in light and dark. Use the `RAG_DOT`/`RAG_STROKE` tokens from `lib/rag` as the categorical RAG colors.

**Files:**
- Create: `components/dashboard/program-banner.tsx`
- Create: `components/dashboard/stat-tiles.tsx`
- Create: `components/dashboard/team-health-table.tsx`
- Create: `components/dashboard/top-blockers.tsx`
- Create: `components/dashboard/raid-summary.tsx`
- Create: `components/dashboard/dashboard-view.tsx`

**Interfaces:**
- Consumes: `api.dashboard.get` (Task 4); `Card` (Task 5); `Badge`, `Table` (existing); `RAG_DOT`, `RAG_LABEL` (Task 5).
- Produces: `<DashboardView preloaded={...} />` for the page (Task 7).

All components derive their prop types from the query return type so they never drift from the payload:

- [ ] **Step 1: Load the dataviz skill**

Invoke `Skill: dataviz` and keep its guidance in mind for Steps 3 (stat tiles) and the RAG breakdowns.

- [ ] **Step 2: `program-banner.tsx`**

```tsx
import { type FunctionReturnType } from "convex/server";
import { type api } from "@/convex/_generated/api";
import { RAG_DOT, RAG_LABEL } from "@/lib/rag";
import { cn } from "@/lib/utils";

type Dashboard = FunctionReturnType<typeof api.dashboard.get>;

export function ProgramBanner({
  program,
  programRag,
  atRisk,
}: {
  program: NonNullable<Dashboard["program"]>;
  programRag: Dashboard["programRag"];
  atRisk: Dashboard["atRisk"];
}) {
  const bits = [
    `${atRisk.deliverables} deliverable${atRisk.deliverables === 1 ? "" : "s"} at risk`,
    atRisk.cycles > 0 && `${atRisk.cycles} cycle${atRisk.cycles === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
      <div>
        <h1 className="text-2xl font-semibold">{program.name}</h1>
        <p className="text-sm text-muted-foreground">{bits.join(" · ")}</p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium">
        <span className={cn("size-2.5 rounded-full", RAG_DOT[programRag])} />
        {RAG_LABEL[programRag]}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: `stat-tiles.tsx`** (apply dataviz guidance for the RAG breakdown)

```tsx
import { type FunctionReturnType } from "convex/server";
import { type api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { RAG_DOT } from "@/lib/rag";
import { cn } from "@/lib/utils";

type Dashboard = FunctionReturnType<typeof api.dashboard.get>;
type Totals = Dashboard["deliverableTotals"];

function RagBar({ totals }: { totals: Totals }) {
  return (
    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
      {(["red", "amber", "green"] as const).map((rag) => (
        <span key={rag} className="inline-flex items-center gap-1">
          <span className={cn("size-2 rounded-full", RAG_DOT[rag])} />
          {totals[rag]}
        </span>
      ))}
    </div>
  );
}

function Tile({ label, value, children }: { label: string; value: number; children?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
        {children}
      </CardContent>
    </Card>
  );
}

export function StatTiles({
  deliverableTotals,
  dependencyTotals,
  atRisk,
}: {
  deliverableTotals: Dashboard["deliverableTotals"];
  dependencyTotals: Dashboard["dependencyTotals"];
  atRisk: Dashboard["atRisk"];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Deliverables" value={deliverableTotals.total}>
        <RagBar totals={deliverableTotals} />
      </Tile>
      <Tile label="Dependencies" value={dependencyTotals.total}>
        <RagBar totals={dependencyTotals} />
      </Tile>
      <Tile label="At risk" value={atRisk.deliverables + atRisk.dependencies} />
      <Tile label="Cycles" value={atRisk.cycles} />
    </div>
  );
}
```

- [ ] **Step 4: `team-health-table.tsx`**

```tsx
import { type FunctionReturnType } from "convex/server";
import { type api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RAG_DOT, RAG_LABEL } from "@/lib/rag";
import { cn } from "@/lib/utils";

type Dashboard = FunctionReturnType<typeof api.dashboard.get>;

export function TeamHealthTable({ teams }: { teams: Dashboard["teams"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per-team health</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Health</TableHead>
              <TableHead className="text-right">R / A / G</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.teamId}>
                <TableCell className="flex items-center gap-2 font-medium">
                  <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-full", RAG_DOT[t.rag])} />
                    {RAG_LABEL[t.rag]}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {t.counts.red} / {t.counts.amber} / {t.counts.green}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: `top-blockers.tsx`**

```tsx
import { type FunctionReturnType } from "convex/server";
import { type api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RAG_DOT } from "@/lib/rag";
import { cn } from "@/lib/utils";

type Dashboard = FunctionReturnType<typeof api.dashboard.get>;

export function TopBlockers({ blockers }: { blockers: Dashboard["topBlockers"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top blockers</CardTitle>
      </CardHeader>
      <CardContent>
        {blockers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing at risk is blocking downstream work.</p>
        ) : (
          <ol className="space-y-3">
            {blockers.map((b) => (
              <li key={b.deliverableId} className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <span className={cn("size-2 rounded-full", RAG_DOT[b.effectiveRag])} />
                    {b.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {b.teamName}
                    {b.reasons.length > 0 && ` · ${b.reasons.join(", ")}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-semibold tabular-nums">{b.downstreamCount}</div>
                  <div className="text-xs text-muted-foreground">downstream</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: `raid-summary.tsx`**

```tsx
import { type FunctionReturnType } from "convex/server";
import { type api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Dashboard = FunctionReturnType<typeof api.dashboard.get>;
type Raid = Dashboard["raid"];

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function RaidSummary({ raid }: { raid: Raid }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="text-base">Risks</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          <Stat label="Open" value={raid.risks.open} />
          <Stat label="Mitigating" value={raid.risks.mitigating} />
          <Stat label="Closed" value={raid.risks.closed} />
          {raid.risks.topOpenByScore.length > 0 && (
            <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
              Highest score: {raid.risks.topOpenByScore[0].title} ({raid.risks.topOpenByScore[0].score})
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Issues</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          <Stat label="Open" value={raid.issues.open} />
          <Stat label="In progress" value={raid.issues.inProgress} />
          <Stat label="Critical (active)" value={raid.issues.bySeverity.critical} />
          <Stat label="High (active)" value={raid.issues.bySeverity.high} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Assumptions</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          <Stat label="Unvalidated" value={raid.assumptions.unvalidated} />
          <Stat label="Invalidated" value={raid.assumptions.invalidated} />
          <Stat label="Validated" value={raid.assumptions.validated} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: `dashboard-view.tsx`** (client container)

```tsx
"use client";

import { type Preloaded, usePreloadedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ProgramBanner } from "./program-banner";
import { StatTiles } from "./stat-tiles";
import { TeamHealthTable } from "./team-health-table";
import { TopBlockers } from "./top-blockers";
import { RaidSummary } from "./raid-summary";

export function DashboardView({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.dashboard.get>;
}) {
  const data = usePreloadedQuery(preloaded);

  if (!data.program) {
    return (
      <p className="text-sm text-muted-foreground">
        No active program. Seed the database to populate the dashboard.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ProgramBanner program={data.program} programRag={data.programRag} atRisk={data.atRisk} />
      <StatTiles
        deliverableTotals={data.deliverableTotals}
        dependencyTotals={data.dependencyTotals}
        atRisk={data.atRisk}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <TeamHealthTable teams={data.teams} />
        <TopBlockers blockers={data.topBlockers} />
      </div>
      <RaidSummary raid={data.raid} />
    </div>
  );
}
```

- [ ] **Step 8: Typecheck + lint**

Run: `pnpm build && pnpm lint`
Expected: compiles clean (prop types resolve against the query return type).

- [ ] **Step 9: Commit**

```bash
git add components/dashboard
git commit -m "feat: dashboard UI components and client container"
```

---

## Task 7: `/dashboard` page, routing, sidebar + verification

Add the route, make it the landing page, put it first in the sidebar, then verify end-to-end against the running app.

**Files:**
- Create: `app/(app)/dashboard/page.tsx`
- Modify: `app/page.tsx`
- Modify: `components/app-sidebar.tsx:10-18`

**Interfaces:**
- Consumes: `DashboardView` (Task 6); `api.dashboard.get` (Task 4).

- [ ] **Step 1: Create the page**

Create `app/(app)/dashboard/page.tsx`:

```tsx
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const preloaded = await preloadQuery(api.dashboard.get, {});
  return <DashboardView preloaded={preloaded} />;
}
```

- [ ] **Step 2: Make `/dashboard` the landing page**

Replace the body of `app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 3: Add "Dashboard" first in the sidebar**

In `components/app-sidebar.tsx`, update the `NAV` array so Dashboard is first:

```ts
const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/graph", label: "Graph" },
  { href: "/deliverables", label: "Deliverables" },
  { href: "/dependencies", label: "Dependencies" },
  { href: "/risks", label: "Risks" },
  { href: "/assumptions", label: "Assumptions" },
  { href: "/issues", label: "Issues" },
  { href: "/teams", label: "Teams" },
];
```

- [ ] **Step 4: Full check**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all green.

- [ ] **Step 5: Verify in the running app**

Ensure `pnpm dev` is running (starts Convex backend + Next.js on http://localhost:3000). If the DB is empty, seed it: `pnpm exec convex run seed:run`.

Using the browser tooling (see memory: install `vercel-labs/agent-browser` if not present, or use the `claude-in-chrome` MCP), drive `http://localhost:3000/`:
- Confirm `/` redirects to `/dashboard` and the sidebar shows "Dashboard" first and active.
- Confirm the banner reads "Q3 Platform Launch", a red program pill, "6 deliverables at risk · 1 cycle".
- Confirm stat tiles (Deliverables 9 with 6/0/3, Dependencies 8, At risk, Cycles 1), per-team health worst-first, Top Blockers listing Checkout API / Reporting Service at the top, and the RAID cards.
- **Reactivity check:** in another view or via `pnpm exec convex run` set a currently-green deliverable to `blocked` (e.g. mark "API Gateway" blocked through the graph inspector), and confirm the dashboard totals, per-team health, and Top Blockers update **live** without a reload.
- Capture a screenshot for the case study.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" app/page.tsx components/app-sidebar.tsx
git commit -m "feat: dashboard route as landing page + sidebar entry"
```

---

## Final: land the phase

- [ ] Open a self-reviewed PR for `feat/dashboard`; squash-merge with `--delete-branch`.
- [ ] `git checkout main && git pull` to resync (keep local `main` in lockstep with origin).
- [ ] Tag `v0.4.0` for the Phase 4 landing.
- [ ] Update the memory note that gated "install agent-browser when UI lands" now that the dashboard exists.

---

## Self-Review

**Spec coverage:**
- Program RAG banner + headline → Task 6 `ProgramBanner`, computed in Task 3/4. ✅
- Deliverable + dependency RAG totals → `deliverableTotals`/`dependencyTotals` (Task 3), tiles (Task 6). ✅
- At-risk counts (deliverables, dependencies, cycles) → `atRisk` (Task 3/4), tiles (Task 6). ✅
- Per-team health, worst-first → `teamsHealth` (Task 3), `TeamHealthTable` (Task 6). ✅
- Top Blockers by blast radius → `downstreamReach` (Task 2) + `topBlockers` (Task 3) + `TopBlockers` (Task 6). ✅
- RAID summary → `raid` (Task 3), `RaidSummary` (Task 6). ✅
- Shared cascade engine reuse → Task 1 + Task 4. ✅
- `/dashboard` as landing page + sidebar → Task 7. ✅
- Reuse graph RAG colors → Task 5 `lib/rag`. ✅
- Pure model + thin query pattern, single reactive query → Tasks 3/4. ✅
- Empty-program handling → Task 3 test + Task 4 test + `DashboardView` guard. ✅
- Tests (pure rollups + downstreamReach + integration) → Tasks 2/3/4. ✅

**Placeholder scan:** No TBD/TODO; every code step is complete. ✅

**Type consistency:** `toAnalysisGraph` (Task 1) → consumed identically in Task 4. `downstreamReach` returns `Record<string, number>` (Task 2) → passed as `downstreamCount` (Task 3/4). `DashboardPayload` field names (Task 3) match the UI prop derivations via `FunctionReturnType` (Task 6). `Severity` sourced once from `graphAnalysis` and re-exported via `lib/rag`. ✅
