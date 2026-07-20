import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { slackDays } from "./model/derived";
import { loadActiveProgramGraph } from "./model/graph-data";

const rag = v.union(v.literal("green"), v.literal("amber"), v.literal("red"));

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

export const setRag = mutation({
  args: { id: v.id("dependencies"), rag },
  handler: async (ctx, { id, rag: next }) => {
    const doc = await ctx.db.get(id);
    if (!doc) throw new Error("Dependency not found");
    if (doc.rag === next) return null;

    await ctx.db.patch(id, { rag: next });
    await ctx.db.insert("statusChanges", {
      entityType: "dependency",
      entityId: id,
      field: "rag",
      oldValue: doc.rag,
      newValue: next,
    });
    return null;
  },
});
