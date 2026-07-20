# Phase 3 — Cascade Analysis + Cycle Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cascade (downstream impact) analysis and cycle detection over the dependency graph, derived at read time, surfaced as effective-RAG coloring + a cycle banner + a transitive node inspector, plus one minimal mutation pair so the cascade re-colors live.

**Architecture:** Two pure, `ctx`-free TypeScript functions (`detectCycles`, `computeCascade`) live in `convex/model/graph-analysis.ts` and are unit-tested in isolation (ADR-0004). The `graph.get` query runs them over the active-program graph (loaded via a new shared helper) and returns `effectiveRag` + `reasons` per node/edge and a top-level `cycles` list — nothing persisted (ADR-0006). The React Flow UI colors by `effectiveRag`, shows a cycle banner, and lets a user flip a deliverable's status / an edge's RAG through two new mutations, watching the graph re-color via Convex reactivity.

**Tech Stack:** Convex (queries/mutations, `convex-test` + Vitest), Next.js App Router, `@xyflow/react` v12, TypeScript, Tailwind + shadcn/ui, pnpm.

## Global Constraints

- Package manager is **pnpm**; never introduce npm/yarn. Node 20.9+.
- **No schema changes** in this phase; **never persist** derived values (`effectiveRag`, `reasons`, `cycles`, `slackDays`, risk `score`) — ADR-0006 / CLAUDE.md invariant.
- Dates are **Unix-ms numbers** (`v.number()`), never strings/Date objects.
- Graph traversal uses **app-code over the `by_provider` / `by_consumer` indexes** — no other persistence layer (ADR-0004 / invariant).
- Dependencies stay **provider→consumer edges between deliverable nodes** — do not remodel.
- Convex reactive hooks (`useQuery`/`useMutation`) run **only in client components** (`"use client"`).
- Mutations **enforce integrity via schema validators** and **write a `statusChanges` row when a tracked field changes** (CLAUDE.md convention).
- Convex test files (`convex/*.test.ts`) start with `/// <reference types="vite/client" />` and use `const modules = import.meta.glob("./**/*.ts")`. Do not remove the `convex/tsconfig.json` test exclude.
- Gate the phase on `pnpm test` && `pnpm lint` && `pnpm build`, all green, before completion.
- Work happens on branch `feat/cascade-cycle-detection` (already created). Commit after every task.

---

## File Structure

**New files:**
- `convex/model/graph-analysis.ts` — pure `detectCycles` + `computeCascade` and their types.
- `convex/model/graph-analysis.test.ts` — Vitest unit tests for the two pure functions.
- `convex/model/graph-data.ts` — `loadActiveProgramGraph(ctx)` shared loader (folds in a Phase-2 DRY follow-up).
- `lib/graph-traverse.ts` — pure `downstreamOf` / `upstreamOf` transitive reachability for the inspector.
- `lib/graph-traverse.test.ts` — Vitest unit tests for reachability.
- `components/graph/cycle-banner.tsx` — the cycle warning banner.

**Modified files:**
- `convex/graph.ts` — load via helper, run analysis, add `effectiveRag`/`reasons`/`cycles`, trim 4 unused denormalized edge fields.
- `convex/graph.test.ts` — assert effective RAG / cycles / reasons; drop the denormalized-field assertion.
- `convex/deliverables.ts` — refactor `list` onto the loader; add `setStatus` mutation.
- `convex/dependencies.ts` — refactor `list` onto the loader; add `setRag` mutation.
- `convex/deliverables.test.ts` — tests for `setStatus`.
- `convex/dependencies.test.ts` — tests for `setRag`.
- `components/graph/deliverable-node.tsx` — ring by `effectiveRag`; dashed ring for cycle members.
- `components/graph/dependency-edge.tsx` — stroke by `effectiveRag`.
- `components/graph/node-inspector-panel.tsx` — transitive impact list + reasons + status select + per-edge RAG select (presentational).
- `components/graph/dependency-graph.tsx` — plumb effective RAG / cycles / transitive sets / mutations; render banner.
- `docs/ROADMAP.md` optional note; git tag `v0.3.0` at the end.

---

## Task 1: Pure cycle detection

**Files:**
- Create: `convex/model/graph-analysis.ts`
- Test: `convex/model/graph-analysis.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types `Severity = "green" | "amber" | "red"`, `AnalysisNode = { id: string; title: string; status: "not_started" | "in_progress" | "blocked" | "done"; targetDate?: number }`, `AnalysisEdge = { id: string; source: string; target: string; rag: Severity; isBlocking: boolean; slackDays: number | null }`, `Cycle = { deliverableIds: string[]; edgeIds: string[] }`.
  - `detectCycles(nodes: AnalysisNode[], edges: AnalysisEdge[]): Cycle[]` — one `Cycle` per distinct member-set; `source` is provider, `target` is consumer; handles self-loops and disjoint cycles; `[]` when acyclic.

- [ ] **Step 1: Write the failing test**

Create `convex/model/graph-analysis.test.ts`:

```typescript
/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { detectCycles, type AnalysisNode, type AnalysisEdge } from "./graph-analysis";

const node = (id: string, over: Partial<AnalysisNode> = {}): AnalysisNode => ({
  id,
  title: id,
  status: "in_progress",
  ...over,
});
const edge = (
  id: string,
  source: string,
  target: string,
  over: Partial<AnalysisEdge> = {},
): AnalysisEdge => ({
  id,
  source,
  target,
  rag: "green",
  isBlocking: true,
  slackDays: null,
  ...over,
});

test("detectCycles finds a 3-node cycle and names its members", () => {
  const nodes = [node("a"), node("b"), node("c")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "c", "a")];
  const cycles = detectCycles(nodes, edges);
  expect(cycles).toHaveLength(1);
  expect([...cycles[0].deliverableIds].sort()).toEqual(["a", "b", "c"]);
  expect([...cycles[0].edgeIds].sort()).toEqual(["e1", "e2", "e3"]);
});

