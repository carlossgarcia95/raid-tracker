# Phase 5 — Weekly Status Digest (Design)

*Date: 2026-07-21 · Roadmap Phase 5 ("one wow automation") · Branch: `feat/weekly-digest`*

## Problem

The `statusChanges` audit log is written on every `deliverables.setStatus` and
`dependencies.setRag`, but **nothing reads it**. The roadmap's Phase 5 turns that
dead log into a genuine TPM artifact: a weekly status digest — *"what went at-risk
this week, and why"* — produced by a real Convex scheduled function, not a button
you press.

This closes the one remaining unmet PRD success criterion ("the app generates a
weekly digest without manual assembly") and demonstrates Convex's cron capability,
which nothing else in the app currently exercises.

## Decisions (locked during brainstorming)

1. **Output:** a new `digests` table **and** a `/digest` UI page — a fully visible,
   reactive artifact, not an invisible cron.
2. **Text generation:** deterministic **templated markdown** from a pure function.
   No LLM, no external API, no secrets — fully unit-testable and demo-safe.
3. **Content depth:** risk-focused with **cascade impact context** — lead with
   worsening transitions, resolve names, group by team, and enrich with
   downstream-impact counts reusing the Phase-3 graph traversal.
4. **Trigger & dedup:** a **"Generate now"** button **plus** the Friday cron, both
   **upserting** the current week's digest (re-running replaces that week's row).

## Out of scope (deferred, per roadmap)

