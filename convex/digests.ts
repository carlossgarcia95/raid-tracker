import { mutation, internalMutation, query } from "./_generated/server";
import { runDigest } from "./model/digest";

// Public: called by the "Generate now" button. Date.now() is allowed in mutations.
export const generateNow = mutation({
  args: {},
  handler: async (ctx) => {
    await runDigest(ctx, Date.now());
    return null;
  },
});

// Internal: the Friday cron target.
export const weeklyDigest = internalMutation({
  args: {},
  handler: async (ctx) => {
    await runDigest(ctx, Date.now());
    return null;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("digests").collect();
    return rows.sort((a, b) => b.periodEnd - a.periodEnd);
  },
});

export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("digests").collect();
    if (rows.length === 0) return null;
    return rows.sort((a, b) => b.periodEnd - a.periodEnd)[0];
  },
});
