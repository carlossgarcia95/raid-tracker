import { QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getActiveProgram } from "./programs";
import { slackDays } from "./derived";
import type { AnalysisNode, AnalysisEdge } from "./graphAnalysis";

/**
 * Load the active program's graph in one place: its teams, deliverables (nodes)
 * and the dependency edges whose provider is in the program. Shared by the graph
 * query and the deliverable/dependency list queries so the join/index logic
 * lives once. Returns null when there is no active program.
 */
export async function loadActiveProgramGraph(ctx: QueryCtx): Promise<null | {
  program: Doc<"programs">;
  teamById: Map<Id<"teams">, Doc<"teams">>;
  deliverableById: Map<Id<"deliverables">, Doc<"deliverables">>;
  edges: Doc<"dependencies">[];
}> {
  const program = await getActiveProgram(ctx);
  if (!program) return null;

  const teams = await ctx.db.query("teams").take(500);
  const teamById = new Map(teams.map((t) => [t._id, t]));

  const deliverables = await ctx.db
    .query("deliverables")
    .withIndex("by_program", (q) => q.eq("programId", program._id))
    .take(500);
  const deliverableById = new Map(deliverables.map((d) => [d._id, d]));

  const allEdges = await ctx.db.query("dependencies").take(1000);
  const edges = allEdges.filter((e) => deliverableById.has(e.providerDeliverableId));

  return { program, teamById, deliverableById, edges };
}

/**
 * Build the pure-analysis node/edge arrays (and the renderable edge subset) from
 * a loaded program graph. Shared by graph.get and dashboard.get so the shaping
 * logic — including the "both endpoints in-program" edge filter React Flow needs
 * — lives once. Every value here is derived, never persisted.
 */
export function toAnalysisGraph(
  deliverableById: Map<Id<"deliverables">, Doc<"deliverables">>,
  edges: Doc<"dependencies">[],
): {
  analysisNodes: AnalysisNode[];
  analysisEdges: AnalysisEdge[];
  renderEdges: Doc<"dependencies">[];
} {
  const renderEdges = edges.filter(
    (e) =>
      deliverableById.has(e.providerDeliverableId) &&
      deliverableById.has(e.consumerDeliverableId),
  );
  const analysisNodes: AnalysisNode[] = [...deliverableById.values()].map((d) => ({
    id: d._id,
    title: d.title,
    status: d.status,
    targetDate: d.targetDate,
  }));
  const analysisEdges: AnalysisEdge[] = renderEdges.map((e) => ({
    id: e._id,
    source: e.providerDeliverableId,
    target: e.consumerDeliverableId,
    rag: e.rag,
    isBlocking: e.isBlocking,
    slackDays: slackDays(e.neededByDate, e.committedDate),
  }));
  return { analysisNodes, analysisEdges, renderEdges };
}
