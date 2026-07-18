import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";
import { riskScore } from "./model/derived";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const program = await getActiveProgram(ctx);
    if (!program) return [];
    const teams = await ctx.db.query("teams").take(500);
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const risks = await ctx.db
      .query("risks")
      .withIndex("by_program", (q) => q.eq("programId", program._id))
      .take(500);
    return risks.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      title: r.title,
      description: r.description,
      probability: r.probability,
      impact: r.impact,
      score: riskScore(r.probability, r.impact),
      mitigation: r.mitigation,
      ownerName: r.ownerName,
      status: r.status,
      teamName: teamById.get(r.owningTeamId)?.name ?? "—",
    }));
  },
});
