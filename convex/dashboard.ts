import { query } from "./_generated/server";
import { loadActiveProgramGraph, toAnalysisGraph } from "./model/graphData";
import { computeCascade, downstreamReach } from "./model/graphAnalysis";
import { rollUp } from "./model/rollups";
import { riskScore } from "./model/derived";

// Program health roll-up. Reuses the SAME cascade the graph view runs
// (ADR-0006: all derived, nothing persisted), then aggregates via the pure
// rollUp helper. Single reactive query — no per-card fan-out.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const graph = await loadActiveProgramGraph(ctx);
    if (!graph) {
      return rollUp({
        program: null, deliverables: [], edgeRags: [], teams: [],
        downstreamCount: {}, cycleCount: 0, risks: [], issues: [], assumptions: [],
      });
    }
    const { program, teamById, deliverableById, edges: inProgramEdges } = graph;

    const { analysisNodes, analysisEdges, renderEdges } = toAnalysisGraph(
      deliverableById,
      inProgramEdges,
    );
    const { nodeStates, edgeStates, cycles } = computeCascade(
      analysisNodes,
      analysisEdges,
      Date.now(),
    );
    const downstreamCount = downstreamReach(analysisNodes, analysisEdges);

    const deliverables = [...deliverableById.values()].map((d) => ({
      id: d._id,
      title: d.title,
      owningTeamId: d.owningTeamId,
      effectiveRag: nodeStates[d._id]?.effectiveRag ?? "green",
      reasons: nodeStates[d._id]?.reasons ?? [],
    }));
    const edgeRags = renderEdges.map((e) => edgeStates[e._id]?.effectiveRag ?? e.rag);
    const teams = [...teamById.values()].map((t) => ({
      id: t._id, name: t.name, color: t.color,
    }));

    const riskDocs = await ctx.db
      .query("risks")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    const risks = riskDocs.map((r) => ({
      score: riskScore(r.probability, r.impact),
      status: r.status,
      title: r.title,
      teamName: teamById.get(r.owningTeamId)?.name ?? "—",
    }));

    const issueDocs = await ctx.db
      .query("issues")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    const issues = issueDocs.map((i) => ({ status: i.status, severity: i.severity }));

    const assumptionDocs = await ctx.db
      .query("assumptions")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    const assumptions = assumptionDocs.map((a) => ({ validationStatus: a.validationStatus }));

    return rollUp({
      program: { name: program.name, status: program.status },
      deliverables,
      edgeRags,
      teams,
      downstreamCount,
      cycleCount: cycles.length,
      risks,
      issues,
      assumptions,
    });
  },
});
