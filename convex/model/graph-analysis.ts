// Pure graph analysis — cycle detection + cascade propagation. No Convex ctx,
// so these unit-test in isolation (ADR-0004). Nothing here is persisted (ADR-0006).

export type Severity = "green" | "amber" | "red";

export type AnalysisNode = {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "done";
  targetDate?: number;
};

// source = provider deliverable, target = consumer deliverable.
export type AnalysisEdge = {
  id: string;
  source: string;
  target: string;
  rag: Severity;
  isBlocking: boolean;
  slackDays: number | null;
};

export type Cycle = { deliverableIds: string[]; edgeIds: string[] };

const RANK: Record<Severity, number> = { green: 0, amber: 1, red: 2 };
const maxSev = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);
// A non-blocking edge softens the risk that crosses it by one level.
const soften = (s: Severity): Severity => (s === "red" ? "amber" : "green");

// Standard white/grey/black DFS. A back-edge (to a grey node still on the
// current path) closes a cycle; we recover its members from the path stack.
export function detectCycles(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
): Cycle[] {
  const out = new Map<string, AnalysisEdge[]>();
  for (const n of nodes) out.set(n.id, []);
  for (const e of edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e);
  }

  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of out.keys()) color.set(id, WHITE);

  const cycles: Cycle[] = [];
  const seen = new Set<string>();
  const pathNodes: string[] = [];
  const pathEdges: (AnalysisEdge | null)[] = []; // edge used to enter pathNodes[i]

  const visit = (u: string, via: AnalysisEdge | null): void => {
    color.set(u, GREY);
    pathNodes.push(u);
    pathEdges.push(via);

    for (const e of out.get(u) ?? []) {
      const v = e.target;
      if (!color.has(v)) continue;
      if (color.get(v) === GREY) {
        const start = pathNodes.indexOf(v);
        const cycleNodes = pathNodes.slice(start);
        const cycleEdges = pathEdges
          .slice(start + 1)
          .filter((x): x is AnalysisEdge => x !== null);
        cycleEdges.push(e);
        const key = [...cycleNodes].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push({
            deliverableIds: cycleNodes,
            edgeIds: cycleEdges.map((x) => x.id),
          });
        }
      } else if (color.get(v) === WHITE) {
        visit(v, e);
      }
    }

    color.set(u, BLACK);
    pathNodes.pop();
    pathEdges.pop();
  };

  for (const id of out.keys()) {
    if (color.get(id) === WHITE) visit(id, null);
  }
  return cycles;
}

// Helpers exported for computeCascade (Task 2) in the same file.
export const _sev = { RANK, maxSev, soften };
