// @vitest-environment node
import { describe, expect, it } from "vitest";
import { layoutGraph, NODE_WIDTH, NODE_HEIGHT } from "./graph-layout";

describe("layoutGraph", () => {
  it("assigns a numeric position to every node", () => {
    const pos = layoutGraph(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
    );
    for (const id of ["a", "b", "c"]) {
      expect(typeof pos[id].x).toBe("number");
      expect(typeof pos[id].y).toBe("number");
      expect(Number.isFinite(pos[id].x)).toBe(true);
    }
  });

  it("places a provider left of its consumer in LR direction", () => {
    const pos = layoutGraph(
      [{ id: "provider" }, { id: "consumer" }],
      [{ source: "provider", target: "consumer" }],
      "LR",
    );
    expect(pos.provider.x).toBeLessThan(pos.consumer.x);
  });

  it("exports positive node dimensions", () => {
    expect(NODE_WIDTH).toBeGreaterThan(0);
    expect(NODE_HEIGHT).toBeGreaterThan(0);
  });
});
