// Pure transitive reachability over a dependency edge list, used by the graph
// inspector to show a node's full upstream / downstream blast radius. Cycle-safe.

export type TraverseEdge = { source: string; target: string };

function reachable(
  start: string,
  edges: TraverseEdge[],
  next: (e: TraverseEdge) => { from: string; to: string },
): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const { from, to } = next(e);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const u = stack.pop()!;
    for (const v of adj.get(u) ?? []) {
      if (v !== start && !seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return seen;
}

export function downstreamOf(id: string, edges: TraverseEdge[]): Set<string> {
  return reachable(id, edges, (e) => ({ from: e.source, to: e.target }));
}

export function upstreamOf(id: string, edges: TraverseEdge[]): Set<string> {
  return reachable(id, edges, (e) => ({ from: e.target, to: e.source }));
}
