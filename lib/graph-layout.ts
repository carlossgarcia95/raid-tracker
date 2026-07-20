import Dagre from "@dagrejs/dagre";

// Node box size. Shared with DeliverableNode so dagre lays out with the same
// footprint the DOM actually renders.
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 64;

/**
 * Compute layered graph positions from the edge structure. Pure and
 * React-free. Returns a map of node id -> top-left {x, y} (dagre anchors at
 * center, so we shift by half the box to match React Flow's top-left anchor).
 * Positions are derived at render time and never persisted.
 */
export function layoutGraph(
  nodes: { id: string }[],
  edges: { source: string; target: string }[],
  direction: "LR" | "TB" = "LR",
): Record<string, { x: number; y: number }> {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 48, ranksep: 140 });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  Dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    positions[n.id] = {
      x: p.x - NODE_WIDTH / 2,
      y: p.y - NODE_HEIGHT / 2,
    };
  }
  return positions;
}
