# Weekly Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the unread `statusChanges` audit log into a weekly "what went at-risk this week, and why" digest — a stored markdown artifact, produced by a Friday Convex cron and an on-demand button, shown on a new `/digest` page.

**Architecture:** A pure `composeDigest` function turns the week's `statusChanges` into markdown, enriched with cascade impact counts reused from the Phase-3 graph traversal. A `runDigest(ctx, now)` mutation-helper reads the 7-day window (via the built-in `by_creation_time` index), loads the current graph, composes, and **upserts** a `digests` row keyed by the UTC Monday of the week. A public `generateNow` mutation (button) and an internal `weeklyDigest` mutation (cron) both call it. The `/digest` page preloads the latest digest + history and renders the stored markdown.

**Tech Stack:** Convex (schema, mutations, queries, `crons.ts`), Next.js App Router (server `preloadQuery` + client `usePreloadedQuery`), `react-markdown` (new dep), Tailwind, shadcn `Button`, Vitest + `convex-test`.

## Global Constraints

- Package manager is **pnpm** — never `npm`/`yarn`. (CLAUDE.md)
- **Derived values are never persisted** — `slackDays`, cascade RAG, impact counts are computed at read time. The digest's stored `markdown`/counts are a generated *artifact snapshot*, not a derived value re-read elsewhere. (CLAUDE.md)
- **Dates are Unix-ms numbers** (`v.number()`). (CLAUDE.md)
- Convex module filenames must be **camelCase/underscore, never hyphenated** (`crons.ts`, `digests.ts` are fine). (memory: convex-module-names-no-hyphens)
- Convex **reactive hooks only in client components**; server-rendered first paint uses `preloadQuery` → `usePreloadedQuery`. (CLAUDE.md)
- Do **not** read the wall clock (`Date.now()` / argless `new Date()`) inside a **query**. It's allowed in **mutations**. `new Date(ms)` with an argument is fine anywhere. (Convex guidelines)
- **Referential integrity is manual**; keep the seed's `clearAll` clearing every table it owns. (CLAUDE.md)
- Do **not** remove the `**/*.test.ts` exclude in `convex/tsconfig.json`. (memory: phase-2-followups)
- Run `pnpm test`, `pnpm lint`, `pnpm build` before reporting complete. (CLAUDE.md)
- Cron guideline: use `crons.cron` (not `crons.weekly`); pass a FunctionReference; import `internal` from `_generated/api`. (Convex guidelines)

---

### Task 1: Pure digest composer (`model/digest.ts`)

Pure, ctx-free composition + date helpers, unit-tested in isolation (mirrors `model/graphAnalysis.ts`). No schema change and no DB access — operates on `Doc<"statusChanges">` (that table already exists) and plain Maps.

**Files:**
- Create: `convex/model/digest.ts`
- Test: `convex/model/digest.test.ts`

**Interfaces:**
- Consumes: `Doc<"statusChanges">`, `Doc<"deliverables">`, `Doc<"dependencies">`, `Doc<"teams">`, `Id<...>` from `../_generated/dataModel`; `slackDays` from `./derived`.
- Produces (imported by Task 2):
  - `type DigestContext = { deliverableById: Map<Id<"deliverables">, Doc<"deliverables">>; teamById: Map<Id<"teams">, Doc<"teams">>; edgeById: Map<Id<"dependencies">, Doc<"dependencies">>; reach: Record<string, number> }`
  - `type DigestResult = { weekKey: string; periodStart: number; periodEnd: number; markdown: string; worsenedCount: number; improvedCount: number; totalChanges: number }`
  - `function mondayOfWeekUTC(ms: number): number`
  - `function weekKeyOf(ms: number): string`
  - `function composeDigest(changes: Doc<"statusChanges">[], gctx: DigestContext, now: number): DigestResult`

- [ ] **Step 1: Write the failing test**

