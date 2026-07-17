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
