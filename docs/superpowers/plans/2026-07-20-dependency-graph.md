# Dependency Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the active program's deliverables and dependencies as an interactive directed graph — nodes colored by team, edges colored by RAG with a needed-by-vs-committed slack badge — and let a user click a node to highlight and inspect its direct upstream/downstream neighbors.

**Architecture:** A dedicated Convex query (`graph.get`) returns the graph in one reactive payload. A pure client-side dagre wrapper (`lib/graph-layout.ts`) assigns left-to-right layered positions at render time (never stored). A server page preloads the query and hands it to a `"use client"` React Flow canvas built from custom node/edge components, with selection state driving in-canvas dimming plus a non-modal side inspector.

**Tech Stack:** Convex · Next.js App Router · React Flow (`@xyflow/react` v12) · `@dagrejs/dagre` · Tailscale-free Tailwind + base-ui (shadcn) primitives · vitest + convex-test.

## Global Constraints

- **Package manager is pnpm.** Never introduce npm/yarn. Node 20.9+.
- **Graph lib is `@xyflow/react` (v12).** Never import the legacy `reactflow` (v11) package.
- **Derived values are never stored.** Node `(x,y)` positions and `slackDays` are computed at read/render time — never written to the DB.
- **Dates are Unix-ms numbers** (`v.number()`), formatted only at the view layer.
- **Convex reactive hooks run only in client components.** Use `preloadQuery` on the server page and `usePreloadedQuery` in the client canvas — matches the existing pages.
- **Edges are `provider → consumer`** (`providerDeliverableId` = `source`, `consumerDeliverableId` = `target`). Do not invert.
- **Do not remove the test-file exclude** in `convex/tsconfig.json`.
- **Scope:** manual `rag` only. No cascade RAG derivation, no transitive traversal, no cycle detection, no editing from the graph — all Phase 3+.
- **Definition of done for every task:** the task's tests pass, and before the final task is reported complete, `pnpm test`, `pnpm lint`, and `pnpm build` are all green.

---

### Task 1: `graph.get` Convex query

Returns the active program's deliverable nodes and dependency edges in one payload, shaped so React Flow can wire `source`/`target` directly. Mirrors the existing `dependencies.list` / `deliverables.list` structure but keeps the raw deliverable IDs (which the table query drops) and includes only edges whose **both** endpoints are nodes in the program (a dangling edge would crash the render).

**Files:**
- Create: `convex/graph.ts`
- Test: `convex/graph.test.ts`

**Interfaces:**
- Consumes: `getActiveProgram` from `convex/model/programs.ts`; `slackDays` from `convex/model/derived.ts`; `internal.seed.run` (test only).
- Produces: `api.graph.get` → `{ nodes: GraphNode[]; edges: GraphEdge[] }` where
  - `GraphNode = { id: Id<"deliverables">; title: string; status: "not_started"|"in_progress"|"blocked"|"done"; teamName: string; teamColor: string }`
  - `GraphEdge = { id: Id<"dependencies">; source: Id<"deliverables">; target: Id<"deliverables">; rag: "green"|"amber"|"red"; isBlocking: boolean; neededByDate: number; committedDate?: number; slackDays: number | null; description?: string; providerTitle: string; providerTeamName: string; consumerTitle: string; consumerTeamName: string }`

- [ ] **Step 1: Write the failing test**

Create `convex/graph.test.ts`:

