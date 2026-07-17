/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

test("risks.list computes score = probability * impact and joins team", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const rows = await t.query(api.risks.list, {});
  expect(rows.length).toBe(4);
  const pci = rows.find((r) => r.title.includes("PCI") || r.title.includes("review"));
  expect(pci?.score).toBe(20); // 4 * 5
  expect(pci?.teamName).toBe("Payments");
});

test("assumptions.list returns all three", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const rows = await t.query(api.assumptions.list, {});
  expect(rows.length).toBe(3);
});

test("issues.list joins team and returns all three", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.run, {});
  const rows = await t.query(api.issues.list, {});
  expect(rows.length).toBe(3);
  expect(rows.find((r) => r.severity === "critical")?.teamName).toBe("Data");
});
