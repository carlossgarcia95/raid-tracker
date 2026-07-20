# Phase 3 — Cascade Analysis + Cycle Detection (Design)

*Spec for the Phase 3 roadmap item: the differentiators. Status: approved for planning.*

## Goal

Turn the static dependency graph into an analytical one. Two algorithms over the directed
dependency graph, both owned in plain TypeScript (ADR-0004):

1. **Cascade / impact analysis** — when a deliverable slips or a dependency is in trouble,
   propagate that risk downstream and re-color every affected node/edge by its *effective*
   (cascade-adjusted) RAG, with an attributed reason. Emergent, cross-team risk becomes visible
   the moment it exists — not only where someone manually set a flag.
2. **Cycle detection** — flag circular dependencies (a real program killer) and surface them
   explicitly, and make the cascade traversal cycle-safe.

This is the algorithmic signal that separates the project from "a PM who built a CRUD app."

## Scope

**In scope (Phase 3):**
- A pure graph-analysis module (cycle detection + cascade propagation) with no Convex `ctx`.
- `graph.get` extended to return per-node/per-edge `effectiveRag` + `reasons` and a top-level `cycles` list.
- Graph UI colored by `effectiveRag`; cycle members visually flagged; a cycle warning banner.
- Node inspector extended from one-hop to **transitive** upstream/downstream, with per-row reason
  and a "slipping this puts N downstream deliverables at risk" header.
- **One minimal write path**: `deliverables.setStatus` + `dependencies.setRag`, each writing a
  `statusChanges` row — enough to demo the live ripple (Convex reactivity).
- A shared active-program-graph loader helper, folding in a Phase-2 follow-up.

**Explicitly out of scope (later phases):**
- Full deliverable/dependency CRUD (create/delete, editing dates/teams). Only the two setters above.
- The weekly digest / cron and any consumption of `statusChanges` beyond writing rows (Phase 5).
- Dashboard roll-ups (Phase 4).
- Persisting any derived value (forbidden by ADR-0006) — no schema changes at all.

## Key decisions

1. **Cascade sources are a mixed seed set of nodes *and* edges.** Four signals seed the traversal:
   **blocked** deliverables and **overdue** deliverables (not-done with a past `targetDate`) are node
   sources; **manually-red** dependencies and **negative-slack** dependencies (`slackDays < 0`) are
   edge sources. **Cycle members are also treated as a (red) source** — a circular dependency is a hard
   structural failure, not just a warning. One downstream DFS runs from all seeds at once.
2. **Severity-tiered propagation** (not uniform-red, not distance-decay). A **hard** source (blocked
   deliverable, red edge, cycle member) pushes downstream to **red**; a **soft** source (negative
   slack, overdue) pushes to **amber**. A **non-blocking** edge softens propagation one level as risk
   crosses it (red→amber, amber→drops off); blocking edges carry full severity. Effective RAG is the
   `max` over baseline and all propagated contributions on the ordering `red > amber > green`. This is
   the credible answer to the tech-design open question "how aggressively should upstream red push
   downstream."
3. **Attribution, not a boolean.** Every flagged node/edge carries `reasons: string[]`
   (`"blocked: Checkout API"`, `"negative slack −4d"`, `"cycle member"`). Cheap to collect during
   traversal; powers the inspector's explanation and pre-shapes Phase 5's "what went at-risk, *and why*".
4. **Derived, never persisted (ADR-0006).** `effectiveRag`, `reasons`, and `cycles` are computed at
   read time in `graph.get` and returned in its payload. Manual `rag` stays stored and is returned
   alongside `effectiveRag`, so the UI can show "manual amber → now red (upstream blocked)". No schema change.
5. **Node effective RAG is fully derived.** Deliverables store only `status`, no RAG. A node's
   `effectiveRag` is green by default, elevated by its own source-ness and by propagation, and rendered
   as a **ring** around the node (reusing the `ring-red-500` vocabulary already in `deliverable-node.tsx`);
   the team-color body is untouched.
6. **The traversal lives server-side; the selection view is client-side.** The cascade + cycle
   computation (the ADR-0004 algorithm) runs in the `graph.get` query. The *selection-scoped* transitive
   reachability that powers the inspector (given all edges the client already holds) is a small pure
   function in `lib/graph-traverse.ts` — a UI concern, unit-tested separately.
7. **One minimal mutation pair, not CRUD.** `deliverables.setStatus` and `dependencies.setRag` are the
   smallest write surface that makes the live ripple demoable and exercises the "write a `statusChanges`
   row when a tracked field changes" convention. Full CRUD is deliberately deferred.

## Architecture & data flow

### Pure algorithm module — `convex/model/graph-analysis.ts`
Plain functions over plain arrays (no Convex `ctx`), so they unit-test in isolation.

- **Inputs** are minimal shapes: nodes `{ id, status, targetDate }`, edges
  `{ id, source, target, rag, isBlocking, slackDays }` (`source` = provider, `target` = consumer).
- **`detectCycles(nodes, edges): Cycle[]`** — DFS white/grey/black coloring; a back-edge (to a grey
  node) closes a cycle. Each `Cycle = { deliverableIds: string[], edgeIds: string[] }` (members in loop
  order). Handles self-loops, disjoint multiple cycles, and acyclic graphs (empty result).
