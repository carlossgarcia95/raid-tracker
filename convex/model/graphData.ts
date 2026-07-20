import { QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getActiveProgram } from "./programs";

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
