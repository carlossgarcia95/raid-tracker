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

test("setRag updates the edge and logs the change", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const before = await t.query(api.dependencies.list, {});
  const target = before.find((e) => e.rag === "green")!;

  await t.mutation(api.dependencies.setRag, { id: target._id, rag: "red" });

  const after = await t.query(api.dependencies.list, {});
  expect(after.find((e) => e._id === target._id)!.rag).toBe("red");

  const logs = await t.run(async (ctx) =>
    ctx.db
      .query("statusChanges")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "dependency").eq("entityId", target._id),
      )
      .collect(),
  );
  expect(logs).toHaveLength(1);
  expect(logs[0].field).toBe("rag");
  expect(logs[0].newValue).toBe("red");
});
