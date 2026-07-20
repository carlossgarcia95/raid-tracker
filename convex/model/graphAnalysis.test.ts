/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { detectCycles, type AnalysisNode, type AnalysisEdge } from "./graphAnalysis";
import { computeCascade } from "./graphAnalysis";

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

test("computeCascade propagates a blocked node red down a blocking chain", () => {
  const nodes = [node("a", { status: "blocked" }), node("b"), node("c")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c")];
  const { nodeStates } = computeCascade(nodes, edges, 0);
  expect(nodeStates["a"].effectiveRag).toBe("red");
  expect(nodeStates["b"].effectiveRag).toBe("red");
  expect(nodeStates["c"].effectiveRag).toBe("red");
  expect(nodeStates["a"].reasons).toContain("blocked");
  expect(nodeStates["c"].reasons).toContain("depends on at-risk: b");
});

test("computeCascade softens risk one level across a non-blocking edge", () => {
  const nodes = [node("a", { status: "blocked" }), node("b")];
  const edges = [edge("e1", "a", "b", { isBlocking: false })];
  const { nodeStates } = computeCascade(nodes, edges, 0);
  expect(nodeStates["a"].effectiveRag).toBe("red");
  expect(nodeStates["b"].effectiveRag).toBe("amber");
});

test("computeCascade takes the max severity when paths converge (diamond)", () => {
  const nodes = [node("a", { status: "blocked" }), node("b"), node("d"), node("e")];
  const edges = [
    edge("e1", "a", "b"), // blocking: b red
    edge("e2", "a", "d", { isBlocking: false }), // soft: d amber
    edge("e3", "b", "e"), // blocking: carries red
    edge("e4", "d", "e", { isBlocking: false }), // soft: carries green
  ];
  const { nodeStates } = computeCascade(nodes, edges, 0);
  expect(nodeStates["d"].effectiveRag).toBe("amber");
  expect(nodeStates["e"].effectiveRag).toBe("red");
});

test("computeCascade terminates on a cycle and marks members red", () => {
  const nodes = [node("a"), node("b"), node("c")];
  const edges = [edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "c", "a")];
  const { nodeStates, cycles } = computeCascade(nodes, edges, 0);
  expect(cycles).toHaveLength(1);
  for (const id of ["a", "b", "c"]) {
    expect(nodeStates[id].effectiveRag).toBe("red");
    expect(nodeStates[id].reasons).toContain("cycle member");
  }
});

test("computeCascade flags overdue and negative-slack as amber sources", () => {
  const nodes = [node("a", { status: "in_progress", targetDate: 5 }), node("b")];
  const edges = [edge("e1", "a", "b", { slackDays: -3 })];
  const { nodeStates, edgeStates } = computeCascade(nodes, edges, 10);
  expect(nodeStates["a"].effectiveRag).toBe("amber"); // overdue: targetDate 5 < now 10
  expect(nodeStates["a"].reasons).toContain("overdue");
  expect(edgeStates["e1"].effectiveRag).toBe("amber"); // negative slack
  expect(edgeStates["e1"].reasons).toContain("negative slack (-3d)");
});

test("computeCascade shows a green edge as red when its provider is blocked", () => {
  const nodes = [node("a", { status: "blocked" }), node("b")];
  const edges = [edge("e1", "a", "b")]; // rag green, blocking
  const { edgeStates } = computeCascade(nodes, edges, 0);
  expect(edgeStates["e1"].effectiveRag).toBe("red");
  expect(edgeStates["e1"].reasons).toContain("provider at risk: a");
});
