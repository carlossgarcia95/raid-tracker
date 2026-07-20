# Phase 2 — Dependency Graph (Design)

*Spec for the Phase 2 roadmap item: the visual dependency graph. Status: approved for planning.*

## Goal

Render the program's deliverables as a directed graph — deliverables as nodes, dependencies as edges colored by RAG — and let a user click a node to see what it directly depends on and what directly depends on it. This is the visual centerpiece of the project; it makes cross-team dependency direction and emergent (needed-by vs committed) risk legible at a glance.

## Scope

**In scope (Phase 2):**
- A graph view rendering deliverable nodes and dependency edges for the active program.
- Edges colored by their manually-set RAG; hard blocks vs soft dependencies visually distinct.
- The needed-by vs committed gap (`slackDays`) surfaced per edge.
- Click a node → highlight its direct neighbors on the canvas + open a side panel listing "Depends on" / "Depended on by".

**Explicitly out of scope (deferred to Phase 3):**
- Cascade / impact analysis and RAG derived from upstream state (edges use the manual `rag` only).
- Transitive / downstream traversal (inspect shows **direct** neighbors only — one hop).
- Cycle detection.
- Editing dependencies or deliverables from the graph.

## Key decisions

1. **Auto-layout with dagre (left-to-right layered DAG).** React Flow requires an `(x,y)` per node and does not arrange automatically. A layered LR layout encodes dependency *direction* into the visual (upstream left → downstream right), which is the core program-management signal and sets up the Phase 3 cascade view (downstream = to the right). Positions are computed at render time and **never stored** — consistent with the "derived values are never stored" invariant. No schema change. `@dagrejs/dagre` is added as a new dependency. (dagre can't cleanly layer a cycle, but cycles are a Phase 3 concern and dagre degrades gracefully.)
2. **Direct neighbors only for node-inspect.** The full transitive walk is essentially the Phase 3 cascade traversal; building it now would blur the phase boundary and get rewritten when cascade adds RAG derivation and cycle-safety.
3. **In-graph highlight + side panel** for inspection — both the visual "see the neighborhood" payoff and a readable list with dates/RAG.
4. **Dedicated graph-shaped query** rather than bending `dependencies.list`, because the table query resolves titles but drops the provider/consumer IDs that React Flow needs to wire `source`→`target`.

## Architecture & data flow

**New Convex query — `convex/graph.ts` → `get`** (one reactive subscription, shaped for React Flow):
- `nodes`: `{ id, title, status, teamName, teamColor }` per deliverable in the active program (via the `by_program` index, like `deliverables.list`).
- `edges`: `{ id, source: providerDeliverableId, target: consumerDeliverableId, rag, isBlocking, neededByDate, committedDate, slackDays, description, providerTitle, providerTeamName, consumerTitle, consumerTeamName }`.
- Edges are filtered to the active program using the same rule as `dependencies.list` (provider deliverable is in the program). `slackDays` is computed via the existing `model/derived` helper; it is `null` when `committedDate` is absent.

**Client-side layout — `lib/graph-layout.ts`:** a pure dagre wrapper (no React) that takes nodes + edges and returns nodes with `(x,y)` assigned, LR direction. Unit-testable in isolation.

**Rendering:** route `app/(app)/graph/page.tsx` (server component) runs `preloadQuery(api.graph.get)` for server-rendered first paint, and passes the `Preloaded` payload to a `"use client"` `<DependencyGraph>` that reads it via `usePreloadedQuery` (live thereafter), runs the dagre helper, and renders `<ReactFlow>`. Matches the CLAUDE.md preload-then-live pattern; the reactive hook stays in a client component.

**Component split:**
- `components/graph/dependency-graph.tsx` — client canvas; owns React Flow, selection state, and the dagre call.
- `components/graph/deliverable-node.tsx` — custom node.
- `components/graph/dependency-edge.tsx` — custom edge (or a styled default).
- `components/graph/node-inspector-panel.tsx` — the side panel (built on the already-installed shadcn `sheet`).
- `lib/graph-layout.ts` — pure dagre wrapper.

## Visual encoding

**Nodes:**
- Title as the primary label.
- Team color as a left accent bar / border (from `teamColor`), making cross-team ownership pop.
- Status as a small badge/dot; `blocked` gets extra visual weight (e.g. a red ring).
- Target handle on the left, source handle on the right (clean LR edge routing).

**Edges:**
- Colored by RAG (green / amber / red) — the headline encoding, using the manual `rag` field.
- `isBlocking` → solid; soft dependency → dashed.
- `slackDays` shown as a small badge on the edge label (e.g. `-4d`, red when negative = committed after needed); full detail (both dates, description) in a hover tooltip. Absent `committedDate` → no slack badge, just the RAG color (correct behavior, not a bug).
- Arrowhead points provider → consumer.

**Canvas chrome:** `<Background>`, `<Controls>`, and a small legend (RAG colors + solid/dashed meaning). Minimap skipped at program scale.

## Interaction

Selection state (`selectedNodeId`) lives in `<DependencyGraph>`.

On node click:
- Compute the direct neighborhood from edges already in memory (no extra query): `upstream` = edges where `target === selectedId`; `downstream` = edges where `source === selectedId`.
- Canvas: selected node + direct neighbors + connecting edges at full opacity; everything else dimmed (~0.25) via a `dimmed` flag passed into node/edge data. No re-layout.
- Side panel slides in: selected deliverable's title/team/status, then **Depends on** (upstream neighbors with team, edge RAG, needed-by, slack) and **Depended on by** (downstream neighbors, same detail).
- Clicking a neighbor row re-selects that node. Clicking empty canvas / close clears selection.

**Empty/edge cases:** a node with no neighbors shows "No upstream/downstream dependencies." An empty program shows an empty-state message instead of a blank canvas.

## Navigation

Add `{ href: "/graph", label: "Graph" }` to the `NAV` array in `components/app-sidebar.tsx`, placed at the top (above Deliverables) as the centerpiece landing view.

## Testing

- `convex/graph.test.ts` (vitest + convex-test): seed a small program; assert `graph.get` returns correct node/edge counts, edges carry correct `source`/`target` IDs and computed `slackDays`, and a deliverable in another program is excluded. Mirrors `dependencies.test.ts`.
- `lib/graph-layout.test.ts` (pure): feed the dagre helper a tiny node/edge set; assert every node gets numeric `(x,y)` and a provider lands left of its consumer (LR ordering).
- Visual: React Flow rendering, custom node/edge styling, and highlight behavior are verified in the browser (install the `agent-browser` skill at implementation time per the standing memory note); not meaningfully unit-testable.

**Definition of done:** `pnpm test`, `pnpm lint`, `pnpm build` all green; graph renders from seed data with RAG-colored edges and slack badges; click-to-inspect highlights direct neighbors and opens the panel.
