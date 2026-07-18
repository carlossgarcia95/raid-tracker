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
