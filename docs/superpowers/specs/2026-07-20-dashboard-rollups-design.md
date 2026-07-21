# Phase 4 — Dashboard & Roll-ups (Design)

*Date: 2026-07-20 · Branch: `feat/dashboard` · Roadmap Phase 4*

## Problem

A TPM needs a single "Monday morning" view of program health: overall RAG, how many
deliverables and dependencies are at risk, which teams are hurting, and — most valuable —
*which at-risk items are hurting the most*. Today that picture is only reconstructable by
reading the graph node by node.

## Core idea

The dashboard is a **roll-up over the Phase-3 cascade engine**, not a new computation.
`computeCascade()` already returns per-deliverable and per-edge `effectiveRag` plus the
detected `cycles`. The dashboard runs the *same* cascade the graph view uses and aggregates
its output. This keeps one source of truth for "at risk" and makes the architecture story
clean: the graph and the dashboard share one engine.

## Scope

In scope (approved: *Core + RAID + Top Blockers*):

- Program-level RAG banner + headline counts.
- Deliverable and dependency RAG totals (green/amber/red) from the cascade.
- At-risk counts (deliverables, dependencies, cycles).
- Per-team health table.
- **Top Blockers** — at-risk deliverables ranked by downstream blast radius.
- RAID summary (risks / issues / assumptions roll-ups).

Out of scope: editing from the dashboard, historical trends/charts over time, program
selection (still single active program), the weekly digest (Phase 5).

## Architecture & data flow

```
loadActiveProgramGraph(ctx)
      │  teams, deliverables (nodes), dependency edges
      ▼
build AnalysisNode[] / AnalysisEdge[]   ← shared helper in model/graphData.ts
      ▼
computeCascade(nodes, edges, now)        ← reused unchanged (Phase 3)
      │  nodeStates, edgeStates, cycles
      ▼
rollUp(...) in model/rollups.ts          ← new, pure, unit-tested
      ▼
dashboard.get query returns one payload
```

### New / changed files

- **`convex/model/rollups.ts`** (new, pure, ctx-free — mirrors `graphAnalysis.ts`): takes the
  cascade result plus the deliverable/team/RAID docs and returns the dashboard payload.
  Unit-tested in isolation.
- **`convex/model/graphAnalysis.ts`** (extend): add pure `downstreamReach(nodes, edges)` that, for
  each deliverable, counts distinct downstream deliverables reachable via **blocking** edges
  (blast radius). Co-located with the other graph algorithms. Unit-tested.
- **`convex/model/graphData.ts`** (extend): extract the "build `AnalysisNode[]`/`AnalysisEdge[]`
  from the loaded graph" step (currently inline in `graph.ts`) into a shared helper so both
  `graph.ts` and `dashboard.ts` use it — removes duplication.
- **`convex/dashboard.ts`** (new, thin query `get`): `loadActiveProgramGraph` → build analysis
  nodes/edges (shared helper) → `computeCascade` → `rollUp`. Returns one payload. Returns an
  empty/zeroed payload when there is no active program (mirrors `graph.get`).
- **`convex/graph.ts`** (refactor only): use the shared node/edge-building helper.

## Dashboard payload (`dashboard.get` returns)

- **`program`** — `{ name, status }` and computed **`programRag`** = worst-case `effectiveRag`
  across all deliverables (red if any red, else amber if any amber, else green).
- **`deliverableTotals`** — `{ green, amber, red, total }` from cascade `nodeStates`.
- **`dependencyTotals`** — `{ green, amber, red, total }` from cascade `edgeStates`.
- **`atRisk`** — `{ deliverables, dependencies, cycles }` (amber+red counts; cycles from cascade).
- **`teams[]`** — per-team health, sorted worst-first:
  `{ teamId, name, color, rag, counts: { green, amber, red }, total }` where `rag` is the
  worst-case `effectiveRag` of the team's owned deliverables (green when the team owns none).