test("detectCycles returns [] for an acyclic chain", () => {
  const nodes = [node("a"), node("b"), node("c")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c")];
  expect(detectCycles(nodes, edges)).toEqual([]);
});

test("detectCycles finds a self-loop as a single-node cycle", () => {
  const nodes = [node("a")];
  const edges = [edge("e1", "a", "a")];
  const cycles = detectCycles(nodes, edges);
  expect(cycles).toHaveLength(1);
  expect(cycles[0].deliverableIds).toEqual(["a"]);
});

test("detectCycles finds two disjoint cycles", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => node(id));
  const edges = [
    edge("e1", "a", "b"),
    edge("e2", "b", "a"),
    edge("e3", "c", "d"),
    edge("e4", "d", "c"),
  ];
  const cycles = detectCycles(nodes, edges);
  expect(cycles).toHaveLength(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- graph-analysis`
Expected: FAIL — cannot resolve `./graph-analysis` / `detectCycles is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `convex/model/graph-analysis.ts`:

```typescript
// Pure graph analysis — cycle detection + cascade propagation. No Convex ctx,
// so these unit-test in isolation (ADR-0004). Nothing here is persisted (ADR-0006).

export type Severity = "green" | "amber" | "red";

export type AnalysisNode = {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "done";
  targetDate?: number;
};

// source = provider deliverable, target = consumer deliverable.
export type AnalysisEdge = {
  id: string;
  source: string;
  target: string;
  rag: Severity;
  isBlocking: boolean;
  slackDays: number | null;
};

export type Cycle = { deliverableIds: string[]; edgeIds: string[] };

const RANK: Record<Severity, number> = { green: 0, amber: 1, red: 2 };
const maxSev = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);
// A non-blocking edge softens the risk that crosses it by one level.
const soften = (s: Severity): Severity => (s === "red" ? "amber" : "green");

// Standard white/grey/black DFS. A back-edge (to a grey node still on the
// current path) closes a cycle; we recover its members from the path stack.
export function detectCycles(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
): Cycle[] {
  const out = new Map<string, AnalysisEdge[]>();
  for (const n of nodes) out.set(n.id, []);
  for (const e of edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e);
  }

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of out.keys()) color.set(id, WHITE);

  const cycles: Cycle[] = [];
  const seen = new Set<string>();
  const pathNodes: string[] = [];
  const pathEdges: (AnalysisEdge | null)[] = []; // edge used to enter pathNodes[i]

  const visit = (u: string, via: AnalysisEdge | null): void => {
    color.set(u, GREY);
    pathNodes.push(u);
    pathEdges.push(via);

    for (const e of out.get(u) ?? []) {
      const v = e.target;
      if (!color.has(v)) continue;
      if (color.get(v) === GREY) {
        const start = pathNodes.indexOf(v);
        const cycleNodes = pathNodes.slice(start);
        const cycleEdges = pathEdges
          .slice(start + 1)
          .filter((x): x is AnalysisEdge => x !== null);
        cycleEdges.push(e);
        const key = [...cycleNodes].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push({
            deliverableIds: cycleNodes,
            edgeIds: cycleEdges.map((x) => x.id),
          });
        }
      } else if (color.get(v) === WHITE) {
        visit(v, e);
      }
    }

    color.set(u, BLACK);
    pathNodes.pop();
    pathEdges.pop();
  };

  for (const id of out.keys()) {
    if (color.get(id) === WHITE) visit(id, null);
  }
  return cycles;
}

// Helpers exported for computeCascade (Task 2) in the same file.
export const _sev = { RANK, maxSev, soften };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- graph-analysis`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/model/graph-analysis.ts convex/model/graph-analysis.test.ts
git commit -m "feat(graph): pure cycle detection over the dependency graph"
```

---

## Task 2: Pure cascade computation

**Files:**
- Modify: `convex/model/graph-analysis.ts`
- Test: `convex/model/graph-analysis.test.ts`

**Interfaces:**
- Consumes: `AnalysisNode`, `AnalysisEdge`, `Cycle`, `Severity`, `detectCycles`, `_sev` from Task 1.
- Produces:
  - `ItemState = { effectiveRag: Severity; reasons: string[] }`.
  - `CascadeResult = { nodeStates: Record<string, ItemState>; edgeStates: Record<string, ItemState>; cycles: Cycle[] }`.
  - `computeCascade(nodes: AnalysisNode[], edges: AnalysisEdge[], now: number): CascadeResult`.
  - Rules: node intrinsic — `blocked`/cycle-member → red, `overdue` (not done && `targetDate < now`) → amber. Edge intrinsic — `rag==="red"` → red, `slackDays<0` → amber. A node's effective RAG = max(intrinsic, max over incoming edges of transmitted risk). Transmitted = `soften`-if-non-blocking of `max(providerEffective, edgeIntrinsic)`. Edge effective (display) = `max(edgeIntrinsic, soften-if-non-blocking(providerEffective))`.

- [ ] **Step 1: Write the failing test**

Append to `convex/model/graph-analysis.test.ts` (reuses the `node`/`edge` helpers already in the file):

```typescript
import { computeCascade } from "./graph-analysis";

test("computeCascade propagates a blocked node red down a blocking chain", () => {
  const nodes = [node("a", { status: "blocked" }), node("b"), node("c")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c")];
  const { nodeStates } = computeCascade(nodes, edges, 0);
  expect(nodeStates["a"].effectiveRag).toBe("red");
  expect(nodeStates["b"].effectiveRag).toBe("red");
  expect(nodeStates["c"].effectiveRag).toBe("red");
  expect(nodeStates["a"].reasons).toContain("blocked");
  expect(nodeStates["c"].reasons).toContain("depends on at-risk: b");
});

test("computeCascade softens risk one level across a non-blocking edge", () => {
  const nodes = [node("a", { status: "blocked" }), node("b")];
  const edges = [edge("e1", "a", "b", { isBlocking: false })];
  const { nodeStates } = computeCascade(nodes, edges, 0);
  expect(nodeStates["a"].effectiveRag).toBe("red");
  expect(nodeStates["b"].effectiveRag).toBe("amber");
});

test("computeCascade takes the max severity when paths converge (diamond)", () => {
  const nodes = [node("a", { status: "blocked" }), node("b"), node("d"), node("e")];
  const edges = [
    edge("e1", "a", "b"), // blocking: b red
    edge("e2", "a", "d", { isBlocking: false }), // soft: d amber
    edge("e3", "b", "e"), // blocking: carries red
    edge("e4", "d", "e", { isBlocking: false }), // soft: carries green
  ];
  const { nodeStates } = computeCascade(nodes, edges, 0);
  expect(nodeStates["d"].effectiveRag).toBe("amber");
  expect(nodeStates["e"].effectiveRag).toBe("red");
});

test("computeCascade terminates on a cycle and marks members red", () => {
  const nodes = [node("a"), node("b"), node("c")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "c", "a")];
  const { nodeStates, cycles } = computeCascade(nodes, edges, 0);
  expect(cycles).toHaveLength(1);
  for (const id of ["a", "b", "c"]) {
    expect(nodeStates[id].effectiveRag).toBe("red");
    expect(nodeStates[id].reasons).toContain("cycle member");
  }
});

test("computeCascade flags overdue and negative-slack as amber sources", () => {
  const nodes = [node("a", { status: "in_progress", targetDate: 5 }), node("b")];
  const edges = [edge("e1", "a", "b", { slackDays: -3 })];
  const { nodeStates, edgeStates } = computeCascade(nodes, edges, 10);
  expect(nodeStates["a"].effectiveRag).toBe("amber"); // overdue: targetDate 5 < now 10
  expect(nodeStates["a"].reasons).toContain("overdue");
  expect(edgeStates["e1"].effectiveRag).toBe("amber"); // negative slack
  expect(edgeStates["e1"].reasons).toContain("negative slack (-3d)");
});

test("computeCascade shows a green edge as red when its provider is blocked", () => {
  const nodes = [node("a", { status: "blocked" }), node("b")];
  const edges = [edge("e1", "a", "b")]; // rag green, blocking
  const { edgeStates } = computeCascade(nodes, edges, 0);
  expect(edgeStates["e1"].effectiveRag).toBe("red");
  expect(edgeStates["e1"].reasons).toContain("provider at risk: a");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- graph-analysis`
Expected: FAIL — `computeCascade is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `convex/model/graph-analysis.ts`:

```typescript
export type ItemState = { effectiveRag: Severity; reasons: string[] };

export type CascadeResult = {
  nodeStates: Record<string, ItemState>;
  edgeStates: Record<string, ItemState>;
  cycles: Cycle[];
};

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export function computeCascade(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  now: number,
): CascadeResult {
  const { RANK, maxSev, soften } = _sev;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const cycles = detectCycles(nodes, edges);
  const cycleMembers = new Set(cycles.flatMap((c) => c.deliverableIds));

  // Intrinsic (self) severities.
  const nodeIntrinsic = new Map<string, Severity>();
  const nodeReasons = new Map<string, string[]>();
  for (const n of nodes) {
    let sev: Severity = "green";
    const reasons: string[] = [];
    if (n.status === "blocked") {
      sev = "red";
      reasons.push("blocked");
    }
    if (cycleMembers.has(n.id)) {
      sev = "red";
      reasons.push("cycle member");
    }
    if (n.status !== "done" && n.targetDate !== undefined && n.targetDate < now) {
      sev = maxSev(sev, "amber");
      reasons.push("overdue");
    }
    nodeIntrinsic.set(n.id, sev);
    nodeReasons.set(n.id, reasons);
  }

  const edgeIntrinsic = new Map<string, Severity>();
  const edgeReasons = new Map<string, string[]>();
  for (const e of edges) {
    let sev: Severity = "green";
    const reasons: string[] = [];
    if (e.rag === "red") {
      sev = "red";
      reasons.push("manually red");
    }
    if (e.slackDays !== null && e.slackDays < 0) {
      sev = maxSev(sev, "amber");
      reasons.push(`negative slack (${e.slackDays}d)`);
    }
    edgeIntrinsic.set(e.id, sev);
    edgeReasons.set(e.id, reasons);
  }

  // Fixpoint over node severities. Severities only rise and are capped at red,
  // so this terminates even when the graph has cycles.
  const nodeSev = new Map(nodeIntrinsic);
  const transmitted = (e: AnalysisEdge): Severity => {
    const carried = maxSev(nodeSev.get(e.source) ?? "green", edgeIntrinsic.get(e.id)!);
    return e.isBlocking ? carried : soften(carried);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      const t = transmitted(e);
      const cur = nodeSev.get(e.target) ?? "green";
      if (RANK[t] > RANK[cur]) {
        nodeSev.set(e.target, t);
        changed = true;
      }
    }
  }

  const incoming = new Map<string, AnalysisEdge[]>();
  for (const n of nodes) incoming.set(n.id, []);
  for (const e of edges) incoming.get(e.target)?.push(e);

  const nodeStates: Record<string, ItemState> = {};
  for (const n of nodes) {
    const reasons = [...(nodeReasons.get(n.id) ?? [])];
    for (const e of incoming.get(n.id) ?? []) {
      if (RANK[transmitted(e)] > 0) {
        reasons.push(`depends on at-risk: ${nodeById.get(e.source)?.title ?? e.source}`);
      }
    }
    nodeStates[n.id] = { effectiveRag: nodeSev.get(n.id)!, reasons: uniq(reasons) };
  }

  const edgeStates: Record<string, ItemState> = {};
  for (const e of edges) {
    const providerSev = nodeSev.get(e.source) ?? "green";
    const softenedProvider = e.isBlocking ? providerSev : soften(providerSev);
    const effectiveRag = maxSev(edgeIntrinsic.get(e.id)!, softenedProvider);
    const reasons = [...(edgeReasons.get(e.id) ?? [])];
    if (RANK[providerSev] > 0) {
      reasons.push(`provider at risk: ${nodeById.get(e.source)?.title ?? e.source}`);
    }
    edgeStates[e.id] = { effectiveRag, reasons: uniq(reasons) };
  }

  return { nodeStates, edgeStates, cycles };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- graph-analysis`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/model/graph-analysis.ts convex/model/graph-analysis.test.ts
git commit -m "feat(graph): severity-tiered cascade propagation with attribution"
```

---

## Task 3: Shared active-program-graph loader

**Files:**
- Create: `convex/model/graph-data.ts`
- Modify: `convex/deliverables.ts`, `convex/dependencies.ts`
- Test: existing `convex/graph.test.ts`, `convex/raid.test.ts`, `convex/deliverables.test.ts`, `convex/dependencies.test.ts` must stay green.

**Interfaces:**
- Consumes: `getActiveProgram` from `convex/model/programs`.
- Produces: `loadActiveProgramGraph(ctx: QueryCtx): Promise<null | { program: Doc<"programs">; teamById: Map<Id<"teams">, Doc<"teams">>; deliverableById: Map<Id<"deliverables">, Doc<"deliverables">>; edges: Doc<"dependencies">[] }>`. `edges` are the dependencies whose **provider** is in the active program (same rule as today's `dependencies.list`). Returns `null` when there is no active program.

- [ ] **Step 1: Write the loader**

Create `convex/model/graph-data.ts`:

```typescript
import { QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getActiveProgram } from "./programs";

/**
 * Load the active program's graph in one place: its teams, deliverables (nodes)
 * and the dependency edges whose provider is in the program. Shared by the graph
 * query and the deliverable/dependency list queries so the join/index logic
 * lives once. Returns null when there is no active program.
 */
export async function loadActiveProgramGraph(ctx: QueryCtx): Promise<null | {
  program: Doc<"programs">;
  teamById: Map<Id<"teams">, Doc<"teams">>;
  deliverableById: Map<Id<"deliverables">, Doc<"deliverables">>;
  edges: Doc<"dependencies">[];
}> {
  const program = await getActiveProgram(ctx);
  if (!program) return null;

  const teams = await ctx.db.query("teams").take(500);
  const teamById = new Map(teams.map((t) => [t._id, t]));

  const deliverables = await ctx.db
    .query("deliverables")
    .withIndex("by_program", (q) => q.eq("programId", program._id))
    .take(500);
  const deliverableById = new Map(deliverables.map((d) => [d._id, d]));

  const allEdges = await ctx.db.query("dependencies").take(1000);
  const edges = allEdges.filter((e) => deliverableById.has(e.providerDeliverableId));

  return { program, teamById, deliverableById, edges };
}
```

- [ ] **Step 2: Refactor `deliverables.list` onto the loader**

Replace the body of `convex/deliverables.ts` `list` handler so it uses the loader (keep the returned shape identical):

```typescript
import { query } from "./_generated/server";
import { loadActiveProgramGraph } from "./model/graph-data";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const graph = await loadActiveProgramGraph(ctx);
    if (!graph) return [];
    const { teamById, deliverableById } = graph;

    return [...deliverableById.values()].map((d) => {
      const team = teamById.get(d.owningTeamId);
      return {
        _id: d._id,
        _creationTime: d._creationTime,
        title: d.title,
        description: d.description,
        status: d.status,
        targetDate: d.targetDate,
        actualDate: d.actualDate,
        teamName: team?.name ?? "—",
        teamColor: team?.color ?? "#94a3b8",
      };
    });
  },
});
```

- [ ] **Step 3: Refactor `dependencies.list` onto the loader**

Replace the body of `convex/dependencies.ts` `list` handler (keep the returned shape identical):

```typescript
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { slackDays } from "./model/derived";
import { loadActiveProgramGraph } from "./model/graph-data";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const graph = await loadActiveProgramGraph(ctx);
    if (!graph) return [];
    const { teamById, deliverableById, edges } = graph;

    const teamName = (deliverableId: Id<"deliverables">) => {
      const d = deliverableById.get(deliverableId);
      const team = d ? teamById.get(d.owningTeamId) : undefined;
      return team?.name ?? "—";
    };
    const title = (deliverableId: Id<"deliverables">) =>
      deliverableById.get(deliverableId)?.title ?? "—";

    return edges.map((e) => ({
      _id: e._id,
      _creationTime: e._creationTime,
      description: e.description,
      neededByDate: e.neededByDate,
      committedDate: e.committedDate,
      rag: e.rag,
      isBlocking: e.isBlocking,
      slackDays: slackDays(e.neededByDate, e.committedDate),
      providerTitle: title(e.providerDeliverableId),
      providerTeamName: teamName(e.providerDeliverableId),
      consumerTitle: title(e.consumerDeliverableId),
      consumerTeamName: teamName(e.consumerDeliverableId),
    }));
  },
});
```

- [ ] **Step 4: Run the existing suite to verify no behavior change**

Run: `pnpm test`
Expected: PASS — all existing tests (including `deliverables.list`, `dependencies.list`, `raid.test.ts`, `graph.test.ts`) unchanged.

- [ ] **Step 5: Commit**

```bash
git add convex/model/graph-data.ts convex/deliverables.ts convex/dependencies.ts
git commit -m "refactor(convex): extract loadActiveProgramGraph loader (DRY the joins)"
```

---

## Task 4: Extend `graph.get` with cascade + cycles

**Files:**
- Modify: `convex/graph.ts`
- Test: `convex/graph.test.ts`

**Interfaces:**
- Consumes: `loadActiveProgramGraph` (Task 3), `computeCascade` + types (Task 2), `slackDays` (`model/derived`).
- Produces: `api.graph.get` returns `{ nodes, edges, cycles }` where each `node` is `{ id, title, status, teamName, teamColor, effectiveRag, reasons }`, each `edge` is `{ id, source, target, rag, effectiveRag, reasons, isBlocking, neededByDate, committedDate, slackDays, description }` (the 4 denormalized `*Title`/`*TeamName` fields are removed), and `cycles: { deliverableIds: string[]; edgeIds: string[] }[]`.

- [ ] **Step 1: Update the failing test**

Edit `convex/graph.test.ts`. In the first test, replace the `softEdge` lookup (which used the now-removed `consumerTitle`) and add cascade/cycle assertions. Replace the block from `// Edge with no committed date` to the end of the first test's body with:

```typescript
  // Edge with no committed date -> null slack (Analytics -> Reporting).
  const analytics = nodes.find((n) => n.title === "Analytics Dashboard")!;
  const reporting = nodes.find((n) => n.title === "Reporting Service")!;
  const softEdge = edges.find(
    (e) => e.source === analytics.id && e.target === reporting.id,
  );
  expect(softEdge?.slackDays).toBeNull();

  // Cascade: Checkout API is blocked -> it and everything downstream is red.
  const iap = nodes.find((n) => n.title === "In-App Purchase")!;
  const appStore = nodes.find((n) => n.title === "App Store Release")!;
  expect(checkout.effectiveRag).toBe("red");
  expect(checkout.reasons).toContain("blocked");
  expect(iap.effectiveRag).toBe("red");
  expect(appStore.effectiveRag).toBe("red"); // green edge, but blocked upstream
  expect(appStore.reasons).toContain("depends on at-risk: In-App Purchase");

  // Auth Service is upstream of the blockage, so it stays green.
  expect(auth.effectiveRag).toBe("green");

  // The green IAP -> App Store Release edge displays red via cascade.
  const releaseEdge = edges.find((e) => e.source === iap.id && e.target === appStore.id);
  expect(releaseEdge?.rag).toBe("green"); // manual baseline preserved
  expect(releaseEdge?.effectiveRag).toBe("red"); // cascade-adjusted

  // Cycle detection: the planted Data cycle is reported.
  expect(cycles.length).toBe(1);
  const cycleTitles = new Set(
    cycles[0].deliverableIds.map((id) => nodes.find((n) => n.id === id)?.title),
  );
  expect(cycleTitles.has("Data Pipeline")).toBe(true);
  expect(cycleTitles.has("Reporting Service")).toBe(true);
  const pipeline = nodes.find((n) => n.title === "Data Pipeline")!;
  expect(pipeline.effectiveRag).toBe("red");
  expect(pipeline.reasons).toContain("cycle member");
```