```typescript
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("graph.get returns program nodes and edges wired provider->consumer", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const { nodes, edges } = await t.query(api.graph.get, {});

  // Seed has 9 deliverables and 8 dependencies, all in one program.
  expect(nodes.length).toBe(9);
  expect(edges.length).toBe(8);

  // No dangling edges: every source/target is a real node.
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    expect(nodeIds.has(e.source)).toBe(true);
    expect(nodeIds.has(e.target)).toBe(true);
  }

  // Auth Service -> Checkout API: amber, needed day 20, committed day 22 -> slack -2.
  const auth = nodes.find((n) => n.title === "Auth Service")!;
  const checkout = nodes.find((n) => n.title === "Checkout API")!;
  const edge = edges.find((e) => e.source === auth.id && e.target === checkout.id);
  expect(edge?.rag).toBe("amber");
  expect(edge?.slackDays).toBe(-2);

  // Nodes carry the owning team's rendering color (Platform = #6366f1).
  expect(auth.teamColor).toBe("#6366f1");

  // Edge with no committed date -> null slack (Analytics -> Reporting).
  const softEdge = edges.find((e) => e.consumerTitle === "Reporting Service");
  expect(softEdge?.slackDays).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test convex/graph.test.ts`
Expected: FAIL — `api.graph` does not exist / module not found.

- [ ] **Step 3: Write the query**

Create `convex/graph.ts`:

```typescript
import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";
import { slackDays } from "./model/derived";
import { Id } from "./_generated/dataModel";

// Deliverable graph NODES + dependency graph EDGES for the active program,
// shaped for React Flow (source = provider, target = consumer). Derived values
// (slackDays, and layout positions on the client) are never stored.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return { nodes: [], edges: [] };

    const teams = await ctx.db.query("teams").take(500);
    const teamById = new Map(teams.map((t) => [t._id, t]));

    const deliverables = await ctx.db
      .query("deliverables")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    const deliverableById = new Map(deliverables.map((d) => [d._id, d]));

    const nodes = deliverables.map((d) => {
      const team = teamById.get(d.owningTeamId);
      return {
        id: d._id,
        title: d.title,
        status: d.status,
        teamName: team?.name ?? "—",
        teamColor: team?.color ?? "#94a3b8",
      };
    });

    const nameFor = (id: Id<"deliverables">) => {
      const d = deliverableById.get(id);
      const team = d ? teamById.get(d.owningTeamId) : undefined;
      return { title: d?.title ?? "—", teamName: team?.name ?? "—" };
    };

    const allEdges = await ctx.db.query("dependencies").take(1000);
    const edges = allEdges
      // Keep only edges whose BOTH endpoints are nodes we render — a dangling
      // endpoint would make React Flow throw.
      .filter(
        (e) =>
          deliverableById.has(e.providerDeliverableId) &&
          deliverableById.has(e.consumerDeliverableId),
      )
      .map((e) => {
        const p = nameFor(e.providerDeliverableId);
        const c = nameFor(e.consumerDeliverableId);
        return {
          id: e._id,
          source: e.providerDeliverableId,
          target: e.consumerDeliverableId,
          rag: e.rag,
          isBlocking: e.isBlocking,
          neededByDate: e.neededByDate,
          committedDate: e.committedDate,
          slackDays: slackDays(e.neededByDate, e.committedDate),
          description: e.description,
          providerTitle: p.title,
          providerTeamName: p.teamName,
          consumerTitle: c.title,
          consumerTeamName: c.teamName,
        };
      });

    return { nodes, edges };
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test convex/graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/graph.ts convex/graph.test.ts
git commit -m "feat: graph.get query returning nodes and edges for the active program"
```

---

### Task 2: dagre layout helper

A pure, React-free function that assigns left-to-right layered positions from the graph's edge structure. Isolated so it's unit-testable without React Flow and so dagre is imported in exactly one place.

**Files:**
- Create: `lib/graph-layout.ts`
- Test: `lib/graph-layout.test.ts`
- Modify: `package.json` (add `@dagrejs/dagre` via pnpm)

**Interfaces:**
- Produces: `layoutGraph(nodes: { id: string }[], edges: { source: string; target: string }[], direction?: "LR" | "TB"): Record<string, { x: number; y: number }>` — a map from node id to top-left position. Also exports `NODE_WIDTH` and `NODE_HEIGHT` constants (the node box size, shared with the node component so layout and render agree).

- [ ] **Step 1: Install dagre**

