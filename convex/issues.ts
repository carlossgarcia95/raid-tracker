import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return [];
    const teams = await ctx.db.query("teams").take(500);
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    return issues.map((i) => ({
      _id: i._id,
      _creationTime: i._creationTime,
      title: i.title,
      description: i.description,
      severity: i.severity,
      status: i.status,
      resolution: i.resolution,
      raisedDate: i.raisedDate,
      resolvedDate: i.resolvedDate,
      teamName: teamById.get(i.owningTeamId)?.name ?? "—",
    }));
  },
});