- **`topBlockers[]`** — at-risk deliverables (effectiveRag amber/red) ranked by
  `downstreamReach` descending, excluding zero-reach, top 5:
  `{ deliverableId, title, teamName, effectiveRag, downstreamCount, reasons }`.
  Rationale: downstream victims have little/no downstream reach and sort low, so upstream
  root causes rise to the top without needing explicit root-cause classification.
- **`raid`** — compact summary:
  - `risks: { open, mitigating, closed, topOpenByScore: [{ title, score, teamName }] (top 3) }`
  - `issues: { open, inProgress, resolved, bySeverity: { low, medium, high, critical } }`
    (severity counts over non-resolved issues)
  - `assumptions: { unvalidated, invalidated, validated }`

## UI — `/dashboard`

Client component using `preloadQuery` (server) → `usePreloadedQuery` (client), matching the
codebase's first-paint-then-live pattern. Live-updating thereafter via Convex reactivity.

Layout:

```
┌─ Program banner: name ····· [ RAG pill ]  "3 deliverables at risk · 1 cycle" ─┐
├─ Stat tiles: [Deliverables R/A/G] [Dependencies R/A/G] [At-risk] [Cycles] ────┤
├─ Per-team health (table, worst-first) │  Top blockers (ranked list w/ reasons)┤
├─ RAID summary: [Risks] [Issues] [Assumptions] compact cards ──────────────────┤
```

- Reuse the graph components' existing RAG color convention (pull the shared helper the graph
  already uses rather than redefining colors).
- Add shadcn `Card` (`pnpm dlx shadcn@latest add card`). `Badge` and `Table` already exist.
- Load the **dataviz** skill before building the stat tiles / RAG breakdowns so the totals read
  as one consistent system in light and dark.
- Per-team health uses shadcn `Table` (not TanStack Table — no sort/filter needed here).

## Routing

- Make `/dashboard` the landing page: change `app/page.tsx` redirect from `/deliverables` to
  `/dashboard`.
- Add "Dashboard" as the first item in `components/app-sidebar.tsx`.

## Testing

- **Pure unit tests** (no Convex ctx):
  - `convex/model/rollups.test.ts` — totals, per-team worst-case RAG, top-blocker ranking &
    exclusion of zero-reach, RAID summaries, empty-program payload.
  - `downstreamReach` cases in `convex/model/graphAnalysis.test.ts` — linear chain, fan-out,
    blocking vs non-blocking edges, cycles (must terminate).
- **Integration test** `convex/dashboard.test.ts` over seeded data (mirrors `graph.test.ts` /
  `seed.test.ts`): asserts the payload shape and a few known roll-ups from the seed.
- Run `pnpm test`, `pnpm lint`, `pnpm build` before completion.

## Verification

Drive the live app after tests pass: confirm the dashboard renders on seeded data and reacts —
marking a deliverable `blocked` should ripple into the totals, per-team health, and top blockers
live (Convex reactivity). Install/​use the browser tooling noted in memory for visual confirmation.

## Deliberate decisions

- **Program RAG is derived purely from the deliverable cascade.** Cycles already turn their
  members red, so they're captured. Open *critical issues* are surfaced in the RAID card but do
  **not** feed the program RAG headline, keeping it tied to the graph engine. (Revisit if a
  critical issue should darken the banner.)
- **Per-team and program RAG use worst-case, not majority.** Standard TPM convention: a program
  is only as green as its reddest critical item. The count breakdown is still shown alongside.
- **Top Blockers ranks by blast radius, not by a per-source attribution of downstream RAG.**
  Blast radius (downstream reach via blocking edges) is a clean, explainable graph metric and
  avoids threading source attribution through the cascade.

## Invariants respected

- No derived value persisted — `effectiveRag`, totals, blast radius, program RAG all computed at
  read time.
- Graph traversal stays in app code over `by_provider`/`by_consumer` (via the loaded edges).
- Single reactive query for the whole dashboard (no per-card query fan-out).
