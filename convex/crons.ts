import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Fridays 16:00 UTC. Use crons.cron (not the weekly helper), passing a
// FunctionReference — per Convex cron guidelines.
crons.cron("weekly digest", "0 16 * * 5", internal.digests.weeklyDigest, {});

export default crons;
