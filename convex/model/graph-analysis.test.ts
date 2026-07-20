/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { detectCycles, type AnalysisNode, type AnalysisEdge } from "./graph-analysis";

const node = (id: string, over: Partial<AnalysisNode> = {}): AnalysisNode => ({
  id,
  title: id,
  status: "in_progress",
  ...over,
});
const edge = (
  id: string,
  source: string,
  target: string,
  over: Partial<AnalysisEdge> = {},
): AnalysisEdge => ({
  id,
  source,
  target,
  rag: "green",
  isBlocking: true,
  slackDays: null,
  ...over,
});

test("detectCycles finds a 3-node cycle and names its members", () => {
  const nodes = [node("a"), node("b"), node("c")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "c", "a")];
  const cycles = detectCycles(nodes, edges);
  expect(cycles).toHaveLength(1);
  expect([...cycles[0].deliverableIds].sort()).toEqual(["a", "b", "c"]);
  expect([...cycles[0].edgeIds].sort()).toEqual(["e1", "e2", "e3"]);
});

test("detectCycles returns [] for an acyclic chain", () => {
  const nodes = [node("a"), node("b"), node("c")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c")];
  expect(detectCycles(nodes, edges)).toEqual([]);
});

test("detectCycles finds a self-loop as a single-node cycle", () => {
  const nodes = [node("a")];
  const edges = [edge("e1", "a", "a")];
  const cycles = detectCycles(nodes, edges);
  expect(cycles).toHaveLength(1);
  expect(cycles[0].deliverableIds).toEqual(["a"]);
});

test("detectCycles finds two disjoint cycles", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => node(id));
  const edges = [
    edge("e1", "a", "b"),
    edge("e2", "b", "a"),
    edge("e3", "c", "d"),
    edge("e4", "d", "c"),
  ];
  const cycles = detectCycles(nodes, edges);
  expect(cycles).toHaveLength(2);
});
