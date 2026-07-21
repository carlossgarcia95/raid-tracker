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
