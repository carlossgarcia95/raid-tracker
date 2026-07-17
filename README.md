# RAID Tracker — Cross-Team Dependency & Risk Management

> A live, shared view of cross-team program health. Tracks Risks, Assumptions, Issues, and Dependencies — and models what happens when one dependency slips.

[**Live demo →**](#) · [**Case study / write-up →**](#)

<!-- Add a screenshot or GIF of the dependency graph here — it's the first thing visitors should see. -->
![Dependency graph screenshot](docs/screenshot.png)

## Why this exists

On multi-team programs, the timeline killers hide in the seams between teams — a dependency that looks fine until an upstream slip cascades through everything downstream. This tool makes those dependencies first-class, surfaces emergent risk before it becomes a fire, and gives every team one live picture of program health.

## Highlights

- **Dependency graph** — deliverables as nodes, cross-team dependencies as edges, colored by status.
- **Cascade / impact analysis** — mark one deliverable as slipped and watch risk propagate to every downstream dependent.
- **Cycle detection** — circular dependencies are surfaced, not silently accepted.
- **Needed-by vs. committed dates** — every dependency shows its slack (or its gap).
- **Live updates** — real-time across all users via Convex.
- **Weekly digest** — an automated "what went at-risk this week" summary.

## Tech stack

Next.js (App Router) + TypeScript · Convex (backend, DB, real-time, scheduled functions) · Tailwind CSS + shadcn/ui · TanStack Table · React Flow · pnpm

See [`docs/TECHNICAL-DESIGN.md`](docs/TECHNICAL-DESIGN.md) for architecture and [`docs/DECISIONS.md`](docs/DECISIONS.md) for the decision log.

## Getting started

```bash
# Prerequisites: Node 20.9+, pnpm, a Convex account (free)
git clone <repo-url>
cd raid-tracker
pnpm install

# Start everything — provisions tables from convex/schema.ts, runs the
# Convex backend and the Next.js dev server together in this one terminal.
pnpm dev

# shadcn/ui is already configured; add components as needed
pnpm dlx shadcn@latest add button table dialog

# Load demo data
# TODO: document the seed command once the seed mutation exists
```

Visit `http://localhost:3000`.

## Project docs

- [`docs/PRD.md`](docs/PRD.md) — problem, goals, non-goals, success criteria
- [`docs/TECHNICAL-DESIGN.md`](docs/TECHNICAL-DESIGN.md) — architecture, data model, algorithms
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — architecture decision records
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased build plan

## Project structure

```
convex/          # schema, queries, mutations, scheduled functions
  schema.ts      # tables, validators, indexes
app/             # Next.js App Router — routes, layouts, pages
  layout.tsx     # wraps the app in ConvexClientProvider
components/       # graph, tables, dashboard (client components)
  ui/            # shadcn/ui components (owned, editable)
docs/            # PRD, design, decisions, roadmap
```
<!-- Fill in as the structure solidifies. -->

## Status

🚧 In active development — see the roadmap for current phase.

## License

[Choose one — MIT is a fine default for a portfolio project.]