Run: `pnpm add @dagrejs/dagre`
Expected: `@dagrejs/dagre` appears under `dependencies` in `package.json`.

Note: `@dagrejs/dagre` v1 ships its own TypeScript types. If `pnpm build` later reports missing declarations for it, run `pnpm add -D @types/dagre` and create `types/dagre.d.ts` containing `declare module "@dagrejs/dagre" { import dagre from "dagre"; export = dagre; }`.

- [ ] **Step 2: Write the failing test**

Create `lib/graph-layout.test.ts`:

```typescript
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { layoutGraph, NODE_WIDTH, NODE_HEIGHT } from "./graph-layout";

describe("layoutGraph", () => {
  it("assigns a numeric position to every node", () => {
    const pos = layoutGraph(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
    );
    for (const id of ["a", "b", "c"]) {
      expect(typeof pos[id].x).toBe("number");
      expect(typeof pos[id].y).toBe("number");
      expect(Number.isFinite(pos[id].x)).toBe(true);
    }
  });

  it("places a provider left of its consumer in LR direction", () => {
    const pos = layoutGraph(
      [{ id: "provider" }, { id: "consumer" }],
      [{ source: "provider", target: "consumer" }],
      "LR",
    );
    expect(pos.provider.x).toBeLessThan(pos.consumer.x);
  });

  it("exports positive node dimensions", () => {
    expect(NODE_WIDTH).toBeGreaterThan(0);
    expect(NODE_HEIGHT).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test lib/graph-layout.test.ts`
Expected: FAIL — cannot find module `./graph-layout`.

- [ ] **Step 4: Write the layout helper**

Create `lib/graph-layout.ts`:

```typescript
import Dagre from "@dagrejs/dagre";

// Node box size. Shared with DeliverableNode so dagre lays out with the same
// footprint the DOM actually renders.
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 64;

/**
 * Compute layered graph positions from the edge structure. Pure and
 * React-free. Returns a map of node id -> top-left {x, y} (dagre anchors at
 * center, so we shift by half the box to match React Flow's top-left anchor).
 * Positions are derived at render time and never persisted.
 */
export function layoutGraph(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
  direction: "LR" | "TB" = "LR",
): Record<string, { x: number; y: number }> {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 48, ranksep: 140 });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  Dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    positions[n.id] = {
      x: p.x - NODE_WIDTH / 2,
      y: p.y - NODE_HEIGHT / 2,
    };
  }
  return positions;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test lib/graph-layout.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/graph-layout.ts lib/graph-layout.test.ts
git commit -m "feat: pure dagre LR layout helper for the dependency graph"
```

---

### Task 3: Static graph render (canvas, nodes, edges, route, nav)