Then update the first test's destructuring from `const { nodes, edges } = ...` to `const { nodes, edges, cycles } = await t.query(api.graph.get, {});`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- graph`
Expected: FAIL — `cycles` undefined / `effectiveRag` undefined.

- [ ] **Step 3: Rewrite `graph.get`**

Replace `convex/graph.ts` entirely:

```typescript
import { query } from "./_generated/server";
import { slackDays } from "./model/derived";
import { loadActiveProgramGraph } from "./model/graph-data";
import {
  computeCascade,
  type AnalysisEdge,
  type AnalysisNode,
} from "./model/graph-analysis";

// Deliverable graph NODES + dependency graph EDGES for the active program,
// shaped for React Flow (source = provider, target = consumer), enriched with
// cascade-adjusted RAG + reasons and the program's dependency cycles. Every
// derived value is computed here and never persisted (ADR-0006).
export const get = query({
  args: {},
  handler: async (ctx) => {
    const graph = await loadActiveProgramGraph(ctx);
    if (!graph) return { nodes: [], edges: [], cycles: [] };
    const { teamById, deliverableById, edges: inProgramEdges } = graph;

    const deliverables = [...deliverableById.values()];

    // Only edges whose BOTH endpoints render — a dangling endpoint makes
    // React Flow throw (stricter than dependencies.list, which needs only the
    // provider in-program).
    const renderEdges = inProgramEdges.filter((e) =>
      deliverableById.has(e.consumerDeliverableId),
    );

    const analysisNodes: AnalysisNode[] = deliverables.map((d) => ({
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

    const { nodeStates, edgeStates, cycles } = computeCascade(
      analysisNodes,
      analysisEdges,
      Date.now(),
    );

    const nodes = deliverables.map((d) => {
      const team = teamById.get(d.owningTeamId);
      const state = nodeStates[d._id];
      return {
        id: d._id,
        title: d.title,
        status: d.status,
        teamName: team?.name ?? "—",
        teamColor: team?.color ?? "#94a3b8",
        effectiveRag: state?.effectiveRag ?? "green",
        reasons: state?.reasons ?? [],
      };
    });

    const edges = renderEdges.map((e) => {
      const state = edgeStates[e._id];
      return {
        id: e._id,
        source: e.providerDeliverableId,
        target: e.consumerDeliverableId,
        rag: e.rag,
        effectiveRag: state?.effectiveRag ?? e.rag,
        reasons: state?.reasons ?? [],
        isBlocking: e.isBlocking,
        neededByDate: e.neededByDate,
        committedDate: e.committedDate,
        slackDays: slackDays(e.neededByDate, e.committedDate),
        description: e.description,
      };
    });

    return { nodes, edges, cycles };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- graph`
Expected: PASS. Then run full `pnpm test` — the second graph test (cross-program exclusion) still passes since it only reads `nodes`/`edges` lengths and ids.

- [ ] **Step 5: Commit**

```bash
git add convex/graph.ts convex/graph.test.ts
git commit -m "feat(graph): return cascade-adjusted RAG, reasons, and cycles from graph.get"
```

---

## Task 5: `setStatus` + `setRag` mutations