- Email/Slack delivery (the roadmap's optional bonus).
- LLM-composed narrative.
- Multi-program scoping (the whole app is single-program today; the `digests`
  table intentionally carries no `programId` — see Follow-ups).

## Data model

New table in `convex/schema.ts`:

```ts
digests: defineTable({
  weekKey: v.string(),        // "2026-07-20" — Monday-of-week (UTC); dedup + label key
  periodStart: v.number(),    // window start (Unix-ms)
  periodEnd: v.number(),      // generatedAt (Unix-ms)
  markdown: v.string(),       // the rendered digest — the canonical artifact
  worsenedCount: v.number(),  // headline stats so the UI need not re-parse markdown
  improvedCount: v.number(),
  totalChanges: v.number(),
}).index("by_week", ["weekKey"]),
```

No change to `statusChanges`: the 7-day read uses the built-in `by_creation_time`
index that every table has, so no new index is needed. `digests` carries no
`programId`, consistent with the rest of the single-program app.

## Function topology

Generation is DB-reads + DB-write with no external call, so it is a **mutation**
(no action, no `"use node"`). Shared logic lives in a `model/` helper that both the
public button-mutation and the internal cron-mutation call directly (per Convex
guideline: share a helper rather than call mutation-from-mutation).

**`convex/model/digest.ts`**
- `composeDigest(changes, graph, now)` — **pure function**. Given the window's
  `statusChanges` rows, the current graph (from `loadActiveProgramGraph`), and
  `now`, returns:
  `{ weekKey, periodStart, periodEnd, markdown, worsenedCount, improvedCount, totalChanges }`.
- `mondayOfWeekUTC(ms)` / `weekKey(ms)` — pure date helpers (UTC Monday 00:00),
  independently tested.
- `runDigest(ctx, now)` — orchestration on a `MutationCtx`:
  1. `cutoff = now - 7*24*60*60*1000`.
  2. Read `statusChanges` where `_creationTime >= cutoff` via the
     `by_creation_time` system index.
  3. `graph = await loadActiveProgramGraph(ctx)` (returns `null` if no active
     program → compose still produces an "all quiet" digest).
  4. `result = composeDigest(changes, graph, now)`.
  5. **Upsert**: look up `digests` by `weekKey` (`by_week`); `patch` if present,
     else `insert`. Return the digest `_id`.

**`convex/digests.ts`**
- `generateNow` — public `mutation({ args: {} })` → `await runDigest(ctx, Date.now())`.
  (`Date.now()` is allowed in mutations.) Wired to the UI button.
- `weeklyDigest` — `internalMutation({ args: {} })` → `await runDigest(ctx, Date.now())`.
  The cron target.
- `getLatest` — `query` → the most recent digest (highest `periodEnd`), or `null`.
- `list` — `query` → all digests, newest first (for the past-weeks switcher).

**`convex/crons.ts`** (new)
```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// Fridays 16:00 UTC. crons.cron (not the weekly helper) per guidelines.
crons.cron("weekly digest", "0 16 * * 5", internal.digests.weeklyDigest, {});
export default crons;
```

## Composer logic (the "why")

**Classification** via a badness rank; a change is *worsening* if
`rank(new) > rank(old)`, *improving* if `rank(new) < rank(old)`, else *other*:
- Deliverable `status`: `blocked`=3, `not_started`=1, `in_progress`=1, `done`=0.
- Dependency `rag`: `red`=2, `amber`=1, `green`=0.

**Name resolution:** map each change's `entityId` to its current title + owning
team via the graph maps. An entity missing from the graph falls back to a
`(removed)` label (cannot occur today — no delete mutation exists — but keeps the
composer total).

**Impact enrichment** (reusing `model/graphAnalysis.ts`):
- Worsening **deliverable** → count downstream deliverables it blocks via
  `downstreamReach`/`computeCascade`, plus distinct owning teams:
  *"blocks N downstream deliverables across M teams."*
- Worsening **dependency** → provider→consumer titles/teams and slack days lost.

**Markdown shape:**
```
# Weekly Digest — Week of {weekKey}
_{periodStart date} – {periodEnd date}, generated {generatedAt}_

**{worsenedCount} went at-risk · {improvedCount} recovered · {totalChanges} changes**

## ⚠️ Went at-risk this week
### {Team}
- **{Deliverable}** moved `in_progress → blocked` — blocks **3** downstream deliverables across 2 teams
- **{Provider} → {Consumer}** dependency went `green → red` — 5 days slack lost

## ✅ Recovered / improved
- ...

## Other changes
- ...
```
Empty window → a single "No tracked status changes in the last 7 days — all quiet."

## Window vs. week key

Content uses a **rolling `[now − 7d, now]` window** (robust for demos: changes
planted by a fresh seed always fall inside it). `weekKey` is the UTC Monday of
`now`, used only for dedup and the human label. The minor semantic gap (rolling
window vs. calendar week) is intentional and documented here.

## UI — new `/digest` route

- `app/(app)/digest/page.tsx` — server component; `preloadQuery(api.digests.getLatest)`
  and `preloadQuery(api.digests.list)`; passes both `Preloaded` payloads to a
  `"use client"` `DigestView` using `usePreloadedQuery` (project SSR pattern).
- `components/digest/digest-view.tsx` — renders the selected digest's markdown via
  **`react-markdown`** (one new dependency) inside a styled container; a
  **"Generate now"** button calling `useMutation(api.digests.generateNow)`; a
  past-weeks switcher driven by the `list` result. Empty state (no digests yet)
  prompts to click Generate.
- Add a `/digest` entry to the nav array in `components/app-sidebar.tsx`.

`react-markdown` is a pure, self-contained rendering dep; heading/list styling is
handled with a small set of component-class overrides (no typography plugin added).

## Seed & reset

`convex/seed.ts`:
- **Reset** must additionally clear the `statusChanges` **and** `digests` tables
  (today it clears the entity tables only), so a re-seed starts clean.
- **Plant** a few realistic `statusChanges` after inserting entities: at least one
  deliverable `in_progress → blocked`, one dependency `green → red`, and one
  recovery (e.g. `blocked → in_progress` or `red → green`). Because `_creationTime`
  is assigned at insert (= seed time), these land inside the rolling window, so the
  digest is populated immediately after seeding — no manual clicking required for a
  demo.

## Tests

- `convex/model/digest.test.ts` — pure composer: empty window; a worsening
  deliverable with a downstream-impact count; a dependency going red; an
  improvement; a mixed week (worsened + improved + other); `weekKey`/`mondayOfWeekUTC`
  date math (incl. a Sunday and a Monday boundary); assert markdown contains the
  expected section headers and phrases.
- `convex/digests.test.ts` — integration via `convexTest`: seed → toggle a status
  (writes a `statusChange`) → `generateNow` → assert a `digests` row with the
  expected `weekKey` and counts; call `generateNow` again → assert **upsert** (still
  one row for the week, updated `periodEnd`); smoke-run `internal.digests.weeklyDigest`.
- `convex/seed.test.ts` — extend to assert the planted `statusChanges` exist and
  that reset clears `statusChanges` + `digests`.

## Verification

`pnpm test`, `pnpm lint`, and `pnpm build` all green before the phase is reported
complete (per CLAUDE.md). Optionally verify the `/digest` page renders live via the
`claude-in-chrome` skill.

## Follow-ups (not this phase)

- `digests` has no `programId`; add program scoping when multi-program lands
  (tracked with the other single-program seams).
- Rolling-window vs. calendar-week `weekKey` gap (documented above) can be tightened
  to `[startOfWeek, now]` if strict calendar alignment is ever wanted.
- Email/Slack delivery via a Convex action remains the roadmap's optional bonus.
