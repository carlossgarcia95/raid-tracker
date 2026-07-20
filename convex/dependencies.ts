import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { slackDays } from "./model/derived";
import { loadActiveProgramGraph } from "./model/graph-data";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const graph = await loadActiveProgramGraph(ctx);
    if (!graph) return [];
    const { teamById, deliverableById, edges } = graph;

    const teamName = (deliverableId: Id<"deliverables">) => {
      const d = deliverableById.get(deliverableId);
      const team = d ? teamById.get(d.owningTeamId) : undefined;
      return team?.name ?? "—";
    };
    const title = (deliverableId: Id<"deliverables">) =>
      deliverableById.get(deliverableId)?.title ?? "—";

    return edges.map((e) => ({
      _id: e._id,
      _creationTime: e._creationTime,
      description: e.description,
      neededByDate: e.neededByDate,
      committedDate: e.committedDate,
      rag: e.rag,
      isBlocking: e.isBlocking,
      slackDays: slackDays(e.neededByDate, e.committedDate),
      providerTitle: title(e.providerDeliverableId),
      providerTeamName: teamName(e.providerDeliverableId),
      consumerTitle: title(e.consumerDeliverableId),
      consumerTeamName: teamName(e.consumerDeliverableId),
    }));
  },
});
