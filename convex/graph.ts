import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";
import { slackDays } from "./model/derived";
import { Id } from "./_generated/dataModel";

// Deliverable graph NODES + dependency graph EDGES for the active program,
// shaped for React Flow (source = provider, target = consumer). Derived values
// (slackDays, and layout positions on the client) are never stored.
export const get = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return { nodes: [], edges: [] };

    const teams = await ctx.db.query("teams").take(500);
    const teamById = new Map(teams.map((t) => [t._id, t]));

    const deliverables = await ctx.db
      .query("deliverables")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    const deliverableById = new Map(deliverables.map((d) => [d._id, d]));

    const nodes = deliverables.map((d) => {
      const team = teamById.get(d.owningTeamId);
      return {
        id: d._id,
        title: d.title,
        status: d.status,
        teamName: team?.name ?? "—",
        teamColor: team?.color ?? "#94a3b8",
      };
    });

    const nameFor = (id: Id<"deliverables">) => {
      const d = deliverableById.get(id);
      const team = d ? teamById.get(d.owningTeamId) : undefined;
      return { title: d?.title ?? "—", teamName: team?.name ?? "—" };
    };

    const allEdges = await ctx.db.query("dependencies").take(1000);
    const edges = allEdges
      // Keep only edges whose BOTH endpoints are nodes we render — a dangling
      // endpoint would make React Flow throw.
      .filter(
        (e) =>
          deliverableById.has(e.providerDeliverableId) &&
          deliverableById.has(e.consumerDeliverableId),
      )
      .map((e) => {
        const p = nameFor(e.providerDeliverableId);
        const c = nameFor(e.consumerDeliverableId);
        return {
          id: e._id,
          source: e.providerDeliverableId,
          target: e.consumerDeliverableId,
          rag: e.rag,
          isBlocking: e.isBlocking,
          neededByDate: e.neededByDate,
          committedDate: e.committedDate,
          slackDays: slackDays(e.neededByDate, e.committedDate),
          description: e.description,
          providerTitle: p.title,
          providerTeamName: p.teamName,
          consumerTitle: c.title,
          consumerTeamName: c.teamName,
        };
      });

    return { nodes, edges };
  },
});
