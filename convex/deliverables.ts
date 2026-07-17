import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";

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

    return deliverables.map((d) => {
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
