import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return [];
    const assumptions = await ctx.db
      .query("assumptions")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    return assumptions.map((a) => ({
      _id: a._id,
      _creationTime: a._creationTime,
      title: a.title,
      description: a.description,
      validationStatus: a.validationStatus,
      validateByDate: a.validateByDate,
      ownerName: a.ownerName,
    }));
  },
});