Create `convex/model/digest.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  composeDigest,
  mondayOfWeekUTC,
  weekKeyOf,
  type DigestContext,
} from "./digest";
import type { Doc, Id } from "../_generated/dataModel";

// --- tiny builders (cast plain objects to Docs; composer only reads fields it needs) ---
const deliv = (id: string, title: string, teamId: string): Doc<"deliverables"> =>
  ({ _id: id, owningTeamId: teamId, title, status: "in_progress" }) as unknown as Doc<"deliverables">;
const team = (id: string, name: string): Doc<"teams"> =>
  ({ _id: id, name }) as unknown as Doc<"teams">;
const edge = (
  id: string,
  provider: string,
  consumer: string,
  neededByDate: number,
  committedDate: number | undefined,
): Doc<"dependencies"> =>
  ({ _id: id, providerDeliverableId: provider, consumerDeliverableId: consumer, neededByDate, committedDate }) as unknown as Doc<"dependencies">;
const change = (
  entityType: Doc<"statusChanges">["entityType"],
  entityId: string,
  field: string,
  oldValue: string,
  newValue: string,
): Doc<"statusChanges"> =>
  ({ _id: `c_${entityId}_${field}`, entityType, entityId, field, oldValue, newValue }) as unknown as Doc<"statusChanges">;

const NOW = Date.UTC(2026, 6, 22, 12, 0, 0); // Wed 2026-07-22

function ctx(over: Partial<DigestContext> = {}): DigestContext {
  return {
    deliverableById: new Map(),
    teamById: new Map(),
    edgeById: new Map(),
    reach: {},
    ...over,
  };
}

describe("date helpers", () => {
  test("mondayOfWeekUTC snaps back to Monday 00:00 UTC", () => {
    // 2026-07-22 is a Wednesday → Monday is 2026-07-20.
    expect(mondayOfWeekUTC(NOW)).toBe(Date.UTC(2026, 6, 20));
  });
  test("weekKeyOf formats the Monday as YYYY-MM-DD", () => {
    expect(weekKeyOf(NOW)).toBe("2026-07-20");
  });
  test("a Sunday belongs to the week that started the previous Monday", () => {
    const sun = Date.UTC(2026, 6, 26, 9); // Sun 2026-07-26
    expect(weekKeyOf(sun)).toBe("2026-07-20");
  });
  test("a Monday is its own week start", () => {
    const mon = Date.UTC(2026, 6, 20, 1);
    expect(weekKeyOf(mon)).toBe("2026-07-20");
  });
});

describe("composeDigest", () => {
  test("empty week yields an all-quiet digest with zero counts", () => {
    const r = composeDigest([], ctx(), NOW);
    expect(r.weekKey).toBe("2026-07-20");
    expect(r.totalChanges).toBe(0);
    expect(r.worsenedCount).toBe(0);
    expect(r.improvedCount).toBe(0);
    expect(r.markdown).toContain("all quiet");
  });

  test("a deliverable that went blocked is worsening and shows its downstream blast radius", () => {
    const g = ctx({
      deliverableById: new Map([["d1" as Id<"deliverables">, deliv("d1", "Checkout API", "t1")]]),
      teamById: new Map([["t1" as Id<"teams">, team("t1", "Payments")]]),
      reach: { d1: 2 },
    });
    const r = composeDigest([change("deliverable", "d1", "status", "in_progress", "blocked")], g, NOW);
    expect(r.worsenedCount).toBe(1);
    expect(r.markdown).toContain("## ⚠️ Went at-risk this week");
    expect(r.markdown).toContain("### Payments");
    expect(r.markdown).toContain("Checkout API");
    expect(r.markdown).toContain("`in_progress → blocked`");
    expect(r.markdown).toContain("blocks **2** downstream deliverables");
  });

  test("a dependency going red is worsening and shows provider→consumer plus slack", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const g = ctx({
      deliverableById: new Map([
        ["p" as Id<"deliverables">, deliv("p", "Auth Service", "t1")],
        ["c" as Id<"deliverables">, deliv("c", "Checkout API", "t2")],
      ]),
      teamById: new Map([
        ["t1" as Id<"teams">, team("t1", "Platform")],
        ["t2" as Id<"teams">, team("t2", "Payments")],
      ]),
      edgeById: new Map([["e1" as Id<"dependencies">, edge("e1", "p", "c", NOW + 20 * DAY, NOW + 22 * DAY)]]),
    });
    const r = composeDigest([change("dependency", "e1", "rag", "amber", "red")], g, NOW);
    expect(r.worsenedCount).toBe(1);
    expect(r.markdown).toContain("Auth Service → Checkout API");
    expect(r.markdown).toContain("`amber → red`");
    expect(r.markdown).toContain("-2 days slack"); // neededBy − committed = 20 − 22
    expect(r.markdown).toContain("### Payments"); // grouped under the consumer's team
  });

  test("an improvement lands in the Recovered section", () => {
    const g = ctx({
      deliverableById: new Map([["d1" as Id<"deliverables">, deliv("d1", "Data Pipeline", "t1")]]),
      teamById: new Map([["t1" as Id<"teams">, team("t1", "Data")]]),
    });
    const r = composeDigest([change("deliverable", "d1", "status", "blocked", "in_progress")], g, NOW);
    expect(r.improvedCount).toBe(1);
    expect(r.worsenedCount).toBe(0);
    expect(r.markdown).toContain("## ✅ Recovered / improved");
    expect(r.markdown).toContain("Data Pipeline");
  });

  test("a mixed week counts each bucket and renders all sections", () => {
    const g = ctx({
      deliverableById: new Map([
        ["d1" as Id<"deliverables">, deliv("d1", "Checkout API", "t1")],
        ["d2" as Id<"deliverables">, deliv("d2", "Data Pipeline", "t1")],
      ]),
      teamById: new Map([["t1" as Id<"teams">, team("t1", "Core")]]),
      reach: { d1: 1 },
    });
    const r = composeDigest(
      [
        change("deliverable", "d1", "status", "in_progress", "blocked"), // worse
        change("deliverable", "d2", "status", "blocked", "in_progress"), // better
      ],
      g,
      NOW,
    );
    expect(r.totalChanges).toBe(2);
    expect(r.worsenedCount).toBe(1);
    expect(r.improvedCount).toBe(1);
    expect(r.markdown).toContain("**1 went at-risk · 1 recovered · 2 changes**");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test convex/model/digest.test.ts`
