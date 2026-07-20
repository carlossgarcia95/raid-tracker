/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("graph.get returns program nodes and edges wired provider->consumer", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const { nodes, edges } = await t.query(api.graph.get, {});

  // Seed has 9 deliverables and 8 dependencies, all in one program.
  expect(nodes.length).toBe(9);
  expect(edges.length).toBe(8);

  // No dangling edges: every source/target is a real node.
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    expect(nodeIds.has(e.source)).toBe(true);
    expect(nodeIds.has(e.target)).toBe(true);
  }

  // Auth Service -> Checkout API: amber, needed day 20, committed day 22 -> slack -2.
  const auth = nodes.find((n) => n.title === "Auth Service")!;
  const checkout = nodes.find((n) => n.title === "Checkout API")!;
  const edge = edges.find((e) => e.source === auth.id && e.target === checkout.id);
  expect(edge?.rag).toBe("amber");
  expect(edge?.slackDays).toBe(-2);

  // Nodes carry the owning team's rendering color (Platform = #6366f1).
  expect(auth.teamColor).toBe("#6366f1");

  // Edge with no committed date -> null slack (Analytics -> Reporting).
  const softEdge = edges.find((e) => e.consumerTitle === "Reporting Service");
  expect(softEdge?.slackDays).toBeNull();
});

test("graph.get excludes deliverables and edges from a non-active program", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});

  const { programAId, otherDeliverableId } = await t.run(async (ctx) => {
    // The seed's program is the first-inserted, so it's "active" per
    // getActiveProgram (ctx.db.query("programs").first()).
    const programA = await ctx.db.query("programs").first();
    if (!programA) throw new Error("expected seeded program");

    // Program B is inserted AFTER the seed's program, so it is NOT active.
    const programBId = await ctx.db.insert("programs", {
      name: "Program B",
      status: "planning",
    });
    const teamBId = await ctx.db.insert("teams", {
      name: "Team B",
      color: "#000000",
    });
    const otherDeliverableId = await ctx.db.insert("deliverables", {
      programId: programBId,
      owningTeamId: teamBId,
      title: "Out-of-Program Deliverable",
      status: "not_started",
    });

    // A deliverable that IS in the active program (A), to be the provider
    // of a cross-program edge.
    const programADeliverable = await ctx.db
      .query("deliverables")
      .withIndex("by_program", (q) => q.eq("programId", programA._id))
      .first();
    if (!programADeliverable) throw new Error("expected seeded deliverable");

    // A dependency that crosses programs: provider in A, consumer in B.
    await ctx.db.insert("dependencies", {
      providerDeliverableId: programADeliverable._id,
      consumerDeliverableId: otherDeliverableId,
      rag: "green",
      isBlocking: false,
      neededByDate: Date.now(),
    });

    return { programAId: programA._id, otherDeliverableId };
  });

  const { nodes, edges } = await t.query(api.graph.get, {});

  // Still only program A's 9 seeded deliverables — B's deliverable excluded.
  expect(nodes.length).toBe(9);
  expect(nodes.some((n) => n.id === otherDeliverableId)).toBe(false);
  for (const n of nodes) {
    expect(n.id).not.toBe(otherDeliverableId);
  }

  // Still only the seed's 8 edges — the cross-program edge is dropped
  // because one endpoint (the consumer) isn't a rendered node.
  expect(edges.length).toBe(8);
  expect(
    edges.some(
      (e) => e.source === otherDeliverableId || e.target === otherDeliverableId,
    ),
  ).toBe(false);

  // Sanity: program A really is what we think it is (the active program).
  expect(programAId).toBeDefined();
});
