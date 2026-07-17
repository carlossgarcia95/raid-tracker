# Decision Log (ADRs)

Lightweight architecture/decision records. One short entry per real decision: the context, the call, and what it costs. Add an entry whenever you make a choice you'd have to explain later — don't reconstruct reasoning from memory in December.

Format per entry: **Status** · **Context** · **Decision** · **Consequences**.

---

## ADR-0001 — Model dependencies as edges between deliverable nodes

**Status:** Accepted

**Context:** Cross-team dependencies are the core of the product. Modeling them as a flat list ("Team A depends on Team B") can't answer the questions that matter: what breaks downstream when something slips, and are there cycles. Those require a graph.

**Decision:** Deliverables are graph nodes (owned by a team); a Dependency is a directed edge from a provider deliverable to a consumer deliverable, carrying its own dates and status. Cross-team-ness is emergent (the two deliverables belong to different teams), not modeled directly.

**Consequences:** Enables cascade/impact analysis and cycle detection. Costs an extra entity (Deliverable) versus a naive team-to-team list. Referential integrity between edges and nodes becomes application code's responsibility (see ADR-0006).

---

## ADR-0002 — Convex as backend/DB over a relational stack (Postgres)

**Status:** Accepted

**Context:** Needed a backend, database, and deploy story for a solo part-time build. Two candidates: a relational stack (Postgres + an API layer) or Convex (BaaS with TypeScript functions and reactive queries). Already familiar with Convex.

**Decision:** Use Convex. It collapses API + DB + deploy into TypeScript functions, provides real-time reactive queries out of the box, and offers scheduled functions for the weekly digest.

**Consequences:** Big setup-time savings redirected to the graph/cascade work. Real-time updates come free and are on-narrative for a cross-team tool. Trade-off: it's a document database — no SQL joins, no DB-enforced foreign keys — so we give up the "clean relational schema" talking point and take on integrity in code. Judged a good trade for this project; the live cross-team picture demos better than schema normalization.

---

## ADR-0003 — Separate tables for Risks / Assumptions / Issues

**Status:** Accepted

**Context:** R, A, and I share several fields but each has type-specific fields (risk scoring, validation status, severity/resolution). Options: three separate tables, or one `raidItems` table with a `v.union` type discriminant.

**Decision:** Separate `risks`, `assumptions`, `issues` tables, each with its own validators.

**Consequences:** Self-documenting schema; type-specific fields are properly typed and required; simpler per-type queries. Costs mild duplication of shared fields. Dependencies stay first-class regardless (they're edges, not a RAID variant).

---

## ADR-0004 — Compute cascade analysis in application code, not SQL recursion

**Status:** Accepted

**Context:** Cascade (impact) analysis walks the dependency graph downstream from a slipped node. In a relational DB this is a recursive CTE; on Convex it's a traversal in a TypeScript query using the edge indexes.

**Decision:** Implement traversal (DFS/topological) in TypeScript, loading edges via the `by_provider` / `by_consumer` indexes.

**Consequences:** The algorithm is owned in readable code that's easy to explain in an interview and easy to unit-test. Follows naturally from ADR-0002. At large scale a recursive query might outperform it, but program scale (tens of deliverables) makes that irrelevant here.

---

## ADR-0005 — Convex reactive hooks for server state; no TanStack Query

**Status:** Accepted

**Context:** Considered adding TanStack Query for server-state caching. Convex's `useQuery`/`useMutation` hooks already provide reactive, cached, auto-updating server state.

**Decision:** Use Convex hooks for all server state. Do not add TanStack Query. Keep TanStack Table for grids. (Routing is handled by Next.js — see ADR-0007 — so TanStack Router is not used.)

**Consequences:** Avoids two libraries doing the same job. One clear data-fetching path. TanStack still earns its place for tables.

---

## ADR-0006 — Derived values are computed, never persisted

**Status:** Accepted

**Context:** Several values are functions of other fields: `slackDays` (neededBy − committed), risk `score` (probability × impact), and cascade-adjusted RAG.

**Decision:** Compute these in queries at read time; do not store them.

**Consequences:** Eliminates a whole class of drift bugs where a cached field disagrees with its inputs. Slightly more work per read, negligible at this scale. Note the deliberate exception in the audit log: `statusChanges.entityId` is a `v.string()` (not a typed `v.id`) because it points at five different tables — a conscious type-safety trade, not an oversight.

---

## ADR-0007 — Next.js (App Router) for the frontend

**Status:** Accepted

**Context:** Frontend framework choice. Options considered: a Vite + React SPA (plus TanStack Router) or Next.js.

**Decision:** Use Next.js with the App Router.

**Consequences:** File-based routing out of the box (retires the need for TanStack Router, ADR-0005), server-side rendering/preloading for fast first paint, and first-class Vercel deployment. Convex integrates cleanly: live `useQuery` hooks run in client components (`"use client"`), and `preloadQuery` from `convex/nextjs` gives server-rendered first paint that stays reactive via `usePreloadedQuery`. Cost: a heavier framework than a plain SPA and a client/server component distinction to keep straight — reasonable given the SSR and deploy benefits, and Next.js is a common expectation in the roles this project targets.

---

## ADR-0008 — shadcn/ui for components; pnpm as package manager

**Status:** Accepted

**Context:** Needed a component/styling approach and a package manager. UI options: a packaged component library (e.g. MUI) vs. shadcn/ui, which copies component source into the repo. Package manager: npm vs. pnpm.

**Decision:** Use Tailwind CSS + shadcn/ui, with components added via `pnpm dlx shadcn@latest add <name>` into `components/ui/`. Use pnpm for all install/run commands (`pnpm-lock.yaml` is the lockfile).

**Consequences:** shadcn components are owned code, not a dependency — fully customizable in place, no fighting a library's theming, and they compose cleanly with headless TanStack Table for the grids. Trade-off: components are copied, so upstream fixes aren't automatic; you update deliberately. pnpm gives fast, disk-efficient installs and a strict node_modules; the shadcn and Convex CLIs auto-detect it from the lockfile, so no extra config. Keep tooling consistent — don't mix in npm/yarn.

---

## ADR-0009 — React Flow (`@xyflow/react`) for graph visualization

**Status:** Accepted

**Context:** The dependency graph is the visual centerpiece, so the viz library is a load-bearing choice. Two candidates: React Flow (a React-native node/edge renderer) and Cytoscape.js (a graph library with built-in layout and analysis algorithms). Cytoscape is more graph-native; React Flow is the easier fit for a React codebase.

**Decision:** Use React Flow, installed as **`@xyflow/react`** (v12). Note the naming trap: the older `reactflow` package is v11 with different import paths — don't install it.

**Consequences:** Nodes and edges are ordinary React components, so team colors, RAG status, and slack rendering reuse the same Tailwind/shadcn vocabulary as the rest of the UI, and the graph stays reactive to Convex `useQuery` results with no adapter layer. Trade-off: React Flow ships rendering and interaction, not graph theory — it has no built-in layout or cycle detection. That costs us less than it looks like, because ADR-0004 already puts cascade and cycle traversal in our own TypeScript. Automatic layout is the real gap: if hand-positioning stops scaling, add a layout library (dagre or elk) rather than switching renderers. The graph is a client component (`"use client"`), per the reactivity model in ADR-0007.
