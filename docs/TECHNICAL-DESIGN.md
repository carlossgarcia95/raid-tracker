# Technical Design — Cross-Team RAID & Dependency Tracker

**Status:** Draft · **Last updated:** [date] · Companion to the PRD and the decision log.

## Overview

A Next.js app (App Router) backed by Convex. The domain is a directed graph: **deliverables** are nodes (owned by teams, scoped to a program), **dependencies** are edges between them. On top of that graph sit the other RAID items (risks, assumptions, issues), a dashboard, and a weekly digest job. The headline features are cascade (impact) analysis and cycle detection over the dependency graph.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Backend + DB | Convex | TS functions, reactive queries, scheduled functions; collapses API/DB/deploy |
| Server state | Convex hooks (`useQuery`/`useMutation`) | Reactive + cached; no TanStack Query needed |
| Frontend | Next.js (App Router) + TypeScript | File-based routing, SSR/preloading, first-class Vercel deploy |
| UI / styling | Tailwind CSS + shadcn/ui | Own-your-code components (copied into `components/ui/`), accessible primitives |
| Grids | TanStack Table (headless) + shadcn Table | Filterable/sortable R/A/I and dependency lists |
| Graph viz | React Flow (`@xyflow/react`) | The visual centerpiece |
| Hosting | Convex (backend) + Vercel (frontend) | Minimal ops; Vercel is the native Next.js target |
| Package manager | pnpm | Lockfile `pnpm-lock.yaml`; CLI tools auto-detect it |

Next.js gives us routing out of the box, so **TanStack Router is dropped** (it only made sense on a Vite SPA). Note the reactivity model: Convex's live `useQuery` hooks run in **client components** (`"use client"`). For first paint you can preload on the server with `preloadQuery` (from `convex/nextjs`) and hand a `Preloaded` payload to a client component via `usePreloadedQuery` — server-rendered first paint, still live thereafter. The graph and dashboard, which update in real time, are client components.

See the decision log for the reasoning behind Convex, the separate-tables choice, in-code traversal, and the graph-viz library.

## Data model

Eight tables: `programs`, `teams`, `deliverables` (nodes), `dependencies` (edges), `risks`, `assumptions`, `issues`, `statusChanges` (audit log). Full definitions live in `convex/schema.ts`. Key points:

- A **Dependency** carries both `neededByDate` and `committedDate`; the gap between them (`slackDays`) is where emergent risk surfaces and is computed at read time.
- `dependencies` is indexed `by_provider` and `by_consumer` — these power fast graph traversal in both directions.
- References (`v.id(...)`) are **not** DB-enforced; mutations maintain integrity (notably: deleting a deliverable must delete its inbound/outbound edges).
- Derived values (`slackDays`, risk `score`, cascade RAG) are never stored.

## Core algorithms

**Cascade / impact analysis.** Given a deliverable that slipped (or a dependency gone red), walk the graph downstream: from a node, query `dependencies by_provider` to find edges out to consumers, mark those consumers/edges at-risk, recurse. A DFS/topological traversal with a visited set. Runs as a Convex query returning the set of impacted items; the graph view colors them without persisting the result.

**Cycle detection.** During traversal, a node reachable from itself is a circular dependency. Detect with standard DFS coloring (white/grey/black) or by spotting a back-edge; surface cycles as an explicit warning rather than looping forever. Both algorithms assume program scale (tens of deliverables), which keeps in-memory traversal trivially fast.

## Key flows

- **Add dependency:** pick provider + consumer deliverables, set needed-by/committed dates → edge appears in graph with derived slack and RAG.
- **Mark slip:** update a deliverable's status/date → cascade query recomputes downstream risk → graph and dashboard update live (Convex reactivity).
- **Weekly digest:** a Convex cron runs Fridays, queries `statusChanges` over the last 7 days via built-in `_creationTime`, and composes the "what went at-risk this week" summary.

## Out of scope for v1

Auth/multi-tenant, granular permissions, mobile app, broad tool imports, thousands-of-node scale. (See PRD non-goals.)

## Open questions

- Graph nodes: deliverables only, or also render teams as super-nodes for a zoomed-out view?
- RAG derivation: how aggressively should upstream red push downstream amber vs. red?
- Import: is a single CSV import worth building in v1, or defer entirely?
