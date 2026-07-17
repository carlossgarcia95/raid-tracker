# Phase 1 — Core RAID CRUD (Walking Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Convex schema into a usable walking skeleton — an engineered demo program in the database, read queries that expose it (with derived values computed at read time), and sidebar-navigated read tables that render it.

**Architecture:** Seed-first and read-heavy. A single `internalMutation` populates a hand-authored demo program (with a multi-hop cascade chain and one planted cycle). One read query per entity, each scoped to the single active program and joining in human-readable names. Next.js App Router routes are server components that `preloadQuery` and hand a `Preloaded` payload to a client `<DataTable>` built on TanStack Table + shadcn Table. Derived values (`slackDays`, risk `score`) are pure functions computed in-query, never stored. Referential integrity on delete is handled by a shared `deleteDeliverableCascade` helper.

**Tech Stack:** Convex 1.36 · Next.js 16 (App Router) + React 19 + TypeScript · TanStack Table v8 · Tailwind v4 + shadcn/ui · Vitest + convex-test + @edge-runtime/vm. Package manager: pnpm.

## Global Constraints

- **Package manager is pnpm.** Never introduce `npm`/`yarn`. Lockfile is `pnpm-lock.yaml`.
- **Read `convex/_generated/ai/guidelines.md` before writing any Convex code** — it overrides training-data assumptions.
- **Derived values are NEVER stored.** `slackDays = neededByDate − committedDate` and risk `score = probability × impact` are computed at read time only.
- **Referential integrity is manual.** Deleting a `deliverable` must delete its inbound (`by_consumer`) and outbound (`by_provider`) dependency edges in the *same* mutation.
- **Dependencies are edges** `providerDeliverableId → consumerDeliverableId`. Never remodel as team-to-team links.
- **No `useQuery`/`useMutation` in server components.** Use `preloadQuery` (from `convex/nextjs`) in server components and `usePreloadedQuery` in `"use client"` components.
- **Dates are Unix-ms numbers** (`v.number()`), never strings or `Date` objects.
- **R / A / I stay separate tables.** Never merge into one typed table.
- **Bounded queries.** Use `.take(n)` (n = 500 here) rather than `.collect()` — the guidelines require bounded reads.
- **All Convex functions declare argument validators**, even when args is `{}`.
- **No wall-clock reads inside queries.** `Date.now()` is allowed in mutations (e.g. the seed) but never in a query handler.
- **Run `pnpm lint` and `pnpm build` before declaring the phase complete.** Both must pass.

---

## File Structure

**Backend (`convex/`):**
- `convex/model/derived.ts` — pure functions: `slackDays`, `riskScore`. (Create)
- `convex/model/programs.ts` — `getActiveProgram(ctx)` helper. (Create)
- `convex/model/deliverables.ts` — `deleteDeliverableCascade(ctx, id)` helper. (Create)
- `convex/seed.ts` — `internalMutation` `run` that tears down + repopulates the demo program. (Create)
- `convex/programs.ts` — `getActive` query. (Create)
- `convex/teams.ts` — `list` query. (Create)
- `convex/deliverables.ts` — `list` query (joins team). (Create)
- `convex/dependencies.ts` — `list` query (joins provider/consumer, computes `slackDays`). (Create)
- `convex/risks.ts` — `list` query (computes `score`, joins team). (Create)
- `convex/assumptions.ts` — `list` query. (Create)
- `convex/issues.ts` — `list` query (joins team). (Create)
- `convex/*.test.ts` — colocated Vitest tests. (Create)
- `vitest.config.ts` — Vitest config, edge-runtime environment. (Create)

**Frontend (`app/`, `components/`):**
- `components/app-sidebar.tsx` — sidebar nav. (Create)
- `components/data-table.tsx` — reusable TanStack Table + shadcn Table wrapper. (Create)
- `app/layout.tsx` — wrap children in the sidebar shell. (Modify)
- `app/page.tsx` — redirect/landing to `/deliverables`. (Modify)
- `app/(app)/deliverables/{page.tsx,columns.tsx}` etc. — one route folder per entity. (Create)
- `components/ui/*` — shadcn components added via CLI. (Create via CLI)

---

## Task 1: Test harness (Vitest + convex-test)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)
- Test: `convex/smoke.test.ts`

