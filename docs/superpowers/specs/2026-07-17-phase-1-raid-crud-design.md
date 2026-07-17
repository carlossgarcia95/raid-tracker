# Phase 1 — Core RAID CRUD (Walking Skeleton) — Design

**Date:** 2026-07-17
**Roadmap phase:** Phase 1 (see `docs/ROADMAP.md`)
**Status:** Approved, ready for implementation planning

## Goal

Turn the existing data model (`convex/schema.ts`) into something usable end-to-end: an
engineered demo program in the database, read queries that expose it, and sidebar-navigated
tables that render it. This is the walking skeleton every later phase reads from — the
dependency graph (Phase 2), cascade/cycle analysis (Phase 3), dashboard (Phase 4), and
weekly digest (Phase 5) all build on the data and queries defined here.

**Scope discipline:** the interview signal lives in Phases 2–3 (graph + cascade + cycle).
Phase 1 is deliberately lean — seed-first and read-heavy, no interactive create/edit forms.
Do not gold-plate the CRUD.

## Decisions (settled during brainstorming)

1. **Read-heavy + seed**, not interactive CRUD. A seed mutation is the primary way data
   enters the system in Phase 1. Filterable/sortable read tables are the UI. Create/edit
   forms are deferred to a later pass.
2. **Sidebar + one route per entity.** Scales cleanly into Phase 2 (graph gets its own
   route) and Phase 4 (dashboard becomes home).
3. **Seed is engineered for the demo** — deliberately contains a multi-hop cascade chain and
   one planted cycle, so Phases 2–3 are demoable the moment they're built.
4. **Testing: `convex-test` + Vitest now**; `agent-browser` for visual checks; Playwright/E2E
   deferred to Phase 2.

## Architecture & data flow

### Backend (Convex) — all reads plus one seed

- **`convex/seed.ts`** — an `internalMutation` (`seed:run`) that tears down and repopulates
  the engineered demo program. Idempotent: teardown then insert, so re-running gives a clean
  known state. Invoked via `npx convex run seed:run`, with an optional dev-only "Reseed"
  button in the UI.
- **One read query per entity**, each scoped to the demo program:
  - `deliverables.list`, `dependencies.list`, `risks.list`, `assumptions.list`,
    `issues.list`, `teams.list`, `programs.list`.
  - Program scoping: fetch "the first program" (single-program app; no program switcher —
    YAGNI). Entity list queries resolve the active program internally or take its id.
  - Queries **join in human-readable names** so tables never render raw ids: owning team
    name on deliverables/risks/issues; provider and consumer deliverable titles on
    dependencies.

### Derived values — computed in-query, never stored

Honoring the CLAUDE.md invariant that derived values are never persisted:

- `dependencies.list` returns `slackDays = neededByDate − committedDate` (negative = at risk
  on its own).
- `risks.list` returns `score = probability × impact`.

These calculations are extracted as **pure functions** (unit-testable in isolation) and also
exercised through the query return shape by `convex-test`.

### Referential-integrity helper

- **`convex/model/deliverables.ts`** (or equivalent helper module) exposes
  `deleteDeliverableCascade(ctx, deliverableId)` — deletes the deliverable plus its inbound
  (`by_consumer`) and outbound (`by_provider`) dependency edges in the **same mutation**.
- The seed's teardown uses this helper rather than blindly wholesale-clearing tables, so the
  CLAUDE.md invariant ("delete a deliverable → delete its edges in the same mutation") is
  established from day one and reused by Phase 2+ delete paths.

### Frontend (Next.js App Router)

- **Sidebar layout** wrapping the entity routes.
- **One route per entity:** `/deliverables`, `/dependencies`, `/risks`, `/assumptions`,
  `/issues`, `/teams`.