- **`computeCascade(nodes, edges, now): { nodeStates, edgeStates, cycles }`**:
  1. Run `detectCycles`; collect cycle-member ids.
  2. Build the seed set: blocked nodes, overdue nodes (`status !== "done" && targetDate < now`),
     red edges, negative-slack edges, cycle members — each tagged hard/soft with a reason string.
  3. Downstream DFS from every seed over `by_provider` direction, with a **visited set keyed by
     (item, severity)** so cycles terminate and a node can still be upgraded red after being seen amber.
     Apply the non-blocking softening rule as risk crosses each edge.
  4. Return `nodeStates[id] = { effectiveRag, reasons }`, `edgeStates[id] = { effectiveRag, reasons }`,
     and `cycles`. `effectiveRag` is the max severity accumulated; `reasons` is the deduped attribution list.

### Server query — `convex/graph.ts` → `get` (extended)
- Loads the active-program graph via the new shared helper, computes `slackDays` per edge (existing
  `model/derived`), then calls `computeCascade`.
- Each returned **node** gains `effectiveRag` + `reasons`; each returned **edge** gains `effectiveRag`
  + `reasons` (retaining manual `rag`, `isBlocking`, dates, `slackDays`). Adds top-level `cycles`.
- Trims the 4 currently-unused denormalized edge fields (`providerTitle`/`providerTeamName`/
  `consumerTitle`/`consumerTeamName`) — the UI derives these from the node map — and updates the one
  test that reads them.

### Shared loader — `convex/model/graph-data.ts` (folds in a Phase-2 follow-up)
`loadActiveProgramGraph(ctx)` → `{ program, teamById, deliverableById, edges }` (edges filtered to
the active program). DRYs the `teamById`/`deliverableById`/name-resolution logic currently triplicated
across `graph.ts`, `dependencies.ts`, and `deliverables.ts`; cascade is the 4th consumer, which is the
trigger to extract it. `graph.get`, `dependencies.list`, and `deliverables.list` are refactored onto it.

### Mutations — `convex/deliverables.ts` + `convex/dependencies.ts`
- **`deliverables.setStatus({ id, status })`** — validator-guarded (`deliverableStatus`); when the
  status actually changes, insert a `statusChanges` row (`entityType: "deliverable"`, field `"status"`,
  old/new). Sets/clears `actualDate` when moving to/from `done`, consistent with the seed's convention.
- **`dependencies.setRag({ id, rag })`** — validator-guarded (`rag`); on change, insert a
  `statusChanges` row (`entityType: "dependency"`, field `"rag"`).
- Both are ordinary Convex mutations; no cross-table integrity concerns (neither deletes).

### Client — graph UI
- **Coloring** switches from manual `rag` to `effectiveRag` for both node rings and edge strokes
  (`dependency-graph.tsx` `useEffect`s that build `nodes`/`edges`).
- **Cycle banner** — a new component above the `<ReactFlow>` canvas listing detected cycles
  (`"Data Pipeline → Analytics Dashboard → Reporting Service → Data Pipeline"`); clicking a cycle fits
  the view to its members. Cycle members render with a distinct (dashed) ring.
- **Inspector goes transitive** — the current one-hop `upstream`/`downstream` `useMemo`s
  (`dependency-graph.tsx:42`) are replaced by transitive sets computed via `lib/graph-traverse.ts`;
  each row shows the neighbor's `effectiveRag` + its reason; the panel header shows the count
  ("Slipping this puts N downstream deliverables at risk").
- **Live edit control** — a minimal status select on the node inspector (and RAG select on the edge/
  inspector) calls the new mutations via `useMutation`, so a change re-colors the graph live.

### `lib/graph-traverse.ts`
Pure reachability over an edge list: `downstreamOf(id, edges)` / `upstreamOf(id, edges)` returning the
transitive set (with visited-set cycle safety). No React; unit-tested.

## Testing (TDD)

Written test-first; the algorithm's testability is the whole point of ADR-0004.

- **`convex/model/graph-analysis.test.ts`** (pure, vitest): cycle detection (the seed's 3-node cycle,
  a self-loop, an acyclic graph → none, two disjoint cycles); cascade propagation (a blocking chain
  propagates red downstream; a non-blocking edge softens red→amber; a diamond / multi-path node takes
  the max severity; traversal terminates on a cycle; hard-source→red vs soft-source→amber; overdue and
  negative-slack seeds resolve against a pinned `now`).
- **`lib/graph-traverse.test.ts`** (pure, vitest): downstream/upstream transitive sets, including a
  cyclic graph (no infinite loop) and an isolated node (empty set).
- **`convex/graph.test.ts`** (convex-test, extended): against the seed, `graph.get` returns the expected
  `effectiveRag` for known chain/cycle members, `cycles` contains the planted cycle, and `reasons`
  are populated; existing node/edge assertions still pass after the denormalized-field trim.
- **`convex/deliverables.test.ts` / `convex/dependencies.test.ts`**: `setStatus`/`setRag` update the
  doc, write exactly one `statusChanges` row on a real change (and none on a no-op), and `setStatus`
  toggles `actualDate` at the `done` boundary.

Gate the phase on `pnpm test` + `pnpm lint` + `pnpm build`, per CLAUDE.md.

## Non-goals / invariants honored

- **No schema changes**; no persisted derived values (ADR-0006). `effectiveRag`/`reasons`/`cycles` exist
  only in query payloads.
- **No full CRUD** — two setters only (scope guardrail: depth on graph/cascade over breadth).
- Cascade/cycle logic is **app-code graph traversal over `by_provider`/`by_consumer`** (ADR-0004,
  CLAUDE.md invariant) — no other persistence layer.
- Dependencies remain **provider→consumer edges between deliverable nodes** — unchanged shape.
- Mutations enforce integrity via schema validators and write `statusChanges` on tracked-field changes.