**Files:**
- Modify: `convex/deliverables.ts`, `convex/dependencies.ts`
- Test: `convex/deliverables.test.ts`, `convex/dependencies.test.ts`

**Interfaces:**
- Consumes: schema validators (`deliverableStatus`, `rag`) — redefine inline as local `v.union`s in each file (the schema does not export them).
- Produces:
  - `api.deliverables.setStatus({ id: Id<"deliverables">, status })` — updates status; sets `actualDate = Date.now()` when moving to `done`, clears it when moving off `done`; writes one `statusChanges` row (`entityType:"deliverable"`, `field:"status"`) only when the value changes; returns `null`.
  - `api.dependencies.setRag({ id: Id<"dependencies">, rag })` — updates `rag`; writes one `statusChanges` row (`entityType:"dependency"`, `field:"rag"`) only when the value changes; returns `null`.

- [ ] **Step 1: Write the failing tests**

Create/append `convex/deliverables.test.ts`:

```typescript
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("setStatus updates status, sets actualDate on done, and logs the change", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const before = await t.query(api.deliverables.list, {});
  const auth = before.find((d) => d.title === "Auth Service")!;

  await t.mutation(api.deliverables.setStatus, { id: auth._id, status: "done" });

  const after = await t.query(api.deliverables.list, {});
  const authAfter = after.find((d) => d._id === auth._id)!;
  expect(authAfter.status).toBe("done");
  expect(authAfter.actualDate).toBeTypeOf("number");

  const logs = await t.run(async (ctx) =>
    ctx.db
      .query("statusChanges")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "deliverable").eq("entityId", auth._id),
      )
      .collect(),
  );
  expect(logs).toHaveLength(1);
  expect(logs[0].field).toBe("status");
  expect(logs[0].oldValue).toBe("in_progress");
  expect(logs[0].newValue).toBe("done");
});

test("setStatus is a no-op (no log) when the status is unchanged", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const before = await t.query(api.deliverables.list, {});
  const auth = before.find((d) => d.title === "Auth Service")!;

  await t.mutation(api.deliverables.setStatus, { id: auth._id, status: "in_progress" });

  const logs = await t.run(async (ctx) =>
    ctx.db
      .query("statusChanges")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "deliverable").eq("entityId", auth._id),
      )
      .collect(),
  );
  expect(logs).toHaveLength(0);
});
```

Create/append `convex/dependencies.test.ts`:

```typescript
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("setRag updates the edge and logs the change", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const before = await t.query(api.dependencies.list, {});
  const target = before.find((e) => e.rag === "green")!;

  await t.mutation(api.dependencies.setRag, { id: target._id, rag: "red" });

  const after = await t.query(api.dependencies.list, {});
  expect(after.find((e) => e._id === target._id)!.rag).toBe("red");

  const logs = await t.run(async (ctx) =>
    ctx.db
      .query("statusChanges")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "dependency").eq("entityId", target._id),
      )
      .collect(),
  );
  expect(logs).toHaveLength(1);
  expect(logs[0].field).toBe("rag");
  expect(logs[0].newValue).toBe("red");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- deliverables dependencies`
Expected: FAIL — `setStatus` / `setRag` do not exist.

- [ ] **Step 3: Implement `setStatus`**

Add to `convex/deliverables.ts` (keep the existing `list`; add imports for `mutation`, `v`):

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { loadActiveProgramGraph } from "./model/graph-data";

const deliverableStatus = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
);

// ... existing `list` query ...

export const setStatus = mutation({
  args: { id: v.id("deliverables"), status: deliverableStatus },
  handler: async (ctx, { id, status }) => {
    const doc = await ctx.db.get(id);
    if (!doc) throw new Error("Deliverable not found");
    if (doc.status === status) return null;

    // actualDate mirrors the seed convention: set on entering done, cleared on leaving.
    const actualDate =
      status === "done" ? Date.now() : doc.status === "done" ? undefined : doc.actualDate;

    await ctx.db.patch(id, { status, actualDate });
    await ctx.db.insert("statusChanges", {
      entityType: "deliverable",
      entityId: id,
      field: "status",
      oldValue: doc.status,
      newValue: status,
    });
    return null;
  },
});
```

- [ ] **Step 4: Implement `setRag`**

Add to `convex/dependencies.ts` (keep the existing `list`; add imports for `mutation`, `v`):

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const rag = v.union(v.literal("green"), v.literal("amber"), v.literal("red"));

// ... existing `list` query ...

export const setRag = mutation({
  args: { id: v.id("dependencies"), rag },
  handler: async (ctx, { id, rag: next }) => {
    const doc = await ctx.db.get(id);
    if (!doc) throw new Error("Dependency not found");
    if (doc.rag === next) return null;

    await ctx.db.patch(id, { rag: next });
    await ctx.db.insert("statusChanges", {
      entityType: "dependency",
      entityId: id,
      field: "rag",
      oldValue: doc.rag,
      newValue: next,
    });
    return null;
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- deliverables dependencies`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/deliverables.ts convex/dependencies.ts convex/deliverables.test.ts convex/dependencies.test.ts
git commit -m "feat(convex): setStatus + setRag mutations that log statusChanges"
```

---

## Task 6: Transitive reachability helper

**Files:**
- Create: `lib/graph-traverse.ts`
- Test: `lib/graph-traverse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TraverseEdge = { source: string; target: string }`.
  - `downstreamOf(id: string, edges: TraverseEdge[]): Set<string>` — all nodes reachable following `source→target`, excluding `id`, cycle-safe.
  - `upstreamOf(id: string, edges: TraverseEdge[]): Set<string>` — all nodes that can reach `id`, excluding `id`, cycle-safe.

- [ ] **Step 1: Write the failing test**

Create `lib/graph-traverse.test.ts`:

```typescript
import { expect, test } from "vitest";
import { downstreamOf, upstreamOf } from "./graph-traverse";

const edges = [
  { source: "a", target: "b" },
  { source: "b", target: "c" },
  { source: "c", target: "d" },
];

test("downstreamOf returns the full transitive downstream set", () => {
  expect([...downstreamOf("a", edges)].sort()).toEqual(["b", "c", "d"]);
  expect([...downstreamOf("c", edges)].sort()).toEqual(["d"]);
});

test("upstreamOf returns the full transitive upstream set", () => {
  expect([...upstreamOf("d", edges)].sort()).toEqual(["a", "b", "c"]);
});

test("traversal is cycle-safe and excludes the start node", () => {
  const cyclic = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "c", target: "a" },
  ];
  const out = downstreamOf("a", cyclic);
  expect(out.has("a")).toBe(false);
  expect([...out].sort()).toEqual(["b", "c"]);
});

