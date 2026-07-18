import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";
import { slackDays } from "./model/derived";
import { Id } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return [];

    const teams = await ctx.db.query("teams").take(500);
    const teamById = new Map(teams.map((t) => [t._id, t]));

    const deliverables = await ctx.db
      .query("deliverables")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    const deliverableById = new Map(deliverables.map((d) => [d._id, d]));

    const edges = await ctx.db.query("dependencies").take(500);
    const inProgram = edges.filter((e) => deliverableById.has(e.providerDeliverableId));

    const teamName = (deliverableId: Id<"deliverables">) => {
      const d = deliverableById.get(deliverableId);
      const team = d ? teamById.get(d.owningTeamId) : undefined;
      return team?.name ?? "—";
    };
    const title = (deliverableId: Id<"deliverables">) =>
      deliverableById.get(deliverableId)?.title ?? "—";

    return inProgram.map((e) => ({
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
