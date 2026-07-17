/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../schema";
import { getActiveProgram } from "./programs";

const modules = import.meta.glob("../**/*.ts");

test("getActiveProgram returns null when there are no programs", async () => {
  const t = convexTest(schema, modules);
  const program = await t.run(async (ctx) => getActiveProgram(ctx));
  expect(program).toBeNull();
});

test("getActiveProgram returns the first program", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("programs", { name: "First", status: "active" });
    await ctx.db.insert("programs", { name: "Second", status: "planning" });
  });
  const program = await t.run(async (ctx) => getActiveProgram(ctx));
  expect(program?.name).toBe("First");
});
