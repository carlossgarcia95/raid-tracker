import { expect, test } from "vitest";
import { downstreamOf, upstreamOf } from "./graph-traverse";

const edges = [
  { source: "a", target: "b" },
  { source: "b", target: "c" },
  { source: "c", target: "d" },
];

test("downstreamOf returns the full transitive downstream set", () => {
  expect([...downstreamOf("a", edges)].sort()).toEqual(["b", "c", "d"]);
  expect([...downstreamOf("c", edges)].sort()).toEqual(["d"]);
});

test("upstreamOf returns the full transitive upstream set", () => {
  expect([...upstreamOf("d", edges)].sort()).toEqual(["a", "b", "c"]);
});

test("traversal is cycle-safe and excludes the start node", () => {
  const cyclic = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "c", target: "a" },
  ];
  const out = downstreamOf("a", cyclic);
  expect(out.has("a")).toBe(false);
  expect([...out].sort()).toEqual(["b", "c"]);
});

test("an isolated node has empty upstream and downstream sets", () => {
  expect(downstreamOf("x", edges).size).toBe(0);
  expect(upstreamOf("x", edges).size).toBe(0);
});