**Interfaces:**
- Produces: a working `pnpm test` command; the `convexTest(schema, modules)` pattern that every later test uses.

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
pnpm add -D vitest convex-test @edge-runtime/vm
```
Expected: packages added to `devDependencies`, `pnpm-lock.yaml` updated.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

- [ ] **Step 3: Add the `test` script to `package.json`**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the smoke test**

Create `convex/smoke.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("empty database has no programs", async () => {
  const t = convexTest(schema, modules);
  const programs = await t.run(async (ctx) => ctx.db.query("programs").collect());
  expect(programs).toEqual([]);
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — 1 test passed. (If it fails to resolve `edge-runtime`, confirm `@edge-runtime/vm` installed.)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts convex/smoke.test.ts
git commit -m "test: set up vitest + convex-test harness"
```

---

## Task 2: Derived-value pure functions

**Files:**
- Create: `convex/model/derived.ts`
- Test: `convex/model/derived.test.ts`

**Interfaces:**
- Produces:
  - `slackDays(neededByDate: number, committedDate: number | undefined): number | null` — whole days of slack; `null` when `committedDate` is undefined. Negative = at risk on its own.
  - `riskScore(probability: number, impact: number): number` — `probability * impact`.

- [ ] **Step 1: Write the failing tests**

Create `convex/model/derived.test.ts`:
```ts
import { expect, test } from "vitest";
import { slackDays, riskScore } from "./derived";

const DAY = 24 * 60 * 60 * 1000;

test("slackDays is positive when committed before needed", () => {
  expect(slackDays(10 * DAY, 7 * DAY)).toBe(3);
});

test("slackDays is negative when committed after needed", () => {
  expect(slackDays(7 * DAY, 10 * DAY)).toBe(-3);
});

test("slackDays is null when committedDate is undefined", () => {
  expect(slackDays(10 * DAY, undefined)).toBeNull();
});

test("riskScore multiplies probability by impact", () => {
  expect(riskScore(4, 5)).toBe(20);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test derived`
Expected: FAIL — cannot find module `./derived`.

- [ ] **Step 3: Implement `convex/model/derived.ts`**

```ts
// Pure, storage-free derivations. These are computed at read time in queries and
// MUST NOT be persisted (see CLAUDE.md invariants).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between committed and needed dates. null when no committed date. */
export function slackDays(
  neededByDate: number,
  committedDate: number | undefined,
): number | null {
  if (committedDate === undefined) return null;
  return Math.round((neededByDate - committedDate) / DAY_MS);
}

/** Risk exposure = probability × impact (both 1–5). */
export function riskScore(probability: number, impact: number): number {
  return probability * impact;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test derived`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add convex/model/derived.ts convex/model/derived.test.ts
git commit -m "feat: add slackDays and riskScore derived-value helpers"
```

---

## Task 3: Referential-integrity helper (`deleteDeliverableCascade`)

**Files:**
- Create: `convex/model/deliverables.ts`
- Test: `convex/model/deliverables.test.ts`

**Interfaces:**
- Consumes: `MutationCtx` from `../_generated/server`; `Id` from `../_generated/dataModel`.
- Produces: `deleteDeliverableCascade(ctx: MutationCtx, deliverableId: Id<"deliverables">): Promise<void>` — deletes the deliverable and every dependency edge referencing it (as provider OR consumer), in the same transaction.

- [ ] **Step 1: Write the failing test**

Create `convex/model/deliverables.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../schema";
import { deleteDeliverableCascade } from "./deliverables";

const modules = import.meta.glob("../**/*.ts");

test("deleting a deliverable removes its inbound and outbound edges", async () => {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const programId = await ctx.db.insert("programs", { name: "P", status: "active" });
    const teamId = await ctx.db.insert("teams", { name: "T", color: "#111" });
    const mk = (title: string) =>
      ctx.db.insert("deliverables", {
        programId, owningTeamId: teamId, title, status: "not_started",
      });
    const upstream = await mk("upstream");
    const target = await mk("target");
    const downstream = await mk("downstream");
    // upstream -> target (target is consumer), target -> downstream (target is provider)
    await ctx.db.insert("dependencies", {
      providerDeliverableId: upstream, consumerDeliverableId: target,
      neededByDate: 0, rag: "green", isBlocking: true,
    });
    await ctx.db.insert("dependencies", {
      providerDeliverableId: target, consumerDeliverableId: downstream,
      neededByDate: 0, rag: "green", isBlocking: true,
    });
    return { target };
  });

  await t.run(async (ctx) => deleteDeliverableCascade(ctx, ids.target));

  const remaining = await t.run(async (ctx) => ({
    deliverable: await ctx.db.get(ids.target),
    edges: await ctx.db.query("dependencies").collect(),
  }));

  expect(remaining.deliverable).toBeNull();
  expect(remaining.edges).toEqual([]); // both edges touching `target` are gone
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test model/deliverables`
Expected: FAIL — cannot find module `./deliverables`.

- [ ] **Step 3: Implement `convex/model/deliverables.ts`**

```ts
import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Delete a deliverable and every dependency edge that references it, in one
 * transaction. Convex has no foreign keys — skipping this orphans edges and
 * breaks the graph render (see CLAUDE.md invariants).
 */
export async function deleteDeliverableCascade(
  ctx: MutationCtx,
  deliverableId: Id<"deliverables">,
): Promise<void> {
  const outbound = await ctx.db
    .query("dependencies")
    .withIndex("by_provider", (q) => q.eq("providerDeliverableId", deliverableId))
    .collect();
  const inbound = await ctx.db
    .query("dependencies")
    .withIndex("by_consumer", (q) => q.eq("consumerDeliverableId", deliverableId))
    .collect();
  for (const edge of [...outbound, ...inbound]) {
    await ctx.db.delete(edge._id);
  }
  await ctx.db.delete(deliverableId);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test model/deliverables`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add convex/model/deliverables.ts convex/model/deliverables.test.ts
git commit -m "feat: add deleteDeliverableCascade referential-integrity helper"
```

---

## Task 4: Active-program helper

**Files:**
- Create: `convex/model/programs.ts`
- Test: `convex/model/programs.test.ts`

**Interfaces:**
- Consumes: `QueryCtx` from `../_generated/server`; `Doc` from `../_generated/dataModel`.
- Produces: `getActiveProgram(ctx: QueryCtx): Promise<Doc<"programs"> | null>` — the single demo program the app scopes to (the first program by creation time).

- [ ] **Step 1: Write the failing test**

Create `convex/model/programs.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../schema";
import { getActiveProgram } from "./programs";

const modules = import.meta.glob("../**/*.ts");

test("getActiveProgram returns null when there are no programs", async () => {
  const t = convexTest(schema, modules);
  const program = await t.run(async (ctx) => getActiveProgram(ctx));
  expect(program).toBeNull();
});

test("getActiveProgram returns the first program", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("programs", { name: "First", status: "active" });
    await ctx.db.insert("programs", { name: "Second", status: "planning" });
  });
  const program = await t.run(async (ctx) => getActiveProgram(ctx));
  expect(program?.name).toBe("First");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test model/programs`
Expected: FAIL — cannot find module `./programs`.

- [ ] **Step 3: Implement `convex/model/programs.ts`**

```ts
import { QueryCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

/**
 * The app scopes to a single demo program. Resolve it once, here, so every
 * list query shares the same definition of "the active program".
 */
export async function getActiveProgram(
  ctx: QueryCtx,
): Promise<Doc<"programs"> | null> {
  return await ctx.db.query("programs").first();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test model/programs`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add convex/model/programs.ts convex/model/programs.test.ts
git commit -m "feat: add getActiveProgram helper"
```

---

## Task 5: Seed mutation (the engineered demo program)

**Files:**
- Create: `convex/seed.ts`
- Test: `convex/seed.test.ts`

**Interfaces:**
- Consumes: `deleteDeliverableCascade` from `./model/deliverables`; `internalMutation` from `./_generated/server`.
- Produces: `internal.seed.run` — an `internalMutation` (args `{}`) that clears all app tables and inserts the demo program. Returns `null`.

**Data shape being seeded** (used by the tests below and every later query):
- 4 teams: Platform, Payments, Mobile, Data.
- 9 deliverables. **Cascade chain** (provider → consumer): `Auth Service → Checkout API → In-App Purchase → App Store Release`. **Planted cycle**: `Data Pipeline → Analytics Dashboard → Reporting Service → Data Pipeline`.
- 8 dependencies (the 3 chain edges, the 3 cycle edges, plus `Auth Service → API Gateway` and `API Gateway → Checkout API`), with mixed RAG and one negative-slack edge.
- 4 risks, 3 assumptions, 3 issues with mixed statuses/severities.

- [ ] **Step 1: Write the failing test**

Create `convex/seed.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

async function edgeExists(t: any, providerTitle: string, consumerTitle: string) {
  return await t.run(async (ctx: any) => {
    const byTitle = (title: string) =>
      ctx.db.query("deliverables").filter((q: any) => q.eq(q.field("title"), title)).first();
    const provider = await byTitle(providerTitle);
    const consumer = await byTitle(consumerTitle);
    if (!provider || !consumer) return false;
    const edges = await ctx.db
      .query("dependencies")
      .withIndex("by_provider", (q: any) => q.eq("providerDeliverableId", provider._id))
      .collect();
    return edges.some((e: any) => e.consumerDeliverableId === consumer._id);
  });
}

test("seed creates exactly one program and 9 deliverables", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const counts = await t.run(async (ctx) => ({
    programs: (await ctx.db.query("programs").collect()).length,
    deliverables: (await ctx.db.query("deliverables").collect()).length,
  }));
  expect(counts.programs).toBe(1);
  expect(counts.deliverables).toBe(9);
});

test("seed is idempotent (re-running does not duplicate)", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  await t.mutation(internal.seed.run, {});
  const programs = await t.run(async (ctx) => ctx.db.query("programs").collect());
  expect(programs.length).toBe(1);
});

test("seed contains the multi-hop cascade chain", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  expect(await edgeExists(t, "Auth Service", "Checkout API")).toBe(true);
  expect(await edgeExists(t, "Checkout API", "In-App Purchase")).toBe(true);
  expect(await edgeExists(t, "In-App Purchase", "App Store Release")).toBe(true);
});

test("seed contains the planted cycle", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  expect(await edgeExists(t, "Data Pipeline", "Analytics Dashboard")).toBe(true);
  expect(await edgeExists(t, "Analytics Dashboard", "Reporting Service")).toBe(true);
  expect(await edgeExists(t, "Reporting Service", "Data Pipeline")).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test seed`
Expected: FAIL — `internal.seed.run` does not exist.

- [ ] **Step 3: Implement `convex/seed.ts`**

```ts
import { internalMutation } from "./_generated/server";
import { deleteDeliverableCascade } from "./model/deliverables";

const DAY = 24 * 60 * 60 * 1000;

// Clear every app table. Deliverables go through the cascade helper so their
// dependency edges are removed in the same transaction (no orphans).
async function clearAll(ctx: any) {
  for (const table of ["risks", "assumptions", "issues", "statusChanges"] as const) {
    for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
  }
  for (const d of await ctx.db.query("deliverables").collect()) {
    await deleteDeliverableCascade(ctx, d._id);
  }
  for (const row of await ctx.db.query("programs").collect()) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("teams").collect()) await ctx.db.delete(row._id);
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    await clearAll(ctx);
    const now = Date.now();

    const programId = await ctx.db.insert("programs", {
      name: "Q3 Platform Launch",
      description: "Cross-team launch of the new payments-enabled platform.",
      startDate: now - 30 * DAY,
      targetDate: now + 60 * DAY,
      status: "active",
    });

    const teams = {
      platform: await ctx.db.insert("teams", { name: "Platform", leadName: "Priya N.", color: "#6366f1" }),
      payments: await ctx.db.insert("teams", { name: "Payments", leadName: "Marco B.", color: "#10b981" }),
      mobile: await ctx.db.insert("teams", { name: "Mobile", leadName: "Sara K.", color: "#f59e0b" }),
      data: await ctx.db.insert("teams", { name: "Data", leadName: "Wei L.", color: "#ef4444" }),
    };

    const d = async (
      title: string, team: keyof typeof teams,
      status: "not_started" | "in_progress" | "blocked" | "done",
      targetOffsetDays: number,
    ) =>
      ctx.db.insert("deliverables", {
        programId, owningTeamId: teams[team], title, status,
        targetDate: now + targetOffsetDays * DAY,
      });

    const authService = await d("Auth Service", "platform", "in_progress", 10);
    const apiGateway = await d("API Gateway", "platform", "in_progress", 15);
    const checkoutApi = await d("Checkout API", "payments", "blocked", 25);
    const billingLedger = await d("Billing Ledger", "payments", "not_started", 40);
    const inAppPurchase = await d("In-App Purchase", "mobile", "not_started", 35);
    const appStoreRelease = await d("App Store Release", "mobile", "not_started", 55);
    const dataPipeline = await d("Data Pipeline", "data", "in_progress", 20);
    const analyticsDashboard = await d("Analytics Dashboard", "data", "not_started", 45);
    const reportingService = await d("Reporting Service", "data", "not_started", 50);

    const dep = async (
      provider: typeof authService, consumer: typeof authService,
      rag: "green" | "amber" | "red", isBlocking: boolean,
      neededOffsetDays: number, committedOffsetDays: number | undefined,
      description: string,
    ) =>
      ctx.db.insert("dependencies", {
        providerDeliverableId: provider, consumerDeliverableId: consumer,
        rag, isBlocking, description,
        neededByDate: now + neededOffsetDays * DAY,
        committedDate: committedOffsetDays === undefined ? undefined : now + committedOffsetDays * DAY,
      });

    // Cascade chain (all blocking).
    await dep(authService, checkoutApi, "amber", true, 20, 22, "Checkout needs auth tokens"); // negative slack
    await dep(checkoutApi, inAppPurchase, "red", true, 30, 34, "IAP needs the checkout API"); // negative slack
    await dep(inAppPurchase, appStoreRelease, "green", true, 50, 48, "Release blocked on IAP flow");
    // Supporting realistic edges.
    await dep(authService, apiGateway, "green", true, 12, 9, "Gateway fronts auth");
    await dep(apiGateway, checkoutApi, "amber", false, 24, 24, "Checkout routes through gateway");
    // Planted cycle.
    await dep(dataPipeline, analyticsDashboard, "green", true, 22, 20, "Dashboard consumes pipeline output");
    await dep(analyticsDashboard, reportingService, "amber", false, 45, undefined, "Reports read from dashboard");
    await dep(reportingService, dataPipeline, "red", true, 18, 24, "Pipeline backfill needs report schema"); // cycle-closing, negative slack

    await ctx.db.insert("risks", { programId, owningTeamId: teams.payments, title: "PCI review may slip", description: "External auditor availability uncertain.", probability: 4, impact: 5, mitigation: "Booked provisional audit slot", ownerName: "Marco B.", status: "open" });
    await ctx.db.insert("risks", { programId, owningTeamId: teams.platform, title: "Auth vendor rate limits", description: "Load test hit vendor throttling.", probability: 3, impact: 4, mitigation: "Negotiating higher tier", ownerName: "Priya N.", status: "mitigating" });
    await ctx.db.insert("risks", { programId, owningTeamId: teams.data, title: "Pipeline/report circular dep", description: "Data Pipeline and Reporting depend on each other.", probability: 5, impact: 3, ownerName: "Wei L.", status: "open" });
    await ctx.db.insert("risks", { programId, owningTeamId: teams.mobile, title: "App Store review delay", description: "Holiday freeze window approaching.", probability: 2, impact: 4, mitigation: "Submitting two weeks early", ownerName: "Sara K.", status: "open" });

    await ctx.db.insert("assumptions", { programId, title: "Single payment provider for v1", description: "We ship with one PSP; multi-PSP is post-launch.", validationStatus: "validated", validateByDate: now - 5 * DAY, ownerName: "Marco B." });
    await ctx.db.insert("assumptions", { programId, title: "Existing SSO covers new app", description: "Assuming corp SSO works for the mobile client.", validationStatus: "unvalidated", validateByDate: now + 14 * DAY, ownerName: "Priya N." });
    await ctx.db.insert("assumptions", { programId, title: "Analytics can reuse warehouse", description: "No new warehouse needed for launch metrics.", validationStatus: "invalidated", validateByDate: now - 2 * DAY, ownerName: "Wei L." });

    await ctx.db.insert("issues", { programId, owningTeamId: teams.payments, title: "Checkout API blocked on auth", description: "Cannot integrate until Auth Service ships tokens.", severity: "high", status: "open", raisedDate: now - 6 * DAY });
    await ctx.db.insert("issues", { programId, owningTeamId: teams.data, title: "Circular dependency detected", description: "Pipeline and Reporting reference each other.", severity: "critical", status: "in_progress", raisedDate: now - 3 * DAY });
    await ctx.db.insert("issues", { programId, owningTeamId: teams.platform, title: "Staging auth flaky", description: "Intermittent 500s from auth in staging.", severity: "medium", status: "resolved", resolution: "Restarted the token cache.", raisedDate: now - 10 * DAY, resolvedDate: now - 8 * DAY });

    return null;
  },
});
```

> Keep all string values plain ASCII (the `→` characters live only in the frontend column code, not in seeded data).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test seed`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Run the seed against the dev backend**

Ensure `pnpm dev` is running in another terminal, then:
```bash
npx convex run seed:run
```
Expected: completes without error; the Convex dashboard shows the seeded tables.

- [ ] **Step 6: Commit**

```bash
git add convex/seed.ts convex/seed.test.ts
git commit -m "feat: add engineered demo seed (cascade chain + planted cycle)"
```

---

## Task 6: Programs & Teams read queries

**Files:**
- Create: `convex/programs.ts`, `convex/teams.ts`
- Test: `convex/programs.test.ts`

**Interfaces:**
- Consumes: `getActiveProgram` from `./model/programs`.
- Produces:
  - `api.programs.getActive` — query (args `{}`) → `Doc<"programs"> | null`.
  - `api.teams.list` — query (args `{}`) → `Doc<"teams">[]` (all teams, ascending by creation).

- [ ] **Step 1: Write the failing test**

Create `convex/programs.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("programs.getActive returns the seeded program", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const program = await t.query(api.programs.getActive, {});
  expect(program?.name).toBe("Q3 Platform Launch");
});

test("teams.list returns all four teams", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const teams = await t.query(api.teams.list, {});
  expect(teams.map((x) => x.name).sort()).toEqual(["Data", "Mobile", "Payments", "Platform"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test programs`
Expected: FAIL — `api.programs.getActive` / `api.teams.list` do not exist.

- [ ] **Step 3: Implement `convex/programs.ts`**

```ts
import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";

export const getActive = query({
  args: {},
  handler: async (ctx) => await getActiveProgram(ctx),
});
```

- [ ] **Step 4: Implement `convex/teams.ts`**

```ts
import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("teams").take(500),
});
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test programs`
Expected: PASS — 2 tests passed.

- [ ] **Step 6: Commit**

```bash
git add convex/programs.ts convex/teams.ts convex/programs.test.ts
git commit -m "feat: add programs.getActive and teams.list queries"
```

---

## Task 7: Deliverables read query

**Files:**
- Create: `convex/deliverables.ts`
- Test: `convex/deliverables.test.ts`

**Interfaces:**
- Consumes: `getActiveProgram` from `./model/programs`.
- Produces: `api.deliverables.list` — query (args `{}`) → array of:
  ```ts
  { _id: Id<"deliverables">; _creationTime: number; title: string;
    description?: string; status: "not_started" | "in_progress" | "blocked" | "done";
    targetDate?: number; actualDate?: number;
    teamName: string; teamColor: string }
  ```
  Empty array when there is no active program.

- [ ] **Step 1: Write the failing test**

Create `convex/deliverables.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("deliverables.list joins the owning team name", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const rows = await t.query(api.deliverables.list, {});
  expect(rows.length).toBe(9);
  const auth = rows.find((r) => r.title === "Auth Service");
  expect(auth?.teamName).toBe("Platform");
  expect(auth?.teamColor).toBe("#6366f1");
});

test("deliverables.list is empty with no program", async () => {
  const t = convexTest(schema, modules);
  const rows = await t.query(api.deliverables.list, {});
  expect(rows).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test convex/deliverables`
Expected: FAIL — `api.deliverables.list` does not exist.

- [ ] **Step 3: Implement `convex/deliverables.ts`**

```ts
import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return [];

    const teams = await ctx.db.query("teams").take(500);
    const teamById = new Map(teams.map((t) => [t._id, t]));

    const deliverables = await ctx.db
      .query("deliverables")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);

    return deliverables.map((d) => {
      const team = teamById.get(d.owningTeamId);
      return {
        _id: d._id,
        _creationTime: d._creationTime,
        title: d.title,
        description: d.description,
        status: d.status,
        targetDate: d.targetDate,
        actualDate: d.actualDate,
        teamName: team?.name ?? "—",
        teamColor: team?.color ?? "#94a3b8",
      };
    });
  },
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test convex/deliverables`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add convex/deliverables.ts convex/deliverables.test.ts
git commit -m "feat: add deliverables.list query with team join"
```

---

## Task 8: Dependencies read query (with slackDays)

**Files:**
- Create: `convex/dependencies.ts`
- Test: `convex/dependencies.test.ts`

**Interfaces:**
- Consumes: `getActiveProgram` from `./model/programs`; `slackDays` from `./model/derived`.
- Produces: `api.dependencies.list` — query (args `{}`) → array of:
  ```ts
  { _id: Id<"dependencies">; _creationTime: number; description?: string;
    neededByDate: number; committedDate?: number;
    rag: "green" | "amber" | "red"; isBlocking: boolean;
    slackDays: number | null;
    providerTitle: string; providerTeamName: string;
    consumerTitle: string; consumerTeamName: string }
  ```
  Only edges whose provider deliverable is in the active program. Empty when no program.

- [ ] **Step 1: Write the failing test**

Create `convex/dependencies.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("dependencies.list joins titles and computes slackDays", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const rows = await t.query(api.dependencies.list, {});
  expect(rows.length).toBe(8);

  const chainEdge = rows.find(
    (r) => r.providerTitle === "Auth Service" && r.consumerTitle === "Checkout API",
  );
  expect(chainEdge?.providerTeamName).toBe("Platform");
  expect(chainEdge?.consumerTeamName).toBe("Payments");
  // needed day 20, committed day 22 -> slack -2
  expect(chainEdge?.slackDays).toBe(-2);

  const softEdge = rows.find((r) => r.consumerTitle === "Reporting Service");
  expect(softEdge?.slackDays).toBeNull(); // no committed date on that edge
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test dependencies`
Expected: FAIL — `api.dependencies.list` does not exist.

- [ ] **Step 3: Implement `convex/dependencies.ts`**

```ts
import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";
import { slackDays } from "./model/derived";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return [];

    const teams = await ctx.db.query("teams").take(500);
    const teamById = new Map(teams.map((t) => [t._id, t]));

    const deliverables = await ctx.db
      .query("deliverables")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    const deliverableById = new Map(deliverables.map((d) => [d._id, d]));

    const edges = await ctx.db.query("dependencies").take(500);
    const inProgram = edges.filter((e) => deliverableById.has(e.providerDeliverableId));

    const teamName = (deliverableId: any) => {
      const d = deliverableById.get(deliverableId);
      const team = d ? teamById.get(d.owningTeamId) : undefined;
      return team?.name ?? "—";
    };
    const title = (deliverableId: any) => deliverableById.get(deliverableId)?.title ?? "—";

    return inProgram.map((e) => ({
      _id: e._id,
      _creationTime: e._creationTime,
      description: e.description,
      neededByDate: e.neededByDate,
      committedDate: e.committedDate,
      rag: e.rag,
      isBlocking: e.isBlocking,
      slackDays: slackDays(e.neededByDate, e.committedDate),
      providerTitle: title(e.providerDeliverableId),
      providerTeamName: teamName(e.providerDeliverableId),
      consumerTitle: title(e.consumerDeliverableId),
      consumerTeamName: teamName(e.consumerDeliverableId),
    }));
  },
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test dependencies`
Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add convex/dependencies.ts convex/dependencies.test.ts
git commit -m "feat: add dependencies.list query with slackDays + title joins"
```

---

## Task 9: Risks, Assumptions & Issues read queries

**Files:**
- Create: `convex/risks.ts`, `convex/assumptions.ts`, `convex/issues.ts`
- Test: `convex/raid.test.ts`

**Interfaces:**
- Consumes: `getActiveProgram` from `./model/programs`; `riskScore` from `./model/derived`.
- Produces (all args `{}`, all empty when no program):
  - `api.risks.list` → `{ _id, _creationTime, title, description?, probability, impact, score, mitigation?, ownerName?, status, teamName }[]`
  - `api.assumptions.list` → `{ _id, _creationTime, title, description?, validationStatus, validateByDate?, ownerName? }[]`
  - `api.issues.list` → `{ _id, _creationTime, title, description?, severity, status, resolution?, raisedDate, resolvedDate?, teamName }[]`

- [ ] **Step 1: Write the failing tests**

Create `convex/raid.test.ts`:
```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("risks.list computes score = probability * impact and joins team", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const rows = await t.query(api.risks.list, {});
  expect(rows.length).toBe(4);
  const pci = rows.find((r) => r.title.includes("PCI") || r.title.includes("review"));
  expect(pci?.score).toBe(20); // 4 * 5
  expect(pci?.teamName).toBe("Payments");
});

test("assumptions.list returns all three", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const rows = await t.query(api.assumptions.list, {});
  expect(rows.length).toBe(3);
});

test("issues.list joins team and returns all three", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const rows = await t.query(api.issues.list, {});
  expect(rows.length).toBe(3);
  expect(rows.find((r) => r.severity === "critical")?.teamName).toBe("Data");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test raid`
Expected: FAIL — the three queries do not exist.

- [ ] **Step 3: Implement `convex/risks.ts`**

```ts
import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";
import { riskScore } from "./model/derived";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return [];
    const teams = await ctx.db.query("teams").take(500);
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const risks = await ctx.db
      .query("risks")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    return risks.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      title: r.title,
      description: r.description,
      probability: r.probability,
      impact: r.impact,
      score: riskScore(r.probability, r.impact),
      mitigation: r.mitigation,
      ownerName: r.ownerName,
      status: r.status,
      teamName: teamById.get(r.owningTeamId)?.name ?? "—",
    }));
  },
});
```

- [ ] **Step 4: Implement `convex/assumptions.ts`**

```ts
import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return [];
    const assumptions = await ctx.db
      .query("assumptions")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    return assumptions.map((a) => ({
      _id: a._id,
      _creationTime: a._creationTime,
      title: a.title,
      description: a.description,
      validationStatus: a.validationStatus,
      validateByDate: a.validateByDate,
      ownerName: a.ownerName,
    }));
  },
});
```

- [ ] **Step 5: Implement `convex/issues.ts`**

```ts
import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return [];
    const teams = await ctx.db.query("teams").take(500);
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    return issues.map((i) => ({
      _id: i._id,
      _creationTime: i._creationTime,
      title: i.title,
      description: i.description,
      severity: i.severity,
      status: i.status,
      resolution: i.resolution,
      raisedDate: i.raisedDate,
      resolvedDate: i.resolvedDate,
      teamName: teamById.get(i.owningTeamId)?.name ?? "—",
    }));
  },
});
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test raid`
Expected: PASS — 3 tests passed.

- [ ] **Step 7: Run the full suite and commit**

Run: `pnpm test`
Expected: PASS — all tests green.
```bash
git add convex/risks.ts convex/assumptions.ts convex/issues.ts convex/raid.test.ts
git commit -m "feat: add risks/assumptions/issues list queries"
```

---

## Task 10: App shell — shadcn components + sidebar

**Files:**
- Create (via CLI): `components/ui/{sidebar,table,badge,separator,tooltip,skeleton,input}.tsx` and their deps.
- Create: `components/app-sidebar.tsx`
- Modify: `app/layout.tsx`, `app/page.tsx`

**Interfaces:**
- Produces: a persistent sidebar shell wrapping all routes, with links to `/deliverables`, `/dependencies`, `/risks`, `/assumptions`, `/issues`, `/teams`. `/` redirects to `/deliverables`.

- [ ] **Step 1: Add the shadcn components**

Run:
```bash
pnpm dlx shadcn@latest add sidebar table badge separator tooltip skeleton input
```
Expected: files land in `components/ui/`. (If a prompt asks to overwrite `button.tsx`, decline.)

- [ ] **Step 2: Create `components/app-sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV = [
  { href: "/deliverables", label: "Deliverables" },
  { href: "/dependencies", label: "Dependencies" },
  { href: "/risks", label: "Risks" },
  { href: "/assumptions", label: "Assumptions" },
  { href: "/issues", label: "Issues" },
  { href: "/teams", label: "Teams" },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3 text-sm font-semibold">
        RAID Tracker
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Program</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>{item.label}</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
```

- [ ] **Step 3: Wrap the app in the sidebar in `app/layout.tsx`**

Replace the `<ConvexClientProvider>{children}</ConvexClientProvider>` line's contents so the body becomes:
```tsx
<ConvexClientProvider>
  <SidebarProvider>
    <AppSidebar />
    <main className="flex-1 p-6">
      <SidebarTrigger className="mb-4" />
      {children}
    </main>
  </SidebarProvider>
</ConvexClientProvider>
```
And add these imports at the top of `app/layout.tsx`:
```tsx
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
```

- [ ] **Step 4: Redirect `/` to `/deliverables` in `app/page.tsx`**

Replace the whole file with:
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/deliverables");
}
```

- [ ] **Step 5: Verify it builds**

Run: `pnpm build`
Expected: build succeeds (routes for `/deliverables` etc. don't exist yet — that's fine, `/` compiles; if Next errors on the redirect target not existing, ignore — it's a runtime redirect). If the build fails for another reason, fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add components/ui components/app-sidebar.tsx app/layout.tsx app/page.tsx
git commit -m "feat: add sidebar app shell and shadcn components"
```

---

## Task 11: Reusable DataTable + Deliverables page

**Files:**
- Create: `components/data-table.tsx`
- Create: `app/(app)/deliverables/page.tsx`, `app/(app)/deliverables/columns.tsx`

**Interfaces:**
- Consumes: `api.deliverables.list`; shadcn `Table` primitives; `@tanstack/react-table`.
- Produces: `DataTable<TData>({ columns, data })` — a client component rendering a sortable table. Reused by every entity page. Each page is a server component that `preloadQuery`s and passes the payload to a small client wrapper.

- [ ] **Step 1: Create the reusable `components/data-table.tsx`**

```tsx
"use client";

import {
  ColumnDef, flexRender, getCoreRowModel, getSortedRowModel,
  SortingState, useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export function DataTable<TData>({
  columns, data,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className="cursor-pointer select-none"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No rows. Run <code>npx convex run seed:run</code> to load the demo program.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(app)/deliverables/columns.tsx`**

```tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";

type Deliverable = FunctionReturnType<typeof api.deliverables.list>[number];

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");

export const columns: ColumnDef<Deliverable, unknown>[] = [
  { accessorKey: "title", header: "Title" },
  {
    accessorKey: "teamName",
    header: "Team",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: row.original.teamColor }} />
        {row.original.teamName}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge variant="outline">{row.original.status.replace("_", " ")}</Badge>,
  },
  { accessorKey: "targetDate", header: "Target", cell: ({ row }) => fmt(row.original.targetDate) },
];
```

- [ ] **Step 3: Create `app/(app)/deliverables/page.tsx`**

```tsx
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";

export default async function DeliverablesPage() {
  const preloaded = await preloadQuery(api.deliverables.list, {});
  const data = preloadedQueryResult(preloaded);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Deliverables</h1>
      <DataTable columns={columns} data={data} />
    </section>
  );
}
```

> Note: this uses `preloadedQueryResult` to read the payload directly in the server component (simplest for a static-first render). Real-time reactivity is added in the same pattern later by passing `preloaded` to a client component that calls `usePreloadedQuery`; for Phase 1's read tables the direct result is sufficient and the DataTable stays reusable.

- [ ] **Step 4: Verify it renders**

Ensure `pnpm dev` is running and the seed has been run (`npx convex run seed:run`). Visit `http://localhost:3000/deliverables`.
Expected: a sortable table of 9 deliverables with team color dots and status badges. Clicking a header sorts.

Then run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/data-table.tsx "app/(app)/deliverables"
git commit -m "feat: add reusable DataTable and deliverables page"
```

---

## Task 12: Dependencies page

**Files:**
- Create: `app/(app)/dependencies/page.tsx`, `app/(app)/dependencies/columns.tsx`

**Interfaces:**
- Consumes: `api.dependencies.list`; `DataTable`; `Badge`.
- Produces: the `/dependencies` route showing edges with RAG, blocking flag, needed-by vs. committed, and derived slack.

- [ ] **Step 1: Create `app/(app)/dependencies/columns.tsx`**

```tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";

type Dependency = FunctionReturnType<typeof api.dependencies.list>[number];

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");
const ragColor: Record<string, string> = {
  green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500",
};

export const columns: ColumnDef<Dependency, unknown>[] = [
  {
    accessorKey: "rag",
    header: "RAG",
    cell: ({ row }) => (
      <span className={`inline-block size-3 rounded-full ${ragColor[row.original.rag]}`} />
    ),
  },
  {
    id: "edge",
    header: "Dependency",
    cell: ({ row }) => (
      <span>
        {row.original.providerTitle}{" "}
        <span className="text-muted-foreground">→</span>{" "}
        {row.original.consumerTitle}
      </span>
    ),
  },
  {
    accessorKey: "isBlocking",
    header: "Type",
    cell: ({ row }) =>
      row.original.isBlocking ? <Badge variant="destructive">blocking</Badge> : <Badge variant="secondary">soft</Badge>,
  },
  { accessorKey: "neededByDate", header: "Needed by", cell: ({ row }) => fmt(row.original.neededByDate) },
  { accessorKey: "committedDate", header: "Committed", cell: ({ row }) => fmt(row.original.committedDate) },
  {
    accessorKey: "slackDays",
    header: "Slack (days)",
    cell: ({ row }) => {
      const s = row.original.slackDays;
      if (s === null) return <span className="text-muted-foreground">—</span>;
      return <span className={s < 0 ? "font-medium text-red-600" : ""}>{s}</span>;
    },
  },
];
```

- [ ] **Step 2: Create `app/(app)/dependencies/page.tsx`**

```tsx
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";

export default async function DependenciesPage() {
  const preloaded = await preloadQuery(api.dependencies.list, {});
  const data = preloadedQueryResult(preloaded);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Dependencies</h1>
      <DataTable columns={columns} data={data} />
    </section>
  );
}
```

- [ ] **Step 3: Verify it renders**

Visit `http://localhost:3000/dependencies`.
Expected: 8 edges, RAG dots, blocking/soft badges, and negative slack (e.g. Auth Service → Checkout API showing −2) rendered in red. The soft edge to Reporting Service shows slack "—".

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dependencies"
git commit -m "feat: add dependencies page with RAG and slack columns"
```

---

## Task 13: Risks, Assumptions, Issues & Teams pages

**Files:**
- Create: `app/(app)/risks/{page.tsx,columns.tsx}`, `app/(app)/assumptions/{page.tsx,columns.tsx}`, `app/(app)/issues/{page.tsx,columns.tsx}`, `app/(app)/teams/{page.tsx,columns.tsx}`

**Interfaces:**
- Consumes: `api.risks.list`, `api.assumptions.list`, `api.issues.list`, `api.teams.list`; `DataTable`; `Badge`.
- Produces: the remaining four routes.

- [ ] **Step 1: Create `app/(app)/risks/columns.tsx`**

```tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";

type Risk = FunctionReturnType<typeof api.risks.list>[number];

export const columns: ColumnDef<Risk, unknown>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "teamName", header: "Team" },
  { accessorKey: "probability", header: "P" },
  { accessorKey: "impact", header: "I" },
  {
    accessorKey: "score",
    header: "Score",
    cell: ({ row }) => {
      const s = row.original.score;
      return <span className={s >= 15 ? "font-semibold text-red-600" : ""}>{s}</span>;
    },
  },
  { accessorKey: "ownerName", header: "Owner", cell: ({ row }) => row.original.ownerName ?? "—" },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge> },
];
```

- [ ] **Step 2: Create `app/(app)/risks/page.tsx`**

```tsx
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";

