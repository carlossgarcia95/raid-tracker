import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { loadActiveProgramGraph } from "./model/graph-data";

const deliverableStatus = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
);

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

export const setStatus = mutation({
  args: { id: v.id("deliverables"), status: deliverableStatus },
  handler: async (ctx, { id, status }) => {
    const doc = await ctx.db.get(id);
    if (!doc) throw new Error("Deliverable not found");
    if (doc.status === status) return null;

    // actualDate mirrors the seed convention: set on entering done, cleared on leaving.
    const actualDate =
      status === "done" ? Date.now() : doc.status === "done" ? undefined : doc.actualDate;

    await ctx.db.patch(id, { status, actualDate });
    await ctx.db.insert("statusChanges", {
      entityType: "deliverable",
      entityId: id,
      field: "status",
      oldValue: doc.status,
      newValue: status,
    });
    return null;
  },
});
