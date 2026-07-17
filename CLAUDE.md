# CLAUDE.md

Cross-team RAID & dependency tracker. A directed graph of **deliverables** (nodes, owned by teams) and **dependencies** (edges) with cascade/impact analysis and cycle detection, plus Risks/Assumptions/Issues, a dashboard, and a weekly digest. Built on Convex + Next.js.

## Where the detail lives (read on demand)

Don't duplicate these here — read the file when the task touches it:
- `docs/PRD.md` — problem, goals, non-goals, success criteria
- `docs/TECHNICAL-DESIGN.md` — architecture, data model, algorithms
- `docs/DECISIONS.md` — decision log (why the stack/model is what it is)
- `docs/ROADMAP.md` — phased build plan
- `convex/schema.ts` — source of truth for the data model

(If you'd rather have any of these loaded every session, import it with `@docs/DECISIONS.md` syntax — but note imports load at launch and cost context, so keep it to what must always be present.)

## Stack

Next.js (App Router) + TypeScript · Convex (DB, backend, real-time, cron) · Tailwind CSS + shadcn/ui · TanStack Table · React Flow (**`@xyflow/react`** — v12; the legacy `reactflow` package is v11, don't use it). Package manager: **pnpm**. No TanStack Query, no TanStack Router.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first.** It contains rules that override what you may have learned about Convex from training data. Convex agent skills for common tasks can be installed with `npx convex ai-files install`.

## Commands

```bash
pnpm install
pnpm dev     # Convex backend + Next.js together, http://localhost:3000 (keep running)

pnpm lint    # eslint (ignores convex/_generated)
pnpm build   # next build — also typechecks
# test: TODO — no test script configured yet

pnpm dlx shadcn@latest add <component>   # add a shadcn/ui component
```

Use **pnpm** for everything (a `pnpm-lock.yaml` is the lockfile — don't introduce `npm`/`yarn`). Requires Node 20.9+ (Next.js 16). `pnpm dev` is `convex dev --start 'next dev'` — it runs **both** the backend and the frontend in one terminal, so don't also start `convex dev` separately. Run `pnpm lint` and `pnpm build` before reporting a task complete; add a test script here once one exists.

## Git

Trunk-based: `main` is always deployable. Short-lived branches (`feat/cascade-analysis`) per roadmap phase, self-reviewed PR, squash-merge. Trivial doc/config changes go straight to `main`. Tag `v0.x.0` when a roadmap phase lands.

`.env.local` holds the Convex deployment name and is gitignored — never force-add it. The vendored skills in `.claude/skills/` and `.agents/skills/` are gitignored too; they're restored by `npx convex ai-files install` from `skills-lock.json`.

## Invariants — do not violate these

These are the things that are easy to get wrong and won't show up as type errors:

- **Referential integrity is manual.** Convex has no foreign keys. When deleting a `deliverable`, delete its inbound and outbound `dependencies` in the *same mutation*, or you orphan edges and the graph render breaks. Same discipline for any other cross-table reference.
- **Derived values are never stored.** `slackDays` (neededBy − committed), risk `score` (probability × impact), and cascade-adjusted RAG are computed at read time in queries. Never persist them.
- **Dependencies are edges between deliverable nodes** — `providerDeliverableId → consumerDeliverableId`. Do not remodel them as team-to-team links; the graph algorithms depend on this shape.
- **Convex reactive hooks (`useQuery`/`useMutation`) run only in client components** (`"use client"`). For server-rendered first paint, use `preloadQuery` from `convex/nextjs` and pass the `Preloaded` payload to a client component via `usePreloadedQuery`. Don't call `useQuery` in a server component.
- **Dates are Unix-ms numbers** (`v.number()`), not strings or Date objects.
- **Risks, Assumptions, and Issues are separate tables**, not one table with a type field. Keep them separate.
- **Enforce integrity in mutations, via schema validators.** The validators in `schema.ts` are the equivalent of DB constraints here — lean on them.
- **Cascade/cycle logic is app-code graph traversal**, using the `by_provider` / `by_consumer` indexes. Don't reach for a different persistence layer to do it.

## Conventions

- Convex functions live in `convex/`; keep queries pure and side-effect-free, mutations for writes, actions for external calls (e.g. the digest).
- **UI: shadcn/ui.** Add components with `pnpm dlx shadcn@latest add <name>`; they land in `components/ui/` and are yours to edit — you own the code, so customize in place rather than wrapping. Build the R/A/I grids by composing TanStack Table with shadcn's Table primitives. Use the `cn()` helper from `lib/utils` for conditional classes.
- Prefer indexed queries (`.withIndex(...)`) over `.filter()` for anything on a hot path — especially the graph traversal.
- When a mutation changes a tracked field, write a `statusChanges` row so the weekly digest can pick it up.

## Scope guardrail

This is a portfolio piece; depth on the dependency graph + cascade + cycle detection beats breadth. **Do not rebuild Jira.** If asked to add general task-management features, flag that it's outside the v1 non-goals (see PRD) before building.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