test("an isolated node has empty upstream and downstream sets", () => {
  expect(downstreamOf("x", edges).size).toBe(0);
  expect(upstreamOf("x", edges).size).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- graph-traverse`
Expected: FAIL — cannot resolve `./graph-traverse`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/graph-traverse.ts`:

```typescript
// Pure transitive reachability over a dependency edge list, used by the graph
// inspector to show a node's full upstream / downstream blast radius. Cycle-safe.

export type TraverseEdge = { source: string; target: string };

function reachable(
  start: string,
  edges: TraverseEdge[],
  next: (e: TraverseEdge) => { from: string; to: string },
): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const { from, to } = next(e);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const u = stack.pop()!;
    for (const v of adj.get(u) ?? []) {
      if (v !== start && !seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return seen;
}

export function downstreamOf(id: string, edges: TraverseEdge[]): Set<string> {
  return reachable(id, edges, (e) => ({ from: e.source, to: e.target }));
}

export function upstreamOf(id: string, edges: TraverseEdge[]): Set<string> {
  return reachable(id, edges, (e) => ({ from: e.target, to: e.source }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- graph-traverse`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/graph-traverse.ts lib/graph-traverse.test.ts
git commit -m "feat(graph): pure transitive upstream/downstream reachability helper"
```

---

## Task 7: Color nodes + edges by effective RAG

**Files:**
- Modify: `components/graph/deliverable-node.tsx`, `components/graph/dependency-edge.tsx`

**Interfaces:**
- Consumes: `RAG_STROKE` (existing, `dependency-edge.tsx`).
- Produces:
  - `DeliverableNodeData` gains `effectiveRag: "green" | "amber" | "red"` and `inCycle: boolean`; the node renders a colored ring by `effectiveRag` (amber/red only) and a dashed ring when `inCycle`.
  - `DependencyEdgeData` gains `effectiveRag: "green" | "amber" | "red"`; the stroke uses `effectiveRag` instead of `rag`.
- Note: no unit tests (the repo has no React test harness); verified by `pnpm build` (typecheck) + `pnpm lint`. Full wiring lands in Task 10.

- [ ] **Step 1: Update the node component**

In `components/graph/deliverable-node.tsx`, extend the data type and ring logic:

```typescript
export type DeliverableNodeData = {
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "done";
  teamName: string;
  teamColor: string;
  effectiveRag: "green" | "amber" | "red";
  inCycle: boolean;
  dimmed: boolean;
};
```

Replace the `blocked` const and the wrapper `className`/`style` with:

```typescript
  const ringByRag: Record<DeliverableNodeData["effectiveRag"], string> = {
    green: "",
    amber: "ring-2 ring-amber-500",
    red: "ring-2 ring-red-500",
  };
  return (
    <div
      className={cn(
        "rounded-md border bg-background px-3 py-2 shadow-sm transition-opacity",
        ringByRag[data.effectiveRag],
        data.inCycle &&
          "outline outline-2 outline-dashed outline-purple-500 outline-offset-2",
        data.dimmed && "opacity-25",
      )}
      style={{ width: NODE_WIDTH, borderLeft: `4px solid ${data.teamColor}` }}
    >
```

(Remove the now-unused `const blocked = data.status === "blocked";` line.)

- [ ] **Step 2: Update the edge component**

In `components/graph/dependency-edge.tsx`, add `effectiveRag` to the data type and switch the stroke source:

```typescript
export type DependencyEdgeData = {
  rag: "green" | "amber" | "red";
  effectiveRag: "green" | "amber" | "red";
  isBlocking: boolean;
  slackDays: number | null;
  neededByDate: number;
  committedDate?: number;
  description?: string;
  dimmed: boolean;
};
```

Change `const stroke = RAG_STROKE[d.rag];` to:

```typescript
  const stroke = RAG_STROKE[d.effectiveRag];
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `pnpm lint`
Expected: PASS (no unused-var errors; `blocked` removed). A `pnpm build` typecheck will still report the not-yet-updated `dependency-graph.tsx` call sites — that is fixed in Task 10, so do not run `build` here; rely on `lint` for this task.

- [ ] **Step 4: Commit**

```bash
git add components/graph/deliverable-node.tsx components/graph/dependency-edge.tsx
git commit -m "feat(graph-ui): color nodes and edges by cascade-adjusted effective RAG"
```

---

## Task 8: Cycle banner component

**Files:**
- Create: `components/graph/cycle-banner.tsx`

**Interfaces:**
- Consumes: nothing (presentational).
- Produces: `CycleBanner({ cycles, nodeTitleById, onFocus }: { cycles: { deliverableIds: string[]; edgeIds: string[] }[]; nodeTitleById: Map<string, string>; onFocus: (deliverableIds: string[]) => void })` — renders nothing when `cycles` is empty; otherwise a red warning banner listing each cycle as `Title → Title → … → firstTitle`, each row a button calling `onFocus(cycle.deliverableIds)`.

- [ ] **Step 1: Create the component**

Create `components/graph/cycle-banner.tsx`:

```typescript
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon } from "@hugeicons/core-free-icons";

type Cycle = { deliverableIds: string[]; edgeIds: string[] };

export function CycleBanner({
  cycles,
  nodeTitleById,
  onFocus,
}: {
  cycles: Cycle[];
  nodeTitleById: Map<string, string>;
  onFocus: (deliverableIds: string[]) => void;
}) {
  if (cycles.length === 0) return null;
  const label = (id: string) => nodeTitleById.get(id) ?? "—";

  return (
    <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-red-600">
        <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} className="size-4" />
        {cycles.length === 1
          ? "1 circular dependency detected"
          : `${cycles.length} circular dependencies detected`}
      </div>
      <ul className="mt-1 space-y-0.5">
        {cycles.map((c, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onFocus(c.deliverableIds)}
              className="text-left text-muted-foreground underline-offset-2 hover:underline"
            >
              {[...c.deliverableIds, c.deliverableIds[0]].map(label).join(" → ")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify the icon export exists and it lints**

Run: `node -e "const i=require('@hugeicons/core-free-icons'); console.log(!!i.Alert01Icon)"`
Expected: prints `true`. If it prints `false` or errors, substitute another exported warning icon (e.g. `AlertCircleIcon` or `Alert02Icon`) — confirm with `node -e "console.log(Object.keys(require('@hugeicons/core-free-icons')).filter(k=>/Alert/.test(k)))"`.

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/graph/cycle-banner.tsx
git commit -m "feat(graph-ui): cycle warning banner component"
```

---

## Task 9: Node inspector — transitive impact, reasons, and edit controls

**Files:**
- Modify: `components/graph/node-inspector-panel.tsx`

**Interfaces:**
- Consumes: `RAG_STROKE` (existing).
- Produces: `NodeInspectorPanel` props become:
  ```typescript
  {
    node: { id: string; title: string; teamName: string; status: DeliverableStatus; effectiveRag: Severity; reasons: string[] };
    directUpstream: NeighborRow[];   // one hop; each maps to one edge
    directDownstream: NeighborRow[]; // one hop; each maps to one edge
    impactCount: number;             // transitive downstream at-risk count
    onSelect: (id: string) => void;
    onSetStatus: (status: DeliverableStatus) => void;
    onSetRag: (edgeId: string, rag: Severity) => void;
    onClose: () => void;
  }
  ```
  where `Severity = "green" | "amber" | "red"`, `DeliverableStatus = "not_started" | "in_progress" | "blocked" | "done"`, and `NeighborRow = { edgeId: string; id: string; title: string; teamName: string; effectiveRag: Severity; rag: Severity; reason?: string; neededByDate: number; slackDays: number | null }`.

- [ ] **Step 1: Rewrite the panel**

Replace `components/graph/node-inspector-panel.tsx` entirely:

```typescript
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { RAG_STROKE } from "./dependency-edge";

type Severity = "green" | "amber" | "red";
type DeliverableStatus = "not_started" | "in_progress" | "blocked" | "done";

type NeighborRow = {
  edgeId: string;
  id: string;
  title: string;
  teamName: string;
  effectiveRag: Severity;
  rag: Severity;
  reason?: string;
  neededByDate: number;
  slackDays: number | null;
};

type SelectedNode = {
  id: string;
  title: string;
  teamName: string;
  status: DeliverableStatus;
  effectiveRag: Severity;
  reasons: string[];
};

const fmt = (ms: number) => new Date(ms).toLocaleDateString();
const STATUS_OPTIONS: { value: DeliverableStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];
const RAG_OPTIONS: Severity[] = ["green", "amber", "red"];

function NeighborList({
  heading,
  rows,
  onSelect,
  onSetRag,
}: {
  heading: string;
  rows: NeighborRow[];
  onSelect: (id: string) => void;
  onSetRag: (edgeId: string, rag: Severity) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">None</div>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.edgeId} className="rounded-md border p-2">
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className="flex w-full flex-col gap-0.5 text-left"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ background: RAG_STROKE[r.effectiveRag] }}
                  />
                  <span className="truncate hover:underline">{r.title}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.teamName} · needed {fmt(r.neededByDate)}
                  {r.slackDays !== null && (
                    <span className={r.slackDays < 0 ? " text-red-600" : ""}>
                      {" "}
                      · {r.slackDays > 0 ? `+${r.slackDays}` : r.slackDays}d slack
                    </span>
                  )}
                </span>
                {r.reason && (
                  <span className="text-xs italic text-muted-foreground">{r.reason}</span>
                )}
              </button>
              <label className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                RAG
                <select
                  value={r.rag}
                  onChange={(e) => onSetRag(r.edgeId, e.target.value as Severity)}
                  className="rounded border bg-background px-1 py-0.5 text-xs"
                >
                  {RAG_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NodeInspectorPanel({
  node,
  directUpstream,
  directDownstream,
  impactCount,
  onSelect,
  onSetStatus,
  onSetRag,
  onClose,
}: {
  node: SelectedNode;
  directUpstream: NeighborRow[];
  directDownstream: NeighborRow[];
  impactCount: number;
  onSelect: (id: string) => void;
  onSetStatus: (status: DeliverableStatus) => void;
  onSetRag: (edgeId: string, rag: Severity) => void;
  onClose: () => void;
}) {
  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col gap-4 overflow-y-auto border-l bg-background p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ background: RAG_STROKE[node.effectiveRag] }}
          />
          <div className="text-base font-medium">{node.title}</div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        {node.teamName} · Status
        <select
          value={node.status}
          onChange={(e) => onSetStatus(e.target.value as DeliverableStatus)}
          className="rounded border bg-background px-1.5 py-0.5 text-xs text-foreground"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {node.reasons.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <div className="font-medium">Why at risk</div>
          <ul className="mt-0.5 list-disc pl-4">
            {node.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-sm">
        <span className="font-medium">Impact:</span> slipping this puts{" "}
        <span className="font-semibold">{impactCount}</span> downstream deliverable
        {impactCount === 1 ? "" : "s"} at risk.
      </div>

      <NeighborList
        heading="Depends on"
        rows={directUpstream}
        onSelect={onSelect}
        onSetRag={onSetRag}
      />
      <NeighborList
        heading="Depended on by"
        rows={directDownstream}
        onSelect={onSelect}
        onSetRag={onSetRag}
      />
    </aside>
  );
}
```

- [ ] **Step 2: Verify it lints**

Run: `pnpm lint`
Expected: PASS. (A `pnpm build` typecheck will still fail on `dependency-graph.tsx`, which is rewritten in Task 10 to supply these new props.)

- [ ] **Step 3: Commit**

```bash
git add components/graph/node-inspector-panel.tsx
git commit -m "feat(graph-ui): inspector shows impact count, reasons, and edit controls"
```

---

## Task 10: Wire the graph — effective RAG, cycles, transitive inspector, mutations

**Files:**
- Modify: `components/graph/dependency-graph.tsx`

**Interfaces:**
- Consumes: `api.graph.get` (now returns `{ nodes, edges, cycles }` with `effectiveRag`/`reasons`), `api.deliverables.setStatus`, `api.dependencies.setRag`, `downstreamOf`/`upstreamOf` (Task 6), `CycleBanner` (Task 8), the updated `NodeInspectorPanel` (Task 9), the updated node/edge data shapes (Task 7).
- Produces: a fully wired graph view — nodes/edges colored by `effectiveRag`, cycle members ringed and listed in a banner (clicking focuses them via `fitView`), the inspector driven by transitive reachability, and status/RAG selects calling the mutations (live re-color via Convex reactivity).

- [ ] **Step 1: Rewrite the component**

Replace `components/graph/dependency-graph.tsx` entirely:

```typescript
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type Preloaded, usePreloadedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { layoutGraph } from "@/lib/graph-layout";
import { downstreamOf, upstreamOf } from "@/lib/graph-traverse";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeliverableNode, type DeliverableNodeType } from "./deliverable-node";
import { DependencyEdge, RAG_STROKE, type DependencyEdgeType } from "./dependency-edge";
import { GraphLegend } from "./graph-legend";
import { CycleBanner } from "./cycle-banner";
import { NodeInspectorPanel } from "./node-inspector-panel";
import { useNodesState, useEdgesState } from "@xyflow/react";

const nodeTypes: NodeTypes = { deliverable: DeliverableNode };
const edgeTypes: EdgeTypes = { dependency: DependencyEdge };

type GraphData = ReturnType<typeof usePreloadedQuery<typeof api.graph.get>>;
type DeliverableStatus = DeliverableNodeType["data"]["status"];
type Severity = "green" | "amber" | "red";

function GraphInner({ data }: { data: GraphData }) {
  const { fitView, setCenter, getNode } = useReactFlow();
  const setStatus = useMutation(api.deliverables.setStatus);
  const setRag = useMutation(api.dependencies.setRag);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodeById = useMemo(
    () => new Map(data.nodes.map((n) => [n.id, n])),
    [data.nodes],
  );
  const nodeTitleById = useMemo(
    () => new Map(data.nodes.map((n) => [n.id, n.title] as const)),
    [data.nodes],
  );
  const cycleMembers = useMemo(
    () => new Set(data.cycles.flatMap((c) => c.deliverableIds)),
    [data.cycles],
  );

  // Direct-neighbor highlight (one hop).
  const neighborIds = useMemo(() => {
    const s = new Set<string>();
    if (!selectedId) return s;
    for (const e of data.edges) {
      if (e.source === selectedId) s.add(e.target);
      if (e.target === selectedId) s.add(e.source);
    }
    return s;
  }, [selectedId, data.edges]);

  // Transitive downstream impact count for the inspector header.
  const impactCount = useMemo(() => {
    if (!selectedId) return 0;
    const down = downstreamOf(selectedId, data.edges);
    let n = 0;
    for (const id of down) {
      if (nodeById.get(id)?.effectiveRag !== "green") n++;
    }
    return n;
  }, [selectedId, data.edges, nodeById]);

  const toRow = useCallback(
    (edgeId: string, otherId: string, e: GraphData["edges"][number]) => {
      const o = nodeById.get(otherId)!;
      return {
        edgeId,
        id: o.id,
        title: o.title,
        teamName: o.teamName,
        effectiveRag: e.effectiveRag as Severity,
        rag: e.rag as Severity,
        reason: e.reasons[0],
        neededByDate: e.neededByDate,
        slackDays: e.slackDays,
      };
    },
    [nodeById],
  );

  const directUpstream = useMemo(
    () =>
      selectedId
        ? data.edges
            .filter((e) => e.target === selectedId)
            .map((e) => toRow(e.id, e.source, e))
        : [],
    [selectedId, data.edges, toRow],
  );
  const directDownstream = useMemo(
    () =>
      selectedId
        ? data.edges
            .filter((e) => e.source === selectedId)
            .map((e) => toRow(e.id, e.target, e))
        : [],
    [selectedId, data.edges, toRow],
  );

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;

  const positions = useMemo(
    () =>
      layoutGraph(
        data.nodes.map((n) => ({ id: n.id })),
        data.edges.map((e) => ({ source: e.source, target: e.target })),
      ),
    [data.nodes, data.edges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<DeliverableNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DependencyEdgeType>([]);

  useEffect(() => {
    setNodes(
      data.nodes.map((n) => ({
        id: n.id,
        type: "deliverable",
        position: positions[n.id] ?? { x: 0, y: 0 },
        data: {
          title: n.title,
          status: n.status,
          teamName: n.teamName,
          teamColor: n.teamColor,
          effectiveRag: n.effectiveRag,
          inCycle: cycleMembers.has(n.id),
          dimmed:
            selectedId !== null && n.id !== selectedId && !neighborIds.has(n.id),
        },
      })),
    );
  }, [data.nodes, positions, setNodes, selectedId, neighborIds, cycleMembers]);

  useEffect(() => {
    setEdges(
      data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "dependency",
        markerEnd: { type: MarkerType.ArrowClosed, color: RAG_STROKE[e.effectiveRag] },
        data: {
          rag: e.rag,
          effectiveRag: e.effectiveRag,
          isBlocking: e.isBlocking,
          slackDays: e.slackDays,
          neededByDate: e.neededByDate,
          committedDate: e.committedDate,
          description: e.description,
          dimmed:
            selectedId !== null &&
            e.source !== selectedId &&
            e.target !== selectedId,
        },
      })),
    );
  }, [data.edges, setEdges, selectedId]);

  const focusCycle = useCallback(
    (ids: string[]) => {
      const pts = ids.map((id) => getNode(id)).filter((n): n is NonNullable<typeof n> => !!n);
      if (pts.length === 0) return;
      const cx = pts.reduce((s, n) => s + n.position.x, 0) / pts.length;
      const cy = pts.reduce((s, n) => s + n.position.y, 0) / pts.length;
      setCenter(cx, cy, { zoom: 1.2, duration: 600 });
    },
    [getNode, setCenter],
  );

  return (
    <>
      <CycleBanner cycles={data.cycles} nodeTitleById={nodeTitleById} onFocus={focusCycle} />
      <div className="relative h-[calc(100vh-12rem)] w-full rounded-md border">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          colorMode="system"
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
        >
          <Background />
          <Controls showInteractive={false} />
          <GraphLegend />
        </ReactFlow>
        {selectedNode && (
          <NodeInspectorPanel
            node={selectedNode}
            directUpstream={directUpstream}
            directDownstream={directDownstream}
            impactCount={impactCount}
            onSelect={setSelectedId}
            onSetStatus={(status: DeliverableStatus) =>
              setStatus({ id: selectedNode.id as Id<"deliverables">, status })
            }
            onSetRag={(edgeId, rag) =>
              setRag({ id: edgeId as Id<"dependencies">, rag })
            }
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </>
  );
}

export function DependencyGraph({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.graph.get>;
}) {
  const data = usePreloadedQuery(preloaded);

  if (data.nodes.length === 0) {
    return (
      <div className="flex h-[calc(100vh-12rem)] items-center justify-center rounded-md border text-sm text-muted-foreground">
        No deliverables in the active program yet.
      </div>
    );
  }

  return (
    <TooltipProvider delay={0}>
      <div className="space-y-3">
        <ReactFlowProvider>
          <GraphInner data={data} />
        </ReactFlowProvider>
      </div>
    </TooltipProvider>
  );
}
```

Note: `ReactFlowProvider` is required so `GraphInner` can call `useReactFlow()` for `setCenter`/`getNode`; the banner sits outside the canvas, so the height calc drops from `9rem` to `12rem` to leave room.

- [ ] **Step 2: Verify the whole project typechecks, lints, and tests**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: all PASS. `build` now typechecks the full UI against the new `graph.get` shape and the new component props.

- [ ] **Step 3: Commit**

```bash
git add components/graph/dependency-graph.tsx
git commit -m "feat(graph-ui): wire effective RAG, cycle banner, transitive impact, live edits"
```

---

## Task 11: End-to-end verification, docs, and tag

**Files:**
- Modify: `docs/ROADMAP.md` (optional status note)
- Test: full gate + manual browser check.

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: all green. If any fail, fix before proceeding.

- [ ] **Step 2: Manual browser verification (the live ripple)**

Start the app (`pnpm dev`) and open `http://localhost:3000/graph`. Confirm:
- The Auth → Checkout → In-App Purchase → App Store Release chain renders red (cascade), even though the IAP → App Store edge is manually green.
- A red cycle banner reads "1 circular dependency detected: Data Pipeline → Analytics Dashboard → Reporting Service → Data Pipeline"; clicking it centers those nodes, which show a dashed purple ring.
- Click a node → the inspector shows the impact count, the "why at risk" reasons, and direct-neighbor rows.
- In the inspector, set **Auth Service** status to `blocked` (or flip an edge's RAG) and watch the downstream nodes/edges re-color **live** without a reload.
- Reset by re-running the seed if desired: `pnpm exec convex run seed:run` (internal mutation).

Use the `superpowers:verify` skill or the browser MCP tools if available; otherwise verify by hand. (The `add-agent-browser-when-ui-lands` memory applies here.)

- [ ] **Step 3: Optional roadmap note + finish the branch**

Optionally add a one-line "Phase 3 landed" note under the Phase 3 heading in `docs/ROADMAP.md`, then commit.

Finish the branch per the repo git convention (self-reviewed PR, squash-merge with `--delete-branch`, then resync `main`), and tag the phase:

```bash
git tag v0.3.0
```

(Use the `superpowers:finishing-a-development-branch` skill to drive the merge/PR choice.)

---

## Self-Review Notes

- **Spec coverage:** pure algorithm module (T1–T2) · `graph.get` extension w/ effectiveRag+reasons+cycles (T4) · shared loader folding in the Phase-2 DRY follow-up + denormalized-field trim (T3–T4) · `setStatus`/`setRag` writing `statusChanges` (T5) · `lib/graph-traverse` (T6) · effectiveRag coloring + cycle ring (T7) · cycle banner (T8) · transitive inspector w/ reasons + edit controls (T9) · full wiring + live ripple (T10) · verification/tag (T11). All spec sections map to a task.
- **No schema change**, nothing persisted — honored throughout (derived values live only in query payloads / component memos).
- **Type consistency:** `Severity`, `AnalysisNode`, `AnalysisEdge`, `Cycle`, `ItemState`, `CascadeResult`, `NeighborRow`, `TraverseEdge` names are used identically across tasks; `effectiveRag`/`reasons`/`inCycle` field names match between `graph.get`, the node/edge data types, and the inspector.
