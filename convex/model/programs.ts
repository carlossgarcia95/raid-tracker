import { QueryCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

/**
 * The app scopes to a single demo program. Resolve it once, here, so every
 * list query shares the same definition of "the active program".
 */
export async function getActiveProgram(
  ctx: QueryCtx,
): Promise<Doc<"programs"> | null> {
  return await ctx.db.query("programs").first();
}