Expected: FAIL — `Cannot find module './digest'` (file not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `convex/model/digest.ts`:

```ts
// Pure weekly-digest composition. No Convex ctx here, so it unit-tests in
// isolation (mirrors model/graphAnalysis.ts). Nothing is persisted from this
// file — runDigest (in the same file) does the DB read/write.
import type { Doc, Id } from "../_generated/dataModel";
import { slackDays } from "./derived";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Higher = worse. "blocked" is the risk state; "done" is best.
const DELIV_RANK: Record<string, number> = {
  done: 0,
  not_started: 1,
  in_progress: 1,
  blocked: 3,
};
const RAG_RANK: Record<string, number> = { green: 0, amber: 1, red: 2 };

export type DigestContext = {
  deliverableById: Map<Id<"deliverables">, Doc<"deliverables">>;
  teamById: Map<Id<"teams">, Doc<"teams">>;
  edgeById: Map<Id<"dependencies">, Doc<"dependencies">>;
  reach: Record<string, number>; // downstreamReach() by deliverable id
};

export type DigestResult = {
  weekKey: string;
  periodStart: number;
  periodEnd: number;
  markdown: string;
  worsenedCount: number;
  improvedCount: number;
  totalChanges: number;
};

export function mondayOfWeekUTC(ms: number): number {
  const d = new Date(ms);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday);
}

function isoDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function weekKeyOf(ms: number): string {
  return isoDate(mondayOfWeekUTC(ms));
}

type Direction = "worse" | "better" | "other";
type Classified = { direction: Direction; line: string; team: string };

function rankDir(rank: Record<string, number>, oldV?: string, newV?: string): Direction {
  const o = oldV !== undefined ? rank[oldV] : undefined;
  const n = newV !== undefined ? rank[newV] : undefined;
  if (o === undefined || n === undefined) return "other";
  if (n > o) return "worse";
  if (n < o) return "better";
  return "other";
}

function classify(c: Doc<"statusChanges">, g: DigestContext): Classified {
  if (c.entityType === "deliverable" && c.field === "status") {
    const d = g.deliverableById.get(c.entityId as Id<"deliverables">);
    const title = d?.title ?? "(removed)";
    const teamName = d ? g.teamById.get(d.owningTeamId)?.name ?? "—" : "—";
    const dir = rankDir(DELIV_RANK, c.oldValue, c.newValue);
    const reach = g.reach[c.entityId] ?? 0;
    let line = `**${title}** moved \`${c.oldValue} → ${c.newValue}\``;
    if (dir === "worse" && reach > 0) {
      line += ` — blocks **${reach}** downstream deliverable${reach === 1 ? "" : "s"}`;
    }
    return { direction: dir, line, team: teamName };
  }

  if (c.entityType === "dependency" && c.field === "rag") {
    const e = g.edgeById.get(c.entityId as Id<"dependencies">);
    const prov = e ? g.deliverableById.get(e.providerDeliverableId) : undefined;
    const cons = e ? g.deliverableById.get(e.consumerDeliverableId) : undefined;
    const provTitle = prov?.title ?? "(removed)";
    const consTitle = cons?.title ?? "(removed)";
    const teamName = cons ? g.teamById.get(cons.owningTeamId)?.name ?? "—" : "—";
    const dir = rankDir(RAG_RANK, c.oldValue, c.newValue);
    let line = `**${provTitle} → ${consTitle}** dependency went \`${c.oldValue} → ${c.newValue}\``;
    if (e) {
      const s = slackDays(e.neededByDate, e.committedDate);
      if (s !== null) line += ` — ${s} day${Math.abs(s) === 1 ? "" : "s"} slack`;
    }
    return { direction: dir, line, team: teamName };
  }

  return {
    direction: "other",
    line: `${c.entityType} ${c.field} \`${c.oldValue} → ${c.newValue}\``,
    team: "—",
  };
}

