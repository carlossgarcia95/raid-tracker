/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("programs.getActive returns the seeded program", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const program = await t.query(api.programs.getActive, {});
  expect(program?.name).toBe("Q3 Platform Launch");
});

test("teams.list returns all four teams", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const teams = await t.query(api.teams.list, {});
  expect(teams.map((x) => x.name).sort()).toEqual(["Data", "Mobile", "Payments", "Platform"]);
});
