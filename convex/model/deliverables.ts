import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Delete a deliverable and every dependency edge that references it, in one
 * transaction. Convex has no foreign keys — skipping this orphans edges and
 * breaks the graph render (see CLAUDE.md invariants).
 */
export async function deleteDeliverableCascade(
  ctx: MutationCtx,
  deliverableId: Id<"deliverables">,
): Promise<void> {
  const outbound = await ctx.db
    .query("dependencies")
    .withIndex("by_provider", (q) => q.eq("providerDeliverableId", deliverableId))
    .collect();
  const inbound = await ctx.db
    .query("dependencies")
    .withIndex("by_consumer", (q) => q.eq("consumerDeliverableId", deliverableId))
    .collect();
  const edges = new Map([...outbound, ...inbound].map((e) => [e._id, e]));
  for (const edge of edges.values()) {
    await ctx.db.delete(edge._id);
  }
  await ctx.db.delete(deliverableId);
}
