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

export type ItemState = { effectiveRag: Severity; reasons: string[] };

export type CascadeResult = {
  nodeStates: Record<string, ItemState>;
  edgeStates: Record<string, ItemState>;
  cycles: Cycle[];
};

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export function computeCascade(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  now: number,
): CascadeResult {
  const { RANK, maxSev, soften } = _sev;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const cycles = detectCycles(nodes, edges);
  const cycleMembers = new Set(cycles.flatMap((c) => c.deliverableIds));

  // Intrinsic (self) severities.
  const nodeIntrinsic = new Map<string, Severity>();
  const nodeReasons = new Map<string, string[]>();
  for (const n of nodes) {
    let sev: Severity = "green";
    const reasons: string[] = [];
    if (n.status === "blocked") {
      sev = "red";
      reasons.push("blocked");
    }
    if (cycleMembers.has(n.id)) {
      sev = "red";
      reasons.push("cycle member");
    }
    if (n.status !== "done" && n.targetDate !== undefined && n.targetDate < now) {
      sev = maxSev(sev, "amber");
      reasons.push("overdue");
    }
    nodeIntrinsic.set(n.id, sev);
    nodeReasons.set(n.id, reasons);
  }

  const edgeIntrinsic = new Map<string, Severity>();
  const edgeReasons = new Map<string, string[]>();
  for (const e of edges) {
    let sev: Severity = "green";
    const reasons: string[] = [];
    if (e.rag === "red") {
      sev = "red";
      reasons.push("manually red");
    } else if (e.rag === "amber") {
      sev = maxSev(sev, "amber");
      reasons.push("manually amber");
    }
    if (e.slackDays !== null && e.slackDays < 0) {
      sev = maxSev(sev, "amber");
      reasons.push(`negative slack (${e.slackDays}d)`);
    }
    edgeIntrinsic.set(e.id, sev);
    edgeReasons.set(e.id, reasons);
  }

  // Fixpoint over node severities. Severities only rise and are capped at red,
  // so this terminates even when the graph has cycles.
  const nodeSev = new Map(nodeIntrinsic);
  const transmitted = (e: AnalysisEdge): Severity => {
    const carried = maxSev(nodeSev.get(e.source) ?? "green", edgeIntrinsic.get(e.id)!);
    return e.isBlocking ? carried : soften(carried);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      const t = transmitted(e);
      const cur = nodeSev.get(e.target) ?? "green";
      if (RANK[t] > RANK[cur]) {
        nodeSev.set(e.target, t);
        changed = true;
      }
    }
  }

  const incoming = new Map<string, AnalysisEdge[]>();
  for (const n of nodes) incoming.set(n.id, []);
  for (const e of edges) incoming.get(e.target)?.push(e);

  const nodeStates: Record<string, ItemState> = {};
  for (const n of nodes) {
    const reasons = [...(nodeReasons.get(n.id) ?? [])];
    for (const e of incoming.get(n.id) ?? []) {
      if (RANK[transmitted(e)] > 0) {
        reasons.push(`depends on at-risk: ${nodeById.get(e.source)?.title ?? e.source}`);
      }
    }
    nodeStates[n.id] = { effectiveRag: nodeSev.get(n.id)!, reasons: uniq(reasons) };
  }

  const edgeStates: Record<string, ItemState> = {};
  for (const e of edges) {
    const providerSev = nodeSev.get(e.source) ?? "green";
    const softenedProvider = e.isBlocking ? providerSev : soften(providerSev);
    const effectiveRag = maxSev(edgeIntrinsic.get(e.id)!, softenedProvider);
    const reasons = [...(edgeReasons.get(e.id) ?? [])];
    if (RANK[providerSev] > 0) {
      reasons.push(`provider at risk: ${nodeById.get(e.source)?.title ?? e.source}`);
    }
    edgeStates[e.id] = { effectiveRag, reasons: uniq(reasons) };
  }

  return { nodeStates, edgeStates, cycles };
}

// Blast radius as SETS: for each node, the DISTINCT downstream deliverable ids
// reachable via BLOCKING edges. Non-blocking edges don't propagate a hard slip.
// Iterative DFS with a visited set — terminates on cycles; the start node is
// never included in its own downstream set.
export function downstreamReachSets(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
): Record<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!e.isBlocking) continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  const result: Record<string, string[]> = {};
  for (const n of nodes) {
    const seen = new Set<string>();
    const stack = [...(adj.get(n.id) ?? [])];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === n.id || seen.has(cur)) continue;
      seen.add(cur);
      for (const next of adj.get(cur) ?? []) stack.push(next);
    }
    result[n.id] = [...seen];
  }
  return result;
}

// Count form: distinct downstream deliverables per node. Derived from the sets
// so the traversal lives in exactly one place.
export function downstreamReach(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
): Record<string, number> {
  const sets = downstreamReachSets(nodes, edges);
  const result: Record<string, number> = {};
  for (const id in sets) result[id] = sets[id].length;
  return result;
}
