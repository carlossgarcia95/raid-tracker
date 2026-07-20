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

test("setStatus updates status, sets actualDate on done, and logs the change", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const before = await t.query(api.deliverables.list, {});
  const auth = before.find((d) => d.title === "Auth Service")!;

  await t.mutation(api.deliverables.setStatus, { id: auth._id, status: "done" });

  const after = await t.query(api.deliverables.list, {});
  const authAfter = after.find((d) => d._id === auth._id)!;
  expect(authAfter.status).toBe("done");
  expect(authAfter.actualDate).toBeTypeOf("number");

  const logs = await t.run(async (ctx) =>
    ctx.db
      .query("statusChanges")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "deliverable").eq("entityId", auth._id),
      )
      .collect(),
  );
  expect(logs).toHaveLength(1);
  expect(logs[0].field).toBe("status");
  expect(logs[0].oldValue).toBe("in_progress");
  expect(logs[0].newValue).toBe("done");
});

test("setStatus is a no-op (no log) when the status is unchanged", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const before = await t.query(api.deliverables.list, {});
  const auth = before.find((d) => d.title === "Auth Service")!;

  await t.mutation(api.deliverables.setStatus, { id: auth._id, status: "in_progress" });

  const logs = await t.run(async (ctx) =>
    ctx.db
      .query("statusChanges")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "deliverable").eq("entityId", auth._id),
      )
      .collect(),
  );
  expect(logs).toHaveLength(0);
});