Render the graph read-only: custom team-colored nodes, RAG-colored edges (solid = blocking, dashed = soft) with a slack badge + hover tooltip, a legend, plus the `/graph` route and sidebar entry. No selection yet. Verified in the browser, not by unit test (React Flow rendering isn't meaningfully unit-testable).

**Files:**
- Create: `components/graph/deliverable-node.tsx`
- Create: `components/graph/dependency-edge.tsx`
- Create: `components/graph/graph-legend.tsx`
- Create: `components/graph/dependency-graph.tsx`
- Create: `app/(app)/graph/page.tsx`
- Modify: `components/app-sidebar.tsx` (add the Graph nav item at the top)

**Interfaces:**
- Consumes: `api.graph.get`, `GraphNode`/`GraphEdge` (Task 1); `layoutGraph`, `NODE_WIDTH` (Task 2); `Tooltip`/`TooltipTrigger`/`TooltipContent`/`TooltipProvider` from `components/ui/tooltip`; `cn` from `lib/utils`.
- Produces:
  - `RAG_STROKE: Record<"green"|"amber"|"red", string>` and `DependencyEdge` + `DependencyEdgeType` from `dependency-edge.tsx`.
  - `DeliverableNode` + `DeliverableNodeType` + `DeliverableNodeData` from `deliverable-node.tsx`.
  - `DependencyGraph` (client) accepting `{ preloaded: Preloaded<typeof api.graph.get> }` — the Task 4 interaction layer extends this same component.

- [ ] **Step 1: Create the custom node**

Create `components/graph/deliverable-node.tsx`:

```tsx
import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NODE_WIDTH } from "@/lib/graph-layout";

export type DeliverableNodeData = {
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "done";
  teamName: string;
  teamColor: string;
  dimmed: boolean;
};
export type DeliverableNodeType = Node<DeliverableNodeData, "deliverable">;

const STATUS_LABEL: Record<DeliverableNodeData["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const DeliverableNode = memo(function DeliverableNode({
  data,
}: NodeProps<DeliverableNodeType>) {
  const blocked = data.status === "blocked";
  return (
    <div
      className={cn(
        "rounded-md border bg-background px-3 py-2 shadow-sm transition-opacity",
        blocked && "ring-2 ring-red-500",
        data.dimmed && "opacity-25",
      )}
      style={{ width: NODE_WIDTH, borderLeft: `4px solid ${data.teamColor}` }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="truncate text-sm font-medium leading-tight">{data.title}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ background: data.teamColor }}
        />
        <span className="truncate">{data.teamName}</span>
        <span>·</span>
        <span className="shrink-0">{STATUS_LABEL[data.status]}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
```

- [ ] **Step 2: Create the custom edge**

Create `components/graph/dependency-edge.tsx`:

```tsx
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const RAG_STROKE: Record<"green" | "amber" | "red", string> = {
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
};

export type DependencyEdgeData = {
  rag: "green" | "amber" | "red";
  isBlocking: boolean;
  slackDays: number | null;
  neededByDate: number;
  committedDate?: number;
  description?: string;
  dimmed: boolean;
};
export type DependencyEdgeType = Edge<DependencyEdgeData, "dependency">;

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");

export function DependencyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<DependencyEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const d = data!;
  const stroke = RAG_STROKE[d.rag];

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: 2,
          // Solid = hard block, dashed = soft dependency.
          strokeDasharray: d.isBlocking ? undefined : "6 4",
          opacity: d.dimmed ? 0.15 : 1,
        }}
      />
      {d.slackDays !== null && (
        <EdgeLabelRenderer>
          <Tooltip>
            <TooltipTrigger
              className={cn(
                "nodrag nopan pointer-events-auto absolute rounded border bg-background px-1.5 py-0.5 text-[11px] font-medium shadow-sm",
                d.slackDays < 0 ? "text-red-600" : "text-foreground",
                d.dimmed && "opacity-25",
              )}
              style={{
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              }}
            >
              {d.slackDays > 0 ? `+${d.slackDays}d` : `${d.slackDays}d`}
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-0.5">
                <div>Needed by {fmt(d.neededByDate)}</div>
                <div>Committed {fmt(d.committedDate)}</div>
                {d.description && <div className="opacity-80">{d.description}</div>}
              </div>
            </TooltipContent>
          </Tooltip>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
```

- [ ] **Step 3: Create the legend**

Create `components/graph/graph-legend.tsx`:

```tsx
import { Panel } from "@xyflow/react";
import { RAG_STROKE } from "./dependency-edge";

export function GraphLegend() {
  return (
    <Panel
      position="top-left"
      className="rounded-md border bg-background/90 p-2 text-xs shadow-sm backdrop-blur"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          {(["green", "amber", "red"] as const).map((rag) => (
            <span key={rag} className="flex items-center gap-1">
              <span
                className="inline-block h-0.5 w-4"
                style={{ background: RAG_STROKE[rag] }}
              />
              {rag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-foreground" /> blocking
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-0.5 w-4 bg-foreground"
              style={{ backgroundImage: "none", borderTop: "2px dashed currentColor" }}
            />
            soft
          </span>
        </div>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Create the canvas (static — no selection yet)**

Create `components/graph/dependency-graph.tsx`:

```tsx
"use client";

import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type Preloaded, usePreloadedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { layoutGraph } from "@/lib/graph-layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeliverableNode, type DeliverableNodeType } from "./deliverable-node";
import { DependencyEdge, RAG_STROKE, type DependencyEdgeType } from "./dependency-edge";
import { GraphLegend } from "./graph-legend";

const nodeTypes: NodeTypes = { deliverable: DeliverableNode };
const edgeTypes: EdgeTypes = { dependency: DependencyEdge };

export function DependencyGraph({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.graph.get>;
}) {
  const data = usePreloadedQuery(preloaded);

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
          dimmed: false,
        },
      })),
    );
  }, [data.nodes, positions, setNodes]);

  useEffect(() => {
    setEdges(
      data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "dependency",
        markerEnd: { type: MarkerType.ArrowClosed, color: RAG_STROKE[e.rag] },
        data: {
          rag: e.rag,
          isBlocking: e.isBlocking,
          slackDays: e.slackDays,
          neededByDate: e.neededByDate,
          committedDate: e.committedDate,
          description: e.description,
          dimmed: false,
        },
      })),
    );
  }, [data.edges, setEdges]);

  if (data.nodes.length === 0) {
    return (
      <div className="flex h-[calc(100vh-9rem)] items-center justify-center rounded-md border text-sm text-muted-foreground">
        No deliverables in the active program yet.
      </div>
    );
  }

  return (
    <TooltipProvider delay={0}>
      <div className="relative h-[calc(100vh-9rem)] w-full rounded-md border">
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
        >
          <Background />
          <Controls showInteractive={false} />
          <GraphLegend />
        </ReactFlow>
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 5: Create the route**

Create `app/(app)/graph/page.tsx`:

```tsx
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DependencyGraph } from "@/components/graph/dependency-graph";

export default async function GraphPage() {
  const preloaded = await preloadQuery(api.graph.get, {});
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Dependency Graph</h1>
      <DependencyGraph preloaded={preloaded} />
    </section>
  );
}
```

- [ ] **Step 6: Add the sidebar nav item**

Modify `components/app-sidebar.tsx` — add Graph as the first entry in `NAV`:

```tsx
const NAV = [
  { href: "/graph", label: "Graph" },
  { href: "/deliverables", label: "Deliverables" },
  { href: "/dependencies", label: "Dependencies" },
  { href: "/risks", label: "Risks" },
  { href: "/assumptions", label: "Assumptions" },
  { href: "/issues", label: "Issues" },
  { href: "/teams", label: "Teams" },
];
```

- [ ] **Step 7: Verify build + typecheck**

Run: `pnpm build`
Expected: build succeeds, no type errors. (If `@dagrejs/dagre` types are missing, apply the fallback from Task 2 Step 1.)

- [ ] **Step 8: Verify in the browser**

With `pnpm dev` running, load http://localhost:3000/graph. Confirm:
- Nodes laid out left→right, each with a team-colored left bar and team/status line; the `blocked` Checkout API node has a red ring.
- Edges colored green/amber/red; the soft edges (API Gateway→Checkout, Analytics→Reporting) are dashed, blocking edges solid; arrowheads point provider→consumer.
- Slack badges show on edges with a committed date (e.g. `-2d` in red on Auth→Checkout); no badge on the committed-less edge; hovering a badge shows the needed/committed/description tooltip.
- The legend renders top-left; the graph fits on load.
- The "Graph" sidebar link is first and highlights on `/graph`.

(Per the standing memory note, this is the point to install the `agent-browser` skill to script this visual verification if desired.)

- [ ] **Step 9: Commit**

```bash
git add components/graph app/"(app)"/graph components/app-sidebar.tsx
git commit -m "feat: render the dependency graph (nodes, RAG edges, legend, route, nav)"
```

---

### Task 4: Click-to-inspect (highlight + side panel)

Add selection: clicking a node dims everything except it and its **direct** neighbors, and opens a non-modal side panel listing "Depends on" / "Depended on by" with team, RAG, needed-by, and slack. Clicking a neighbor row re-selects it; clicking empty canvas or the close button clears selection. Browser-verified.

**Files:**
- Create: `components/graph/node-inspector-panel.tsx`
- Modify: `components/graph/dependency-graph.tsx`

**Interfaces:**
- Consumes: `GraphNode`/`GraphEdge` payload from `api.graph.get`; `RAG_STROKE` from `dependency-edge.tsx`; `cn`.
- Produces: `NodeInspectorPanel` — a non-modal `<aside>`; props `{ node, upstream, downstream, onSelect, onClose }` (see Step 1 for the exact row shape).

> Design note: the repo's `Sheet` is a **modal** base-ui dialog (renders a backdrop that blocks canvas interaction), so the inspector is a plain absolutely-positioned `<aside>` inside the graph container instead — it coexists with the highlighted, still-clickable canvas.

- [ ] **Step 1: Create the inspector panel**

Create `components/graph/node-inspector-panel.tsx`:

```tsx
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { RAG_STROKE } from "./dependency-edge";

type NeighborRow = {
  id: string;
  title: string;
  teamName: string;
  rag: "green" | "amber" | "red";
  neededByDate: number;
  slackDays: number | null;
};

type SelectedNode = {
  title: string;
  teamName: string;
  status: string;
};

const fmt = (ms: number) => new Date(ms).toLocaleDateString();
const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

function NeighborList({
  heading,
  rows,
  onSelect,
}: {
  heading: string;
  rows: NeighborRow[];
  onSelect: (id: string) => void;
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
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className="flex w-full flex-col gap-0.5 rounded-md border p-2 text-left hover:bg-accent"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ background: RAG_STROKE[r.rag] }}
                  />
                  <span className="truncate">{r.title}</span>
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
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NodeInspectorPanel({
  node,
  upstream,
  downstream,
  onSelect,
  onClose,
}: {
  node: SelectedNode;
  upstream: NeighborRow[];
  downstream: NeighborRow[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col gap-4 overflow-y-auto border-l bg-background p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-medium">{node.title}</div>
          <div className="text-xs text-muted-foreground">
            {node.teamName} · {STATUS_LABEL[node.status] ?? node.status}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>
      <NeighborList heading="Depends on" rows={upstream} onSelect={onSelect} />
      <NeighborList heading="Depended on by" rows={downstream} onSelect={onSelect} />
    </aside>
  );
}
```

- [ ] **Step 2: Wire selection into the canvas**

Modify `components/graph/dependency-graph.tsx`. Add the import, selection state, neighbor computation, dim flags, click handlers, and render the panel.

Add to imports:

```tsx
import { useMemo, useState } from "react"; // extend the existing react import
import { NodeInspectorPanel } from "./node-inspector-panel";
```

Inside `DependencyGraph`, after `const data = usePreloadedQuery(preloaded);` add:

```tsx
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodeById = useMemo(
    () => new Map(data.nodes.map((n) => [n.id, n])),
    [data.nodes],
  );

  // Direct neighbors only (one hop) — transitive traversal is Phase 3.
  const neighborIds = useMemo(() => {
    const s = new Set<string>();
    if (!selectedId) return s;
    for (const e of data.edges) {
      if (e.source === selectedId) s.add(e.target);
      if (e.target === selectedId) s.add(e.source);
    }
    return s;
  }, [selectedId, data.edges]);

  const upstream = useMemo(
    () =>
      selectedId
        ? data.edges
            .filter((e) => e.target === selectedId)
            .map((e) => {
              const o = nodeById.get(e.source)!;
              return {
                id: o.id,
                title: o.title,
                teamName: o.teamName,
                rag: e.rag,
                neededByDate: e.neededByDate,
                slackDays: e.slackDays,
              };
            })
        : [],
    [selectedId, data.edges, nodeById],
  );

  const downstream = useMemo(
    () =>
      selectedId
        ? data.edges
            .filter((e) => e.source === selectedId)
            .map((e) => {
              const o = nodeById.get(e.target)!;
              return {
                id: o.id,
                title: o.title,
                teamName: o.teamName,
                rag: e.rag,
                neededByDate: e.neededByDate,
                slackDays: e.slackDays,
              };
            })
        : [],
    [selectedId, data.edges, nodeById],
  );

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;
```

Update the node `useEffect` `dimmed` value from `false` to:

```tsx
          dimmed:
            selectedId !== null && n.id !== selectedId && !neighborIds.has(n.id),
```

and add `selectedId`, `neighborIds` to that effect's dependency array.

Update the edge `useEffect` `dimmed` value from `false` to:

```tsx
          dimmed:
            selectedId !== null &&
            e.source !== selectedId &&
            e.target !== selectedId,
```

and add `selectedId` to that effect's dependency array.

Add the click handlers to `<ReactFlow>`:

```tsx
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
```

Render the panel after `</ReactFlow>`, still inside the `relative` container:

```tsx
        {selectedNode && (
          <NodeInspectorPanel
            node={selectedNode}
            upstream={upstream}
            downstream={downstream}
            onSelect={setSelectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
```

- [ ] **Step 3: Verify build + typecheck**

Run: `pnpm build`
Expected: succeeds, no type errors.

- [ ] **Step 4: Verify in the browser**

With `pnpm dev` running, load http://localhost:3000/graph and confirm:
- Clicking a node (e.g. Checkout API) dims all non-neighbor nodes and edges; the node, its direct providers (Auth Service, API Gateway) and consumers (In-App Purchase) and their connecting edges stay full-opacity.
- The side panel opens with the node's title/team/status, a "Depends on" list (its providers) and "Depended on by" list (its consumers), each row showing team, needed-by date, RAG dot, and slack.
- Clicking a neighbor row re-selects that node (panel + highlight update).
- Clicking empty canvas and clicking the panel's close button both clear selection (everything returns to full opacity, panel closes).
- A node with no edges (Billing Ledger) shows "None" under both lists.

- [ ] **Step 5: Full verification + commit**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all green.

```bash
git add components/graph
git commit -m "feat: click-to-inspect direct neighbors with highlight and side panel"
```

---

## Self-Review

**Spec coverage:**
- Graph-shaped query keeping provider/consumer IDs → Task 1. ✅
- dagre LR auto-layout, positions never stored → Task 2. ✅
- Nodes: title, team color, status, blocked emphasis → Task 3 Step 1. ✅
- Edges: RAG color, solid/dashed for blocking/soft, slack badge + hover tooltip, provider→consumer arrow → Task 3 Steps 2. ✅
- Canvas chrome: Background, Controls, legend, minimap skipped → Task 3 Steps 3–4. ✅
- Route + sidebar (Graph first) → Task 3 Steps 5–6. ✅
- Click-to-inspect: direct-neighbor highlight + dim + side panel, re-select, clear → Task 4. ✅
- Empty program / no-neighbor states → Task 3 Step 4, Task 4 Step 1. ✅
- Tests: `graph.test.ts`, `graph-layout.test.ts` → Tasks 1–2. ✅
- Out of scope (cascade/cycle/transitive/edit) — not built. ✅

**Deviation from spec (justified):** inspector is a non-modal `<aside>` rather than the shadcn `Sheet`, because the repo's `Sheet` is a modal base-ui dialog whose backdrop would block the canvas. Noted in Task 4.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `GraphNode`/`GraphEdge` field names (Task 1) match the `data` objects built in Task 3 and the neighbor rows in Task 4; `RAG_STROKE`, `DeliverableNodeType`, `DependencyEdgeType`, `NODE_WIDTH`, `layoutGraph` signatures are used consistently across tasks.
