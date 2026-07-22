import { query } from "./_generated/server";
import { slackDays } from "./model/derived";
import { loadActiveProgramGraph, toAnalysisGraph } from "./model/graphData";
import { computeCascade } from "./model/graphAnalysis";

// Deliverable graph NODES + dependency graph EDGES for the active program,
// shaped for React Flow (source = provider, target = consumer), enriched with
// cascade-adjusted RAG + reasons and the program's dependency cycles. Every
// derived value is computed here and never persisted (ADR-0006).
export const get = query({
  args: {},
  handler: async (ctx) => {
    const graph = await loadActiveProgramGraph(ctx);
    if (!graph) return { nodes: [], edges: [], cycles: [] };
    const { teamById, deliverableById, edges: inProgramEdges } = graph;

    const deliverables = [...deliverableById.values()];
    const { analysisNodes, analysisEdges, renderEdges } = toAnalysisGraph(
      deliverableById,
      inProgramEdges,
    );

    const { nodeStates, edgeStates, cycles } = computeCascade(
      analysisNodes,
      analysisEdges,
      Date.now(),
    );

    const nodes = deliverables.map((d) => {
      const team = teamById.get(d.owningTeamId);
      const state = nodeStates[d._id];
      return {
        id: d._id,
        title: d.title,
        status: d.status,
        teamName: team?.name ?? "—",
        teamColor: team?.color ?? "#94a3b8",
        effectiveRag: state?.effectiveRag ?? "green",
        reasons: state?.reasons ?? [],
      };
    });

    const edges = renderEdges.map((e) => {
      const state = edgeStates[e._id];
      return {
        id: e._id,
        source: e.providerDeliverableId,
        target: e.consumerDeliverableId,
        rag: e.rag,
        effectiveRag: state?.effectiveRag ?? e.rag,
        reasons: state?.reasons ?? [],
        neededByDate: e.neededByDate,
        committedDate: e.committedDate,
        slackDays: slackDays(e.neededByDate, e.committedDate),
        description: e.description,
      };
    });

    return { nodes, edges, cycles };
  },
});
