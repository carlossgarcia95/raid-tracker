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
    // unrelated edge that does not touch `target` at all — must survive the cascade
    const unrelated = await ctx.db.insert("dependencies", {
      providerDeliverableId: upstream, consumerDeliverableId: downstream,
      neededByDate: 0, rag: "green", isBlocking: true,
    });
    return { target, unrelated };
  });

  await t.run(async (ctx) => deleteDeliverableCascade(ctx, ids.target));

  const remaining = await t.run(async (ctx) => ({
    deliverable: await ctx.db.get(ids.target),
    edges: await ctx.db.query("dependencies").collect(),
  }));

  expect(remaining.deliverable).toBeNull();
  // only the unrelated edge (upstream -> downstream) survives; both edges
  // touching `target` are gone — proves the helper deletes selectively.
  expect(remaining.edges).toHaveLength(1);
  expect(remaining.edges[0]?._id).toBe(ids.unrelated);
});

test("deleting a deliverable with a self-referencing edge does not throw and removes both", async () => {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const programId = await ctx.db.insert("programs", { name: "P", status: "active" });
    const teamId = await ctx.db.insert("teams", { name: "T", color: "#111" });
    const target = await ctx.db.insert("deliverables", {
      programId, owningTeamId: teamId, title: "self-referencing", status: "not_started",
    });
    // self-edge: provider and consumer are both `target`, so it is returned by
    // BOTH the by_provider and by_consumer queries — must be deduped before delete.
    await ctx.db.insert("dependencies", {
      providerDeliverableId: target, consumerDeliverableId: target,
      neededByDate: 0, rag: "green", isBlocking: true,
    });
    return { target };
  });

  await expect(
    t.run(async (ctx) => deleteDeliverableCascade(ctx, ids.target)),
  ).resolves.not.toThrow();

  const remaining = await t.run(async (ctx) => ({
    deliverable: await ctx.db.get(ids.target),
    edges: await ctx.db.query("dependencies").collect(),
  }));

  expect(remaining.deliverable).toBeNull();
  expect(remaining.edges).toEqual([]);
});
