import { query } from "./_generated/server";
import { getActiveProgram } from "./model/programs";

export const getActive = query({
  args: {},
  handler: async (ctx) => await getActiveProgram(ctx),
});