- Each route is a **server component** that calls `preloadQuery` for its data and passes the
  `Preloaded` payload to a **client** `<DataTable>` component, which uses `usePreloadedQuery`
  + TanStack Table + shadcn Table primitives. This satisfies the invariant "no `useQuery` in
  server components" while keeping Convex real-time reactivity.
- **`components/data-table.tsx`** — a reusable TanStack Table wrapper composing shadcn's
  Table primitives (sortable, filterable). Per-entity **column definitions are colocated with
  each route**.
- Filtering: at minimum filter-by-team and filter-by-status where the entity supports it
  (per the roadmap Phase 1 description).
- Visual styling: clean shadcn defaults. Distinctive visual design is deferred to a later
  polish pass — Phase 1 proves the data flow, not the aesthetic.

## The engineered seed

A believable cross-team effort (e.g. "Q3 Platform Launch") with ~4 teams (Platform,
Payments, Mobile, Data), each owning a few deliverables. Hand-authored so the graph phases
have dramatic, meaningful cases:

- **Multi-hop cascade chain** — e.g. Platform *Auth Service* → Payments *Checkout API* →
  Mobile *In-App Purchase* → *App Store Release*. A Phase 3 slip upstream propagates 3+ hops:
  a visible ripple, not a one-edge toy.
- **One planted cycle** — e.g. *Data Pipeline* ⇄ *Analytics Dashboard* through an
  intermediate. Subtle enough to read as a genuine program mistake, so cycle detection has a
  real circular dependency to catch.
- **Meaningful variety on first load** — mixed RAG values, deliverable statuses, and dates
  (including some dependencies with negative slack where committed is after needed-by), a
  spread of risk scores and issue severities. Every read table shows variety immediately, and
  the eventual dashboard roll-ups aren't uniformly green.

## Deliberate deferrals (intentional, not forgotten)

- **`statusChanges` is not written in Phase 1.** There are no tracked-field mutations yet
  (seed inserts are not "changes"). It comes online when edit mutations do, feeding the
  Phase 5 digest.
- **Cascade-adjusted RAG is not computed.** `dependencies.list` returns the manual `rag`
  baseline only. Deriving RAG from upstream state is the Phase 3 centerpiece.
- **No create/edit/delete UI.** Data enters via the seed. Interactive forms are a later pass.
- **No program switcher.** Single demo program is assumed throughout.

## Testing

Two layers; establish the harness now because it is what Phase 3's cascade/cycle algorithms
will be TDD'd against.

1. **`convex-test` + Vitest (backend, set up now).** Adds a `pnpm test` script, retiring the
   CLAUDE.md `test: TODO`. Phase 1 tests:
   - **Derived values** — `slackDays` and risk `score`, both as pure-function unit tests and
     through the actual query return shape.
   - **Seed integrity** — assert the seeded program actually contains the cascade chain and
     the planted cycle, so those demos can't silently rot.
   - **`deleteDeliverableCascade`** — assert that deleting a deliverable leaves zero orphaned
     dependency edges (the invariant that won't surface as a type error).
2. **`agent-browser` for visual verification** once the tables render — manual/agent-driven
   eyeballing that tables display correctly end-to-end, not automated E2E.
3. **Playwright/E2E deferred to Phase 2**, where the React Flow graph makes visual regressions
   both more likely and more costly.

**Implementation note:** read `convex/_generated/ai/guidelines.md` before writing Convex code
and before wiring up `convex-test` — CLAUDE.md flags that it overrides training-data
assumptions about Convex.

## Definition of done

- `npx convex run seed:run` populates the engineered demo program (and re-runs cleanly).
- All six entity routes render their data in sortable/filterable tables under a sidebar,
  showing joined names (not raw ids) and derived `slackDays` / `score` columns.
- `deleteDeliverableCascade` helper exists and is covered by a test proving no orphaned edges.
- `pnpm test` runs the `convex-test` suite; `pnpm lint` and `pnpm build` pass.
- Visual check via `agent-browser` confirms the tables render correctly.
