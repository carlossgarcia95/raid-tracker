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
