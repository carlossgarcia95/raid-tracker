import { query } from "./_generated/server";
import { loadActiveProgramGraph } from "./model/graph-data";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const graph = await loadActiveProgramGraph(ctx);
    if (!graph) return [];
    const { teamById, deliverableById } = graph;

    return [...deliverableById.values()].map((d) => {
      const team = teamById.get(d.owningTeamId);
      return {
        _id: d._id,
        _creationTime: d._creationTime,
        title: d.title,
        description: d.description,
        status: d.status,
        targetDate: d.targetDate,
        actualDate: d.actualDate,
        teamName: team?.name ?? "—",
        teamColor: team?.color ?? "#94a3b8",
      };
    });
  },
});