export default async function RisksPage() {
  const preloaded = await preloadQuery(api.risks.list, {});
  const data = preloadedQueryResult(preloaded);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Risks</h1>
      <DataTable columns={columns} data={data} />
    </section>
  );
}
```

- [ ] **Step 3: Create `app/(app)/assumptions/columns.tsx`**

```tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";

type Assumption = FunctionReturnType<typeof api.assumptions.list>[number];

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");

export const columns: ColumnDef<Assumption, unknown>[] = [
  { accessorKey: "title", header: "Title" },
  {
    accessorKey: "validationStatus",
    header: "Validation",
    cell: ({ row }) => <Badge variant="outline">{row.original.validationStatus}</Badge>,
  },
  { accessorKey: "validateByDate", header: "Validate by", cell: ({ row }) => fmt(row.original.validateByDate) },
  { accessorKey: "ownerName", header: "Owner", cell: ({ row }) => row.original.ownerName ?? "—" },
];
```

- [ ] **Step 4: Create `app/(app)/assumptions/page.tsx`**

```tsx
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";

export default async function AssumptionsPage() {
  const preloaded = await preloadQuery(api.assumptions.list, {});
  const data = preloadedQueryResult(preloaded);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Assumptions</h1>
      <DataTable columns={columns} data={data} />
    </section>
  );
}
```

- [ ] **Step 5: Create `app/(app)/issues/columns.tsx`**

```tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";

