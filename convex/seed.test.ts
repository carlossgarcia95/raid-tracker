/// <reference types="vite/client" />
import { convexTest, TestConvex } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

async function edgeExists(
  t: TestConvex<typeof schema>,
  providerTitle: string,
  consumerTitle: string,
) {
  return await t.run(async (ctx) => {
    const byTitle = (title: string) =>
      // eslint-disable-next-line @convex-dev/no-filter-in-query -- one-off lookup by title in a test helper
      ctx.db.query("deliverables").filter((q) => q.eq(q.field("title"), title)).first();
    const provider = await byTitle(providerTitle);
    const consumer = await byTitle(consumerTitle);
    if (!provider || !consumer) return false;
    const edges = await ctx.db
      .query("dependencies")
      .withIndex("by_provider", (q) => q.eq("providerDeliverableId", provider._id))
      .collect();
    return edges.some((e) => e.consumerDeliverableId === consumer._id);
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