function groupByTeam(items: Classified[]): [string, Classified[]][] {
  const m = new Map<string, Classified[]>();
  for (const it of items) {
    if (!m.has(it.team)) m.set(it.team, []);
    m.get(it.team)!.push(it);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function composeDigest(
  changes: Doc<"statusChanges">[],
  gctx: DigestContext,
  now: number,
): DigestResult {
  const periodStart = now - WEEK_MS;
  const periodEnd = now;
  const weekKey = weekKeyOf(now);

  const classified = changes.map((c) => classify(c, gctx));
  const worse = classified.filter((c) => c.direction === "worse");
  const better = classified.filter((c) => c.direction === "better");
  const other = classified.filter((c) => c.direction === "other");

  const lines: string[] = [];
  lines.push(`# Weekly Digest — Week of ${weekKey}`);
  lines.push(`_${isoDate(periodStart)} – ${isoDate(periodEnd)}_`);
  lines.push("");
  lines.push(`**${worse.length} went at-risk · ${better.length} recovered · ${classified.length} changes**`);

  if (classified.length === 0) {
    lines.push("");
    lines.push("No tracked status changes in the last 7 days — all quiet.");
  }

  if (worse.length) {
    lines.push("");
    lines.push("## ⚠️ Went at-risk this week");
    for (const [teamName, items] of groupByTeam(worse)) {
      lines.push(`### ${teamName}`);
      for (const it of items) lines.push(`- ${it.line}`);
    }
  }

  if (better.length) {
    lines.push("");
    lines.push("## ✅ Recovered / improved");
    for (const it of better) lines.push(`- ${it.line}`);
  }

  if (other.length) {
    lines.push("");
    lines.push("## Other changes");
    for (const it of other) lines.push(`- ${it.line}`);
  }

  return {
    weekKey,
    periodStart,
    periodEnd,
    markdown: lines.join("\n"),
    worsenedCount: worse.length,
    improvedCount: better.length,
    totalChanges: classified.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test convex/model/digest.test.ts`
Expected: PASS — all cases in both describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add convex/model/digest.ts convex/model/digest.test.ts
git commit -m "feat: pure weekly-digest composer + date helpers"
```

---

### Task 2: `digests` table, `runDigest`, backend functions, cron

Add the table, the orchestration helper, the public/internal mutations + queries, and the cron registration. Integration-tested end to end via `convex-test`.

**Files:**
- Modify: `convex/schema.ts` (add `digests` table before the closing `});` of `defineSchema`)
- Modify: `convex/model/digest.ts` (append `runDigest`)
- Create: `convex/digests.ts`
- Create: `convex/crons.ts`
- Test: `convex/digests.test.ts`

**Interfaces:**
- Consumes: `composeDigest`, `DigestContext` (Task 1); `loadActiveProgramGraph`, `toAnalysisGraph` from `./graphData`; `downstreamReach` from `./graphAnalysis`; `internal.seed.run`, `api.deliverables.setStatus`, `api.deliverables.list` (existing).
- Produces (imported by Tasks 3 & 4):
  - `runDigest(ctx: MutationCtx, now: number): Promise<Id<"digests">>` (in `model/digest.ts`)
  - `api.digests.generateNow` (mutation, args `{}`, returns `null`)
  - `internal.digests.weeklyDigest` (internalMutation, args `{}`, returns `null`)
  - `api.digests.list` (query → `Doc<"digests">[]`, newest first)
  - `api.digests.getLatest` (query → `Doc<"digests"> | null`)

- [ ] **Step 1: Write the failing test**

Create `convex/digests.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("generateNow produces a digest from a status change", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});

  const delivs = await t.query(api.deliverables.list, {});
  const target = delivs.find((d) => d.status !== "blocked")!;
  await t.mutation(api.deliverables.setStatus, { id: target._id, status: "blocked" });

  await t.mutation(api.digests.generateNow, {});

  const latest = await t.query(api.digests.getLatest, {});
  expect(latest).not.toBeNull();
  expect(latest!.totalChanges).toBeGreaterThan(0);
  expect(latest!.markdown).toContain("Weekly Digest");
  expect(latest!.weekKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("re-running generateNow upserts the same week's row (no duplicate)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  await t.mutation(api.digests.generateNow, {});
  await t.mutation(api.digests.generateNow, {});
  const all = await t.query(api.digests.list, {});
  expect(all.length).toBe(1);
});

test("weeklyDigest cron mutation writes a digest", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  await t.mutation(internal.digests.weeklyDigest, {});
  const latest = await t.query(api.digests.getLatest, {});
  expect(latest).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test convex/digests.test.ts`
Expected: FAIL — `api.digests` / `internal.digests` undefined (functions not created).

- [ ] **Step 3a: Add the `digests` table to the schema**

In `convex/schema.ts`, add this table inside `defineSchema({ ... })` (immediately after the `statusChanges` table, before the final `});`):

```ts
  // Generated weekly digests. One row per ISO-week (keyed by the UTC Monday),
  // upserted by runDigest. `markdown` is the artifact; the counts are headline
  // stats so the UI need not re-parse the body.
  digests: defineTable({
    weekKey: v.string(), // "2026-07-20" — UTC Monday of the week; dedup + label
    periodStart: v.number(),
    periodEnd: v.number(),
    markdown: v.string(),
    worsenedCount: v.number(),
    improvedCount: v.number(),
    totalChanges: v.number(),
  }).index("by_week", ["weekKey"]),
```

- [ ] **Step 3b: Append `runDigest` to `model/digest.ts`**

Add these imports at the top of `convex/model/digest.ts` (alongside the existing imports):

```ts
import type { MutationCtx } from "../_generated/server";
import { loadActiveProgramGraph, toAnalysisGraph } from "./graphData";
import { downstreamReach } from "./graphAnalysis";
```

Append this function at the end of `convex/model/digest.ts`:

```ts
// Orchestration on a MutationCtx: read the last 7 days of statusChanges, load the
// current graph for name/impact enrichment, compose, and UPSERT the week's row.
export async function runDigest(ctx: MutationCtx, now: number): Promise<Id<"digests">> {
  const cutoff = now - WEEK_MS;
  const changes = await ctx.db
    .query("statusChanges")
    .withIndex("by_creation_time", (q) => q.gte("_creationTime", cutoff))
    .collect();

  const graph = await loadActiveProgramGraph(ctx);
  let gctx: DigestContext;
  if (graph) {
    const analysis = toAnalysisGraph(graph.deliverableById, graph.edges);
    gctx = {
      deliverableById: graph.deliverableById,
      teamById: graph.teamById,
      edgeById: new Map(graph.edges.map((e) => [e._id, e])),
      reach: downstreamReach(analysis.analysisNodes, analysis.analysisEdges),
    };
  } else {
    gctx = { deliverableById: new Map(), teamById: new Map(), edgeById: new Map(), reach: {} };
  }

  const result = composeDigest(changes, gctx, now);

  const fields = {
    weekKey: result.weekKey,
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    markdown: result.markdown,
    worsenedCount: result.worsenedCount,
    improvedCount: result.improvedCount,
    totalChanges: result.totalChanges,
  };

  const existing = await ctx.db
    .query("digests")
    .withIndex("by_week", (q) => q.eq("weekKey", result.weekKey))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }
  return await ctx.db.insert("digests", fields);
}
```

- [ ] **Step 3c: Create `convex/digests.ts`**

```ts
import { mutation, internalMutation, query } from "./_generated/server";
import { runDigest } from "./model/digest";

// Public: called by the "Generate now" button. Date.now() is allowed in mutations.
export const generateNow = mutation({
  args: {},
  handler: async (ctx) => {
    await runDigest(ctx, Date.now());
    return null;
  },
});

// Internal: the Friday cron target.
export const weeklyDigest = internalMutation({
  args: {},
  handler: async (ctx) => {
    await runDigest(ctx, Date.now());
    return null;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("digests").collect();
    return rows.sort((a, b) => b.periodEnd - a.periodEnd);
  },
});

export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("digests").collect();
    if (rows.length === 0) return null;
    return rows.sort((a, b) => b.periodEnd - a.periodEnd)[0];
  },
});
```

- [ ] **Step 3d: Create `convex/crons.ts`**

```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Fridays 16:00 UTC. Use crons.cron (not the weekly helper), passing a
// FunctionReference — per Convex cron guidelines.
crons.cron("weekly digest", "0 16 * * 5", internal.digests.weeklyDigest, {});

export default crons;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test convex/digests.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/model/digest.ts convex/digests.ts convex/crons.ts convex/digests.test.ts
git commit -m "feat: digests table, runDigest upsert, generate mutations + Friday cron"
```

---

### Task 3: Seed planted history + reset clears digests

Make a fresh seed populate the digest immediately (plant a few `statusChanges` whose `_creationTime` = seed time, so they fall in the rolling window), and ensure reset clears both `statusChanges` and the new `digests` table.

**Files:**
- Modify: `convex/seed.ts` (`clearAll` table list; capture one dep id; insert planted `statusChanges` before `return null`)
- Modify: `convex/seed.test.ts` (assert planted changes + reset clears digests)

**Interfaces:**
- Consumes: `api.digests.generateNow`, `api.digests.list` (Task 2); existing `internal.seed.run`.
- Produces: seeded `statusChanges` rows (≥3): a deliverable `in_progress → blocked`, a dependency `amber → red`, a deliverable `blocked → in_progress`.

- [ ] **Step 1: Write the failing test**

Add these tests to `convex/seed.test.ts` (keep existing tests; append):

```ts
test("seed plants recent status history for the digest", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const changes = await t.run(async (ctx) => ctx.db.query("statusChanges").collect());
  expect(changes.length).toBeGreaterThanOrEqual(3);
  expect(changes.some((c) => c.newValue === "blocked")).toBe(true);
  expect(changes.some((c) => c.entityType === "dependency" && c.newValue === "red")).toBe(true);
});

test("re-seeding clears prior digests", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  await t.mutation(api.digests.generateNow, {});
  expect((await t.query(api.digests.list, {})).length).toBe(1);

  await t.mutation(internal.seed.run, {}); // reset must wipe digests
  expect((await t.query(api.digests.list, {})).length).toBe(0);
});
```

Ensure the imports at the top of `convex/seed.test.ts` include `api` (add it if the file currently only imports `internal`):

```ts
import { api, internal } from "./_generated/api";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test convex/seed.test.ts`
Expected: FAIL — planted-history count `< 3` and/or digests not cleared on re-seed.

- [ ] **Step 3a: Clear `digests` on reset**

In `convex/seed.ts`, extend the `clearAll` table tuple to include `digests`:

```ts
  for (const table of ["risks", "assumptions", "issues", "statusChanges", "digests"] as const) {
    for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
  }
```

- [ ] **Step 3b: Capture a dependency id to reference in planted history**

In `convex/seed.ts`, change the checkout→IAP dependency line from:

```ts
    await dep(checkoutApi, inAppPurchase, "red", true, 30, 34, "IAP needs the checkout API"); // negative slack
```

to capture its id:

```ts
    const checkoutIapDep = await dep(checkoutApi, inAppPurchase, "red", true, 30, 34, "IAP needs the checkout API"); // negative slack
```

- [ ] **Step 3c: Plant status history**

In `convex/seed.ts`, immediately before the final `return null;`, insert:

```ts
    // Planted status history so the weekly digest has content on a fresh seed.
    // _creationTime is assigned now (seed time), so these fall in the rolling 7-day window.
    await ctx.db.insert("statusChanges", { entityType: "deliverable", entityId: checkoutApi, field: "status", oldValue: "in_progress", newValue: "blocked" });
    await ctx.db.insert("statusChanges", { entityType: "dependency", entityId: checkoutIapDep, field: "rag", oldValue: "amber", newValue: "red" });
    await ctx.db.insert("statusChanges", { entityType: "deliverable", entityId: dataPipeline, field: "status", oldValue: "blocked", newValue: "in_progress" });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test convex/seed.test.ts`
Expected: PASS — planted-history and re-seed-clears tests green; existing seed tests still pass.

- [ ] **Step 5: Commit**

```bash
git add convex/seed.ts convex/seed.test.ts
git commit -m "feat: seed plants status history and reset clears digests"
```

---

### Task 4: `/digest` page + sidebar nav

Add the route, the client view (markdown render + Generate button + week switcher), the `react-markdown` dependency, and the nav entry. Verified by build/lint; the digest content is already covered by Tasks 1–3.

**Files:**
- Create: `app/(app)/digest/page.tsx`
- Create: `components/digest/digest-view.tsx`
- Modify: `components/app-sidebar.tsx` (add nav item)
- Modify: `package.json` / lockfile (via `pnpm add react-markdown`)

**Interfaces:**
- Consumes: `api.digests.getLatest`, `api.digests.list`, `api.digests.generateNow` (Task 2); `Button` from `@/components/ui/button`; `cn` from `@/lib/utils`.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add react-markdown`
Expected: `react-markdown` appears under `dependencies` in `package.json`; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Create the client view**

Create `components/digest/digest-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Preloaded, usePreloadedQuery, useMutation } from "convex/react";
import ReactMarkdown from "react-markdown";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROSE =
  "max-w-none rounded-lg border p-6 text-sm " +
  "[&_h1]:mb-1 [&_h1]:text-lg [&_h1]:font-semibold " +
  "[&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:font-semibold " +
  "[&_h3]:mt-3 [&_h3]:font-medium [&_h3]:text-muted-foreground " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 " +
  "[&_p]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5";

export function DigestView({
  latest,
  all,
}: {
  latest: Preloaded<typeof api.digests.getLatest>;
  all: Preloaded<typeof api.digests.list>;
}) {
  const latestDigest = usePreloadedQuery(latest);
  const digests = usePreloadedQuery(all);
  const generate = useMutation(api.digests.generateNow);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected =
    (selectedKey ? digests.find((d) => d.weekKey === selectedKey) : null) ?? latestDigest;

  const onGenerate = async () => {
    setBusy(true);
    try {
      await generate({});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Weekly Digest</h1>
        <Button onClick={onGenerate} disabled={busy}>
          {busy ? "Generating…" : "Generate now"}
        </Button>
      </div>

      {digests.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {digests.map((d) => (
            <button
              key={d.weekKey}
              onClick={() => setSelectedKey(d.weekKey)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                selected?.weekKey === d.weekKey && "bg-accent font-medium",
              )}
            >
              {d.weekKey}
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <article className={PROSE}>
          <ReactMarkdown>{selected.markdown}</ReactMarkdown>
        </article>
      ) : (
        <p className="text-sm text-muted-foreground">
          No digest yet. Click <strong>Generate now</strong> to create this week’s digest.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the route (server component)**

Create `app/(app)/digest/page.tsx`:

```tsx
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DigestView } from "@/components/digest/digest-view";

export default async function DigestPage() {
  const [latest, all] = await Promise.all([
    preloadQuery(api.digests.getLatest, {}),
    preloadQuery(api.digests.list, {}),
  ]);
  return <DigestView latest={latest} all={all} />;
}
```

- [ ] **Step 4: Add the sidebar nav entry**

In `components/app-sidebar.tsx`, add a `Digest` item to the `NAV` array (after `Dashboard`, to keep the "what a TPM opens" items together):

```ts
const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/digest", label: "Digest" },
  { href: "/graph", label: "Graph" },
  { href: "/deliverables", label: "Deliverables" },
  { href: "/dependencies", label: "Dependencies" },
  { href: "/risks", label: "Risks" },
  { href: "/assumptions", label: "Assumptions" },
  { href: "/issues", label: "Issues" },
  { href: "/teams", label: "Teams" },
];
```

- [ ] **Step 5: Verify build + lint**

Run: `pnpm lint && pnpm build`
Expected: lint clean; `next build` succeeds and typechecks (the `/digest` route compiles, `react-markdown` resolves).

- [ ] **Step 6: Commit**

```bash
git add app/"(app)"/digest/page.tsx components/digest/digest-view.tsx components/app-sidebar.tsx package.json pnpm-lock.yaml
git commit -m "feat: /digest page with markdown render, generate button, and nav"
```

---

### Task 5: Full verification + optional live check

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all suites including `model/digest.test.ts`, `digests.test.ts`, `seed.test.ts`.

- [ ] **Step 2: Lint + build**

Run: `pnpm lint && pnpm build`
Expected: both clean.

- [ ] **Step 3 (optional): Live visual check**

Start the app (`pnpm dev`), open `http://localhost:3000/digest`, confirm the seeded digest renders (⚠️ Went at-risk with the planted `Checkout API → blocked` and the `amber → red` dependency, plus ✅ Recovered with `Data Pipeline`), click **Generate now**, and confirm the page updates reactively. Optionally verify via the `claude-in-chrome` skill.

- [ ] **Step 4: Update roadmap follow-up memory**

Note in the Phase-5 completion that `digests` has no `programId` (single-program follow-up) and the rolling-window-vs-calendar-week `weekKey` gap is intentional (both documented in the design spec).

---

## Self-Review

**Spec coverage:**
- `digests` table → Task 2, Step 3a. ✓
- Deterministic templated markdown composer → Task 1. ✓
- Risk-focused content + cascade impact enrichment (`downstreamReach`) → Task 1 (compose) + Task 2 (`runDigest` builds `reach`). ✓
- `runDigest` topology (7-day `by_creation_time` read, graph load, upsert) → Task 2, Step 3b. ✓
- `generateNow` / `weeklyDigest` / `getLatest` / `list` → Task 2, Step 3c. ✓
- Friday cron via `crons.cron` → Task 2, Step 3d. ✓
- Rolling `[now−7d, now]` window + Monday `weekKey` → Task 1 (`composeDigest`/`weekKeyOf`). ✓
- `/digest` route + `usePreloadedQuery` + `react-markdown` + Generate button + week switcher + sidebar nav → Task 4. ✓
- Seed clears `statusChanges`+`digests` and plants history → Task 3. ✓
- Tests (composer, integration/upsert, seed) → Tasks 1–3. ✓
- Verification (`pnpm test`/`lint`/`build`) → Task 5. ✓
- Out of scope (email/Slack, LLM, multi-program) → not implemented. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code and exact commands. ✓

**Type consistency:** `DigestContext`/`DigestResult`/`composeDigest`/`runDigest`/`weekKeyOf`/`mondayOfWeekUTC` names and signatures match between Task 1 (definition) and Task 2 (consumption). `reach: Record<string, number>` keyed by deliverable id string, produced by `downstreamReach` (returns `Record<string, number>`) and read in `classify`. `generateNow`/`weeklyDigest`/`getLatest`/`list` names match between Task 2 (definition) and Tasks 3–4 (use). Field set in `runDigest`'s `fields` object matches the `digests` schema exactly. ✓