type Issue = FunctionReturnType<typeof api.issues.list>[number];

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");
const sevVariant: Record<string, "outline" | "secondary" | "destructive"> = {
  low: "outline", medium: "secondary", high: "destructive", critical: "destructive",
};

export const columns: ColumnDef<Issue, unknown>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "teamName", header: "Team" },
  {
    accessorKey: "severity",
    header: "Severity",
    cell: ({ row }) => <Badge variant={sevVariant[row.original.severity]}>{row.original.severity}</Badge>,
  },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant="outline">{row.original.status.replace("_", " ")}</Badge> },
  { accessorKey: "raisedDate", header: "Raised", cell: ({ row }) => fmt(row.original.raisedDate) },
];
```

- [ ] **Step 6: Create `app/(app)/issues/page.tsx`**

```tsx
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";

export default async function IssuesPage() {
  const preloaded = await preloadQuery(api.issues.list, {});
  const data = preloadedQueryResult(preloaded);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Issues</h1>
      <DataTable columns={columns} data={data} />
    </section>
  );
}
```

- [ ] **Step 7: Create `app/(app)/teams/columns.tsx`**

```tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";

type Team = FunctionReturnType<typeof api.teams.list>[number];

export const columns: ColumnDef<Team, unknown>[] = [
  {
    accessorKey: "name",
    header: "Team",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: row.original.color }} />
        {row.original.name}
      </span>
    ),
  },
  { accessorKey: "leadName", header: "Lead", cell: ({ row }) => row.original.leadName ?? "—" },
  { accessorKey: "color", header: "Color" },
];
```

- [ ] **Step 8: Create `app/(app)/teams/page.tsx`**

```tsx
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";

