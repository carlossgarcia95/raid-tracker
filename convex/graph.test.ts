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