export default async function TeamsPage() {
  const preloaded = await preloadQuery(api.teams.list, {});
  const data = preloadedQueryResult(preloaded);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Teams</h1>
      <DataTable columns={columns} data={data} />
    </section>
  );
}
```

- [ ] **Step 9: Verify all four routes render**

With `pnpm dev` running and seed loaded, visit `/risks`, `/assumptions`, `/issues`, `/teams`.
Expected: each shows its table — risks with score (20 highlighted red), assumptions with validation badges, issues with severity badges (critical on the Data issue), teams with color dots.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/risks" "app/(app)/assumptions" "app/(app)/issues" "app/(app)/teams"
git commit -m "feat: add risks, assumptions, issues, and teams pages"
```

---

## Task 14: Final verification pass

**Files:** none (verification + memory only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — every test green.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors. Fix any that appear (unused imports, etc.), then re-run.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: build + typecheck succeed with all six routes compiled.

- [ ] **Step 4: End-to-end visual check (agent-browser)**

Install and use `vercel-labs/agent-browser` (per the standing memory note) to confirm each route renders correctly against the running dev server: sidebar navigation works, tables populate, sort toggles, and the dependency slack/RAG and risk score styling appear as intended. Note the memory item can be marked done once this passes.

- [ ] **Step 5: Update the CLAUDE.md test note (optional, trivial)**

If desired, update the `# test: TODO — no test script configured yet` line in `CLAUDE.md` to reflect that `pnpm test` now runs the Vitest + convex-test suite. Commit directly to `main` (trivial doc change per Git conventions).

- [ ] **Step 6: Final commit / branch wrap-up**

If working on a `feat/phase-1-raid-crud` branch, this is the point to open the self-reviewed PR and squash-merge, then tag `v0.1.0` (Phase 1 landed) per the roadmap's tagging convention.

---

## Notes on invariants honored by this plan

- **Derived values never stored:** `slackDays` and `score` exist only as pure functions called inside queries (Tasks 2, 8, 9).
- **Manual referential integrity:** `deleteDeliverableCascade` (Task 3) is the only path the seed uses to remove deliverables (Task 5).
- **Dependencies stay edges:** the seed and `dependencies.list` model provider → consumer throughout.
- **No `useQuery` in server components:** pages use `preloadQuery` + `preloadedQueryResult` (Tasks 11–13).
- **Dates are Unix-ms numbers:** the seed writes `Date.now()`-based offsets; queries never read the wall clock.
- **R/A/I separate:** three distinct queries and three distinct pages.
- **`statusChanges` deliberately unwritten** in Phase 1 (no tracked-field mutations yet).
```
